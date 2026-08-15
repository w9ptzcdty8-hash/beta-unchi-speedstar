// ========================================
// うんちスピードスター - Cloud Functions
// ========================================
//
// このファイルはGitHub Pagesにはデプロイしません。
// `firebase deploy --only functions` でFirebase側に別途デプロイする、
// フロントエンドとは異なる実行環境（Node.js）のコードです。
//
// 前提: functions/package.json に "firebase-functions" と
// "firebase-admin" を依存関係として追加しておいてください。
//
//   cd functions
//   npm install firebase-functions firebase-admin
//
// デプロイ:
//   firebase deploy --only functions
//
// 注意（実装メモ）:
// 本実装は「ルームの人数が揃ったら自動開始」「タップの早い者勝ち判定」
// 「難易度のランダム変更」「5点先取での勝利判定」を、Realtime Database の
// トリガー関数だけで完結させるシンプルな設計にしています。
// 本番の大規模運用ではより厳密な排他制御（例:トランザクションの粒度を
// 増やす）が必要になる場合がありますが、ここではミニゲームとして
// 十分な精度を優先しています。

const { initializeApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");
const { onValueWritten, onValueCreated } = require("firebase-functions/v2/database");
const { logger } = require("firebase-functions");

initializeApp();
const db = getDatabase();

// ========================================
// 定数（フロントエンド script.js と必ず一致させること）
// ========================================

const CORRECT_WORD = "うんち";

const FAKE_WORDS = [
    "らんち",
    "うんちょ",
    "うんちん",
    "うんつ",
    "うんちー",
    "うんちっ",
    "うんちまん",
    "うんちょす",
    "うんちんぐ",
    "うんちょる",
    "うんちょん"
];

// フェイク単語 + 正解「うんち」を末尾に追加（script.jsのALL_WORDSと同一の並び）
const ALL_WORDS = [...FAKE_WORDS, CORRECT_WORD];
const CORRECT_WORD_INDEX = ALL_WORDS.length - 1;

const DIFFICULTY_SETTINGS = {
    1: { min: 1500, max: 2200, fakeRate: 0.20 },
    2: { min: 1000, max: 2200, fakeRate: 0.35 },
    3: { min: 600, max: 2200, fakeRate: 0.50 },
    4: { min: 300, max: 2200, fakeRate: 0.70 }
};

const WIN_SCORE = 5;
const NEXT_ROUND_DELAY_MS = 1200; // 得点後、次のラウンドを始めるまでの待ち時間

// ========================================
// ユーティリティ
// ========================================

function randomDifficultyLevel() {
    return Math.floor(Math.random() * 4) + 1; // 1〜4
}

function pickWordIndex(difficultyLevel) {
    const settings = DIFFICULTY_SETTINGS[difficultyLevel];
    const isFake = Math.random() < settings.fakeRate;
    if (!isFake) return CORRECT_WORD_INDEX;
    return Math.floor(Math.random() * FAKE_WORDS.length);
}

function pickInterval(difficultyLevel) {
    const settings = DIFFICULTY_SETTINGS[difficultyLevel];
    return Math.floor(settings.min + Math.random() * (settings.max - settings.min));
}

function makeRoundId() {
    return `r_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

/**
 * 新しいラウンドを開始する（difficultyLevel・単語・表示間隔をランダム決定して書き込む）
 */
async function startNewRound(roomId) {
    const difficultyLevel = randomDifficultyLevel();
    const currentWordIndex = pickWordIndex(difficultyLevel);
    const nextInterval = pickInterval(difficultyLevel);

    await db.ref(`rooms/${roomId}/round`).set({
        roundId: makeRoundId(),
        difficultyLevel,
        currentWordIndex,
        nextInterval,
        startedAt: Date.now()
    });
}

// ========================================
// トリガー1: プレイヤー人数が揃ったら自動でゲーム開始
// ========================================

exports.onPlayersChanged = onValueWritten("/rooms/{roomId}/players", async (event) => {
    const roomId = event.params.roomId;

    const roomSnap = await db.ref(`rooms/${roomId}`).get();
    const room = roomSnap.val();
    if (!room || room.state !== "waiting") return;

    const playersSnap = await db.ref(`rooms/${roomId}/players`).get();
    const players = playersSnap.val() || {};
    const count = Object.keys(players).length;

    if (count >= room.maxPlayers) {
        // 二重起動防止：トランザクションでstateを一度だけ"playing"に変更する
        const result = await db.ref(`rooms/${roomId}/state`).transaction((current) => {
            if (current === "waiting") return "playing";
            return; // 何もしない（abort）
        });

        if (result.committed) {
            await db.ref(`rooms/${roomId}/playerCount`).set(count);
            await startNewRound(roomId);
            logger.info(`Room ${roomId} started with ${count} players`);
        }
    }
});

// ========================================
// トリガー2: タップを受信したら判定する
// ========================================

exports.onTapCreated = onValueCreated(
    "/rooms/{roomId}/rounds/{roundId}/taps/{playerId}",
    async (event) => {
        const { roomId, roundId, playerId } = event.params;
        const tap = event.data.val();

        const roundSnap = await db.ref(`rooms/${roomId}/round`).get();
        const round = roundSnap.val();
        if (!round || round.roundId !== roundId) {
            // すでに次のラウンドに進んでいる（古いラウンドへの遅延タップ）
            return;
        }

        const isCorrectTap = tap.tapWordIndex === CORRECT_WORD_INDEX;

        if (!isCorrectTap) {
            // 誤タップ：−1点（早いもの勝ち判定には参加しない）
            await db.ref(`rooms/${roomId}/players/${playerId}/score`).transaction(
                (current) => (current || 0) - 1
            );
            return;
        }

        // 正解タップ：このラウンドで最初に処理された正解タップのみを勝者とする
        // （Realtime Databaseのトランザクションで排他制御し、複数クライアントの
        //  同時タップでも一人だけが+1点になるようにする）
        const winnerResult = await db
            .ref(`rooms/${roomId}/round/winnerPlayerId`)
            .transaction((current) => {
                if (current) return; // 既に勝者が決まっている → abort
                return playerId;
            });

        if (!winnerResult.committed) {
            // 自分より先に他のプレイヤーが正解と判定された
            return;
        }

        // 勝者確定：スコア加算
        const scoreResult = await db
            .ref(`rooms/${roomId}/players/${playerId}/score`)
            .transaction((current) => (current || 0) + 1);

        const newScore = scoreResult.snapshot.val();

        if (newScore >= WIN_SCORE) {
            await db.ref(`rooms/${roomId}/state`).set("finished");
            await db.ref(`rooms/${roomId}/winner`).set(playerId);
            logger.info(`Room ${roomId} finished. Winner: ${playerId}`);
            return;
        }

        // 次のラウンドを少し間を置いてから開始する
        await new Promise((resolve) => setTimeout(resolve, NEXT_ROUND_DELAY_MS));
        await startNewRound(roomId);
    }
);

// ========================================
// トリガー3（任意）: 全員退出したルームを削除する
// ========================================

exports.onPlayersEmptyCleanup = onValueWritten("/rooms/{roomId}/players", async (event) => {
    const roomId = event.params.roomId;
    const playersSnap = await db.ref(`rooms/${roomId}/players`).get();
    const players = playersSnap.val();

    if (!players || Object.keys(players).length === 0) {
        await db.ref(`rooms/${roomId}`).remove();
        logger.info(`Room ${roomId} removed (empty)`);
    }
});
