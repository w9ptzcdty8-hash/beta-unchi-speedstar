// ========================================
// うんちスピードスター
// Main JavaScript (ES Module)
// ========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
    getDatabase,
    ref,
    set,
    get,
    remove,
    onValue,
    off,
    runTransaction,
    onDisconnect,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js";

// ========================================
// Firebase設定
// ========================================
const firebaseConfig = {
  apiKey: "AIzaSyCHcw78cImehf65vogNXPyxm2C4LpJlciU",
  authDomain: "unch-speedstar.firebaseapp.com",
  databaseURL: "https://unch-speedstar-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "unch-speedstar",
  storageBucket: "unch-speedstar.firebasestorage.app",
  messagingSenderId: "158427272547",
  appId: "1:158427272547:web:97ab36d4ef3b7681f3ef56",
  measurementId: "G-PZ75BED8KQ"
};

let firebaseApp = null;
let db = null;
let firebaseReady = false;

try {
    firebaseApp = initializeApp(firebaseConfig);
    db = getDatabase(firebaseApp);
    firebaseReady = true;
} catch (err) {
    console.warn("Firebase初期化に失敗しました（設定値を確認してください）", err);
    firebaseReady = false;
}

// ========================================
// 定数：単語リスト・難易度設定
// ========================================

const CORRECT_WORD = "うんち";

const FAKE_WORDS = [
    "らんち", "ぱんち", "むんち", "ぷんち", "るんち", "うんつ", "うんぢ", "うんと",
    "うんば", "うんま", "うんみ", "うんゆ", "うんり", "うんぎ", "うんご", "うんぷ",
    "うんむ", "うんく", "うんす", "うんこ", "うんて", "うんちく", "うんちゃん",
    "うんち〜", "うんしょう", "うんけい", "うんそう", "うんめい", "うんにょ", "うんどう",
    "うんちん", "うんかい", "うんが", "うんぜん", "うんてん", "うんねん", "うんぽん",
    "うんすい", "うんがく", "うんてんし", "うんぴ", "うんちっち", "うんちー", "うんちや", "うんちよ"
];

const UNIQUE_FAKE_WORDS = Array.from(new Set(FAKE_WORDS)).filter(w => w !== CORRECT_WORD);
const ALL_WORDS = UNIQUE_FAKE_WORDS.concat([CORRECT_WORD]);
const CORRECT_WORD_INDEX = ALL_WORDS.length - 1;

const DIFFICULTY_SETTINGS = {
    1: { name: "EASY", min: 1300, max: 1300, fakeRate: 0.20 },
    2: { name: "NORMAL", min: 800, max: 1300, fakeRate: 0.35 },
    3: { name: "HARD", min: 400, max: 1300, fakeRate: 0.50 },
    4: { name: "CHAOS", min: 200, max: 1300, fakeRate: 0.70 }
};

const SINGLE_LEVEL_PROGRESSION = [1, 1, 2, 3, 4];
const MISS_PENALTY_MS = 500;
const LOCAL_HIGHSCORE_KEY = "unchiSpeedstar_highscore_ms";

const ANIMATION_CLASSES = [
    "anim-pop",
    "anim-slide-left",
    "anim-slide-right",
    "anim-fade-blur",
    "anim-rotate-tilt"
];

// ========================================
// 効果音
// ========================================

const sounds = {
    word: new Audio("assets/sounds/word.mp3"),
    correct: new Audio("assets/sounds/correct.mp3"),
    miss: new Audio("assets/sounds/miss.mp3"),
    win: new Audio("assets/sounds/win.mp3"),
    highscore: new Audio("assets/sounds/highscore.mp3")
};

function playSound(key) {
    const src = sounds[key];
    if (!src) return;
    try {
        src.currentTime = 0;
        src.play().catch(() => {});
    } catch (err) {}
}

// ========================================
// DOM参照
// ========================================

const screens = {
    title: document.getElementById("screen-title"),
    single: document.getElementById("screen-single"),
    singleResult: document.getElementById("screen-single-result"),
    multiSetup: document.getElementById("screen-multi-setup"),
    roomWait: document.getElementById("screen-room-wait"),
    multiPlay: document.getElementById("screen-multi-play"),
    multiResult: document.getElementById("screen-multi-result"),
    highscore: document.getElementById("screen-highscore")
};

function showScreen(key) {
    Object.values(screens).forEach((el) => el.classList.remove("is-active"));
    screens[key].classList.add("is-active");
}

// ========================================
// 共通ユーティリティ
// ========================================

function randomPlayerName() {
    const n = Math.floor(Math.random() * 900) + 100;
    return `Player${n}`;
}

function randomRoomId() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let id = "";
    for (let i = 0; i < 6; i++) {
        id += chars[Math.floor(Math.random() * chars.length)];
    }
    return id;
}

function randomPlayerId() {
    return `p_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;
}

function formatSeconds(ms) {
    return (ms / 1000).toFixed(2) + "秒";
}

function resetFeedback(feedbackBadgeEl, stageEl) {
    if (feedbackBadgeEl) {
        feedbackBadgeEl.classList.remove("badge-good", "badge-bad");
        feedbackBadgeEl.textContent = "";
    }
    if (stageEl) {
        stageEl.classList.remove("shake-stage");
    }
}

function triggerFeedback(overlayEl, feedbackBadgeEl, stageEl, type) {
    overlayEl.classList.remove("flash-good", "flash-bad");
    void overlayEl.offsetWidth;
    overlayEl.classList.add(type === "good" ? "flash-good" : "flash-bad");
    window.setTimeout(() => {
        overlayEl.classList.remove("flash-good", "flash-bad");
    }, 220);

    if (feedbackBadgeEl) {
        feedbackBadgeEl.classList.remove("badge-good", "badge-bad");
        void feedbackBadgeEl.offsetWidth;
        if (type === "good") {
            feedbackBadgeEl.textContent = "〇";
            feedbackBadgeEl.classList.add("badge-good");
        } else {
            feedbackBadgeEl.textContent = "✕ お手つき！";
            feedbackBadgeEl.classList.add("badge-bad");
        }
    }

    if (type === "bad" && stageEl) {
        stageEl.classList.remove("shake-stage");
        void stageEl.offsetWidth;
        stageEl.classList.add("shake-stage");
    }
}

function pickWord(difficultyLevel) {
    const settings = DIFFICULTY_SETTINGS[difficultyLevel];
    const isFake = Math.random() < settings.fakeRate;
    if (!isFake) {
        return { word: CORRECT_WORD, isCorrect: true };
    }
    const fake = UNIQUE_FAKE_WORDS[Math.floor(Math.random() * UNIQUE_FAKE_WORDS.length)];
    return { word: fake, isCorrect: false };
}

function pickInterval(difficultyLevel) {
    const settings = DIFFICULTY_SETTINGS[difficultyLevel];
    return Math.floor(settings.min + Math.random() * (settings.max - settings.min));
}

function setWordTextWithAnimation(element, newText) {
    element.textContent = "";
    ANIMATION_CLASSES.forEach(cls => element.classList.remove(cls));

    if (!newText) return;

    void element.offsetWidth;
    element.textContent = newText;
    const animClass = ANIMATION_CLASSES[Math.floor(Math.random() * ANIMATION_CLASSES.length)];
    element.classList.add(animClass);
}

// ========================================
// ひとりであそぶ
// ========================================

const singleEls = {
    flash: document.getElementById("single-flash"),
    feedback: document.getElementById("single-feedback"),
    stage: document.getElementById("single-stage"),
    roundTimes: document.getElementById("single-round-times"),
    wordBlob: document.getElementById("single-word-blob"),
    wordText: document.getElementById("single-word-text"),
    totalTime: document.getElementById("single-total-time"),
    quitBtn: document.getElementById("btn-single-quit"),
    resultTotal: document.getElementById("single-result-total"),
    resultDetail: document.getElementById("single-result-detail"),
    resultNewRecord: document.getElementById("single-result-newrecord"),
    retryBtn: document.getElementById("btn-single-retry"),
    toTitleBtn: document.getElementById("btn-single-to-title")
};

let singleState = null;

function createSingleState() {
    return {
        roundIndex: 0,
        roundTimesMs: [0, 0, 0, 0, 0],
        roundMissCounts: [0, 0, 0, 0, 0],
        wordTimeoutId: null,
        wordStartedAt: 0,
        waitingForCorrectTap: false,
        wordIsActive: false,
        finished: false,
        isPaused: false // エフェクト表示3秒間は画面を停止させるフラグ
    };
}

function renderSingleRoundChips() {
    singleEls.roundTimes.innerHTML = "";
    for (let i = 0; i < 5; i++) {
        const chip = document.createElement("span");
        chip.className = "round-chip";
        if (i < singleState.roundIndex) {
            chip.classList.add("is-done");
            chip.textContent = `${i + 1}: ${formatSeconds(singleState.roundTimesMs[i])}`;
        } else if (i === singleState.roundIndex) {
            chip.classList.add("is-current");
            chip.textContent = `${i + 1}回目`;
        } else {
            chip.textContent = `${i + 1}`;
        }
        singleEls.roundTimes.appendChild(chip);
    }
}

function updateSingleTotalDisplay() {
    const doneTotal = singleState.roundTimesMs
        .slice(0, singleState.roundIndex)
        .reduce((a, b) => a + b, 0);
    singleEls.totalTime.textContent = `合計タイム：${formatSeconds(doneTotal)}`;
}

function startSinglePlay() {
    singleState = createSingleState();
    resetFeedback(singleEls.feedback, singleEls.stage);
    setWordTextWithAnimation(singleEls.wordText, "");
    renderSingleRoundChips();
    updateSingleTotalDisplay();
    showScreen("single");
    scheduleSingleWord();
}

function scheduleSingleWord() {
    if (!singleState || singleState.finished) return;

    const level = SINGLE_LEVEL_PROGRESSION[singleState.roundIndex];
    const interval = pickInterval(level);

    singleState.wordTimeoutId = window.setTimeout(() => {
        showSingleWord(level);
    }, interval);
}

function showSingleWord(level) {
    if (!singleState || singleState.finished) return;

    resetFeedback(singleEls.feedback, singleEls.stage);
    const { word, isCorrect } = pickWord(level);
    setWordTextWithAnimation(singleEls.wordText, word);

    singleState.wordIsActive = true;
    singleState.waitingForCorrectTap = isCorrect;
    if (isCorrect) {
        singleState.wordStartedAt = performance.now();
    }
    playSound("word");

    scheduleSingleWord();
}

function handleSingleTap() {
    if (!singleState || singleState.finished || singleState.isPaused) return;

    // ワードが出ていない時のタップもお手つきとして判定するため、状態を確認
    const isCorrectTap = singleState.wordIsActive && singleState.waitingForCorrectTap;

    singleState.isPaused = true;
    if (singleState.wordTimeoutId) {
        window.clearTimeout(singleState.wordTimeoutId);
        singleState.wordTimeoutId = null;
    }

    if (isCorrectTap) {
        // --- 正解 ---
        const reaction = performance.now() - singleState.wordStartedAt;
        const missPenalty = singleState.roundMissCounts[singleState.roundIndex] * MISS_PENALTY_MS;
        singleState.roundTimesMs[singleState.roundIndex] = reaction + missPenalty;

        playSound("correct");
        triggerFeedback(singleEls.flash, singleEls.feedback, singleEls.stage, "good");

        singleState.wordIsActive = false;
        singleState.waitingForCorrectTap = false;

        // 3秒間エフェクトとワードを維持してから次のラウンドへ
        window.setTimeout(() => {
            singleState.isPaused = false;
            resetFeedback(singleEls.feedback, singleEls.stage);
            setWordTextWithAnimation(singleEls.wordText, ""); // ここで文字を消す
            advanceSingleRound();
        }, 3000);
    } else {
        // --- お手つき（ワードが出ていない時含む） ---
        singleState.roundMissCounts[singleState.roundIndex] += 1;
        playSound("miss");
        triggerFeedback(singleEls.flash, singleEls.feedback, singleEls.stage, "bad");

        singleState.wordIsActive = false;
        singleState.waitingForCorrectTap = false;

        // 3秒ペナルティタイムとして画面を止め、その後単語出しを再開
        window.setTimeout(() => {
            singleState.isPaused = false;
            resetFeedback(singleEls.feedback, singleEls.stage);
            setWordTextWithAnimation(singleEls.wordText, ""); // ここで文字を消す
            scheduleSingleWord();
        }, 3000);
    }
}

function advanceSingleRound() {
    renderSingleRoundChips();
    updateSingleTotalDisplay();

    singleState.roundIndex += 1;

    if (singleState.roundIndex >= 5) {
        singleState.finished = true;
        finishSinglePlay();
        return;
    }

    scheduleSingleWord();
}

function getLocalHighscoreMs() {
    const raw = window.localStorage.getItem(LOCAL_HIGHSCORE_KEY);
    return raw ? parseFloat(raw) : null;
}

function setLocalHighscoreMs(ms) {
    window.localStorage.setItem(LOCAL_HIGHSCORE_KEY, String(ms));
}

function finishSinglePlay() {
    const totalMs = singleState.roundTimesMs.reduce((a, b) => a + b, 0);
    const previousBest = getLocalHighscoreMs();
    const isNewRecord = previousBest === null || totalMs < previousBest;

    playSound("win");

    if (isNewRecord) {
        setLocalHighscoreMs(totalMs);
        window.setTimeout(() => playSound("highscore"), 300);
        saveHighscoreToFirebase(totalMs).catch(() => {});
    }

    singleEls.resultNewRecord.classList.toggle("is-hidden", !isNewRecord);
    singleEls.resultTotal.textContent = formatSeconds(totalMs);
    singleEls.resultDetail.innerHTML = "";

    for (let i = 0; i < 5; i++) {
        const row = document.createElement("div");
        row.className = "result-row";
        const level = SINGLE_LEVEL_PROGRESSION[i];
        const levelName = DIFFICULTY_SETTINGS[level].name;
        row.innerHTML = `<span>${i + 1}回目（${levelName}）</span><span>${formatSeconds(
            singleState.roundTimesMs[i]
        )}${singleState.roundMissCounts[i] > 0 ? ` （お手つき${singleState.roundMissCounts[i]}回）` : ""}</span>`;
        singleEls.resultDetail.appendChild(row);
    }

    showScreen("singleResult");
}

function stopSinglePlay() {
    if (singleState && singleState.wordTimeoutId) {
        window.clearTimeout(singleState.wordTimeoutId);
    }
    singleState = null;
}

singleEls.wordBlob.addEventListener("click", handleSingleTap);
singleEls.quitBtn.addEventListener("click", () => {
    stopSinglePlay();
    showScreen("title");
});
singleEls.retryBtn.addEventListener("click", startSinglePlay);
singleEls.toTitleBtn.addEventListener("click", () => showScreen("title"));

document.getElementById("btn-goto-single").addEventListener("click", startSinglePlay);

// ========================================
// ハイスコア画面
// ========================================

const highscoreEls = {
    local: document.getElementById("highscore-local"),
    ranking: document.getElementById("highscore-ranking"),
    toTitleBtn: document.getElementById("btn-highscore-to-title")
};

async function saveHighscoreToFirebase(totalMs) {
    if (!firebaseReady) return;
    const name = getStoredPlayerName() || randomPlayerName();
    const id = getOrCreateLocalPlayerId();
    try {
        await set(ref(db, `highscores/${id}`), {
            name,
            totalMs,
            updatedAt: serverTimestamp()
        });
    } catch (err) {
        console.warn("ハイスコアのFirebase保存に失敗しました", err);
    }
}

function getOrCreateLocalPlayerId() {
    let id = window.localStorage.getItem("unchiSpeedstar_playerId");
    if (!id) {
        id = randomPlayerId();
        window.localStorage.setItem("unchiSpeedstar_playerId", id);
    }
    return id;
}

function getStoredPlayerName() {
    return window.localStorage.getItem("unchiSpeedstar_playerName") || "";
}

function renderHighscoreScreen() {
    const best = getLocalHighscoreMs();
    highscoreEls.local.textContent = best !== null ? formatSeconds(best) : "記録なし";

    highscoreEls.ranking.innerHTML = '<li class="highscore-loading">読み込み中…</li>';

    if (!firebaseReady) {
        highscoreEls.ranking.innerHTML = '<li class="highscore-loading">オンラインランキングは利用できません</li>';
        return;
    }

    get(ref(db, "highscores"))
        .then((snapshot) => {
            const data = snapshot.val();
            if (!data) {
                highscoreEls.ranking.innerHTML = '<li class="highscore-loading">まだ記録がありません</li>';
                return;
            }
            const list = Object.values(data)
                .filter((entry) => typeof entry.totalMs === "number")
                .sort((a, b) => a.totalMs - b.totalMs)
                .slice(0, 10);

            highscoreEls.ranking.innerHTML = "";
            list.forEach((entry, index) => {
                const li = document.createElement("li");
                li.innerHTML = `<span>${index + 1}. ${escapeHtml(entry.name || "名無し")}</span><span>${formatSeconds(
                    entry.totalMs
                )}</span>`;
                highscoreEls.ranking.appendChild(li);
            });
        })
        .catch(() => {
            highscoreEls.ranking.innerHTML = '<li class="highscore-loading">読み込みに失敗しました</li>';
        });
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

document.getElementById("btn-goto-highscore").addEventListener("click", () => {
    renderHighscoreScreen();
    showScreen("highscore");
});
highscoreEls.toTitleBtn.addEventListener("click", () => showScreen("title"));

// ========================================
// みんなであそぶ（通信対戦）
// ========================================

const multiSetupEls = {
    nameInput: document.getElementById("input-player-name"),
    roomIdInput: document.getElementById("input-room-id"),
    joinBtn: document.getElementById("btn-join-room"),
    errorText: document.getElementById("multi-setup-error"),
    toTitleBtn: document.getElementById("btn-multi-to-title")
};

const roomWaitEls = {
    idDisplay: document.getElementById("room-id-display"),
    players: document.getElementById("room-players"),
    leaveBtn: document.getElementById("btn-room-leave")
};

const multiPlayEls = {
    flash: document.getElementById("multi-flash"),
    feedback: document.getElementById("multi-feedback"),
    stage: document.getElementById("multi-stage"),
    scoreboard: document.getElementById("multi-scoreboard"),
    wordBlob: document.getElementById("multi-word-blob"),
    wordText: document.getElementById("multi-word-text"),
    difficultyBadge: document.getElementById("multi-difficulty-badge")
};

const multiResultEls = {
    title: document.getElementById("multi-result-title"),
    scoreboard: document.getElementById("multi-result-scoreboard"),
    toTitleBtn: document.getElementById("btn-multi-result-to-title")
};

const WIN_SCORE = 5;

let multi = {
    roomId: null,
    playerId: null,
    playerName: null,
    maxPlayers: null,
    listeners: [],
    isPaused: false
};

function multiWatch(path, callback) {
    const r = ref(db, path);
    onValue(r, callback);
    multi.listeners.push({ ref: r, callback });
}

function multiUnwatchAll() {
    multi.listeners.forEach(({ ref: r, callback }) => off(r, "value", callback));
    multi.listeners = [];
}

function requireFirebase() {
    if (!firebaseReady) {
        multiSetupEls.errorText.textContent =
            "Firebaseが設定されていないため、みんなであそぶモードは利用できません。script.js内のfirebaseConfigを設定してください。";
        multiSetupEls.errorText.classList.remove("is-hidden");
        return false;
    }
    return true;
}

document.getElementById("btn-goto-multi").addEventListener("click", () => {
    multiSetupEls.errorText.classList.add("is-hidden");
    const stored = getStoredPlayerName();
    if (stored) multiSetupEls.nameInput.value = stored;
    showScreen("multiSetup");
});
multiSetupEls.toTitleBtn.addEventListener("click", () => showScreen("title"));

document.querySelectorAll(".btn-playercount").forEach((btn) => {
    btn.addEventListener("click", () => {
        if (!requireFirebase()) return;
        const count = parseInt(btn.dataset.count, 10);
        createRoom(count);
    });
});

multiSetupEls.joinBtn.addEventListener("click", () => {
    if (!requireFirebase()) return;
    const roomId = multiSetupEls.roomIdInput.value.trim().toUpperCase();
    if (roomId.length !== 6) {
        multiSetupEls.errorText.textContent = "6桁のルームIDを入力してください。";
        multiSetupEls.errorText.classList.remove("is-hidden");
        return;
    }
    joinRoom(roomId);
});

function resolvePlayerName() {
    const typed = multiSetupEls.nameInput.value.trim();
    const name = typed || randomPlayerName();
    window.localStorage.setItem("unchiSpeedstar_playerName", name);
    return name;
}

async function createRoom(maxPlayers) {
    const roomId = randomRoomId();
    const playerId = randomPlayerId();
    const playerName = resolvePlayerName();

    multi.roomId = roomId;
    multi.playerId = playerId;
    multi.playerName = playerName;
    multi.maxPlayers = maxPlayers;

    try {
        await set(ref(db, `rooms/${roomId}`), {
            maxPlayers,
            playerCount: 1,
            state: "waiting",
            createdAt: serverTimestamp()
        });
        await set(ref(db, `rooms/${roomId}/players/${playerId}`), {
            name: playerName,
            score: 0,
            joinedAt: serverTimestamp()
        });

        onDisconnect(ref(db, `rooms/${roomId}/players/${playerId}`)).remove();

        enterRoomWaitScreen();
    } catch (err) {
        console.error(err);
        multiSetupEls.errorText.textContent = "ルーム作成に失敗しました。時間をおいて再度お試しください。";
        multiSetupEls.errorText.classList.remove("is-hidden");
    }
}

async function joinRoom(roomId) {
    try {
        const snap = await get(ref(db, `rooms/${roomId}`));
        const room = snap.val();
        if (!room) {
            multiSetupEls.errorText.textContent = "そのルームIDは見つかりませんでした。";
            multiSetupEls.errorText.classList.remove("is-hidden");
            return;
        }
        if (room.state !== "waiting") {
            multiSetupEls.errorText.textContent = "このルームはすでに開始しています。";
            multiSetupEls.errorText.classList.remove("is-hidden");
            return;
        }
        if ((room.playerCount || 0) >= room.maxPlayers) {
            multiSetupEls.errorText.textContent = "このルームは満員です。";
            multiSetupEls.errorText.classList.remove("is-hidden");
            return;
        }

        const playerId = randomPlayerId();
        const playerName = resolvePlayerName();

        multi.roomId = roomId;
        multi.playerId = playerId;
        multi.playerName = playerName;
        multi.maxPlayers = room.maxPlayers;

        await set(ref(db, `rooms/${roomId}/players/${playerId}`), {
            name: playerName,
            score: 0,
            joinedAt: serverTimestamp()
        });

        await runTransaction(ref(db, `rooms/${roomId}/playerCount`), (current) => (current || 0) + 1);

        onDisconnect(ref(db, `rooms/${roomId}/players/${playerId}`)).remove();

        enterRoomWaitScreen();
    } catch (err) {
        console.error(err);
        multiSetupEls.errorText.textContent = "参加に失敗しました。ルームIDをご確認ください。";
        multiSetupEls.errorText.classList.remove("is-hidden");
    }
}

function enterRoomWaitScreen() {
    roomWaitEls.idDisplay.textContent = multi.roomId;
    showScreen("roomWait");

    multiWatch(`rooms/${multi.roomId}/players`, (snapshot) => {
        const players = snapshot.val() || {};
        renderRoomWaitPlayers(players);
    });

    multiWatch(`rooms/${multi.roomId}/state`, (snapshot) => {
        const state = snapshot.val();
        if (state === "playing") {
            enterMultiPlayScreen();
        } else if (state === "finished") {
            enterMultiResultScreen();
        }
    });

    multiWatch(`rooms/${multi.roomId}/round`, (snapshot) => {
        const round = snapshot.val();
        if (round) handleRoundUpdate(round);
    });

    attachScoreboardWatcher();
    watchAutoStart();
}

function watchAutoStart() {
    multiWatch(`rooms/${multi.roomId}/players`, async (snapshot) => {
        const players = snapshot.val() || {};
        const count = Object.keys(players).length;

        if (!multi.maxPlayers || count < multi.maxPlayers) return;

        try {
            const result = await runTransaction(ref(db, `rooms/${multi.roomId}/state`), (current) => {
                if (current === "waiting") return "playing";
                return;
            });

            if (result.committed) {
                await startRound();
            }
        } catch (err) {
            console.warn("自動開始処理に失敗しました", err);
        }
    });
}

function renderRoomWaitPlayers(players) {
    roomWaitEls.players.innerHTML = "";
    Object.entries(players).forEach(([id, p]) => {
        const row = document.createElement("div");
        row.className = "room-player-row";
        row.textContent = id === multi.playerId ? `${p.name}（あなた）` : p.name;
        roomWaitEls.players.appendChild(row);
    });
}

roomWaitEls.leaveBtn.addEventListener("click", leaveRoom);

async function leaveRoom() {
    if (multi.roomId && multi.playerId) {
        try {
            await remove(ref(db, `rooms/${multi.roomId}/players/${multi.playerId}`));
            await runTransaction(ref(db, `rooms/${multi.roomId}/playerCount`), (current) =>
                Math.max((current || 1) - 1, 0)
            );
        } catch (err) {
            console.warn(err);
        }
    }
    multiUnwatchAll();
    multi.roomId = null;
    multi.playerId = null;
    multi.maxPlayers = null;
    showScreen("title");
}

let currentRoundId = null;
let hasTappedThisRound = false;
let currentRoundIsCorrectWord = false;

function enterMultiPlayScreen() {
    multi.isPaused = false;
    resetFeedback(multiPlayEls.feedback, multiPlayEls.stage);
    setWordTextWithAnimation(multiPlayEls.wordText, "");
    showScreen("multiPlay");
}

function attachScoreboardWatcher() {
    multiWatch(`rooms/${multi.roomId}/players`, (snapshot) => {
        const players = snapshot.val() || {};
        renderMultiScoreboard(multiPlayEls.scoreboard, players);
        renderMultiScoreboard(multiResultEls.scoreboard, players);

        const winnerEntry = Object.entries(players).find(([, p]) => p.score >= WIN_SCORE);
        if (winnerEntry) {
            const [winnerId, winnerData] = winnerEntry;
            multiResultEls.title.textContent =
                winnerId === multi.playerId ? "🎉 あなたの勝ち！" : `🎉 ${winnerData.name} の勝ち！`;
        }
    });
}

async function startRound() {
    if (!multi.roomId) return;

    const difficultyLevel = Math.floor(Math.random() * 4) + 1;
    const { word } = pickWord(difficultyLevel);
    const currentWordIndex = ALL_WORDS.indexOf(word);
    const nextInterval = pickInterval(difficultyLevel);

    try {
        await set(ref(db, `rooms/${multi.roomId}/round`), {
            roundId: Date.now(),
            difficultyLevel,
            currentWordIndex,
            nextInterval,
            winnerId: null
        });
    } catch (err) {
        console.warn("ラウンド開始に失敗しました", err);
    }
}

function handleRoundUpdate(round) {
    if (round.roundId === currentRoundId) return;
    currentRoundId = round.roundId;
    hasTappedThisRound = false;
    multi.isPaused = false;

    const settings = DIFFICULTY_SETTINGS[round.difficultyLevel] || DIFFICULTY_SETTINGS[1];
    multiPlayEls.difficultyBadge.textContent = settings.name;

    const word = ALL_WORDS[round.currentWordIndex] ?? CORRECT_WORD;
    currentRoundIsCorrectWord = round.currentWordIndex === CORRECT_WORD_INDEX;

    resetFeedback(multiPlayEls.feedback, multiPlayEls.stage);
    setWordTextWithAnimation(multiPlayEls.wordText, "");

    window.setTimeout(() => {
        if (round.roundId !== currentRoundId) return;
        setWordTextWithAnimation(multiPlayEls.wordText, word);
        playSound("word");

        window.setTimeout(() => {
            handleRoundTimeout(round.roundId);
        }, Math.max(300, round.nextInterval || 0));
    }, Math.max(0, round.nextInterval || 0));
}

async function handleRoundTimeout(roundId) {
    if (roundId !== currentRoundId || !multi.roomId) return;

    try {
        const claim = await runTransaction(
            ref(db, `rooms/${multi.roomId}/round/winnerId`),
            (current) => {
                if (current) return;
                return "__timeout__";
            }
        );

        if (claim.committed) {
            window.setTimeout(() => {
                startRound();
            }, 900);
        }
    } catch (err) {
        console.warn("ラウンドのタイムアウト処理に失敗しました", err);
    }
}

function renderMultiScoreboard(targetEl, players) {
    targetEl.innerHTML = "";
    Object.entries(players)
        .sort((a, b) => (b[1].score || 0) - (a[1].score || 0))
        .forEach(([id, p]) => {
            const pill = document.createElement("div");
            pill.className = "score-pill" + (id === multi.playerId ? " is-me" : "");
            pill.innerHTML = `<span>${escapeHtml(p.name)}</span><span class="score-value">${p.score || 0}</span>`;
            targetEl.appendChild(pill);
        });
}

multiPlayEls.wordBlob.addEventListener("click", async () => {
    if (!multi.roomId || hasTappedThisRound || !currentRoundId || multi.isPaused) return;

    const currentWordText = multiPlayEls.wordText.textContent;
    const isWordActive = !!currentWordText;
    const isCorrectTap = isWordActive && currentRoundIsCorrectWord;

    const tapWordIndex = ALL_WORDS.indexOf(currentWordText);
    set(ref(db, `rooms/${multi.roomId}/rounds/${currentRoundId}/taps/${multi.playerId}`), {
        tapTime: Date.now(),
        tapWordIndex
    }).catch(() => {});

    if (!isCorrectTap) {
        // --- お手つき（ワードが出ていない時含む） ---
        hasTappedThisRound = true;
        multi.isPaused = true;
        playSound("miss");
        triggerFeedback(multiPlayEls.flash, multiPlayEls.feedback, multiPlayEls.stage, "bad");

        try {
            await runTransaction(ref(db, `rooms/${multi.roomId}/players/${multi.playerId}/score`), (current) => (
                (current || 0) - 1
            ));
        } catch (err) {
            console.warn("スコア更新に失敗しました", err);
        }

        // 3秒ペナルティ後、やり直しできるようにする
        window.setTimeout(() => {
            multi.isPaused = false;
            hasTappedThisRound = false;
            resetFeedback(multiPlayEls.feedback, multiPlayEls.stage);
        }, 3000);
        return;
    }

    try {
        const claim = await runTransaction(
            ref(db, `rooms/${multi.roomId}/round/winnerId`),
            (current) => {
                if (current) return;
                return multi.playerId;
            }
        );

        if (!claim.committed) {
            return;
        }

        // --- 正解 ---
        hasTappedThisRound = true;
        multi.isPaused = true;
        playSound("correct");
        triggerFeedback(multiPlayEls.flash, multiPlayEls.feedback, multiPlayEls.stage, "good");

        const scoreResult = await runTransaction(
            ref(db, `rooms/${multi.roomId}/players/${multi.playerId}/score`),
            (current) => (current || 0) + 1
        );
        const newScore = scoreResult.snapshot.val();

        if (newScore >= WIN_SCORE) {
            await set(ref(db, `rooms/${multi.roomId}/state`), "finished");
            await set(ref(db, `rooms/${multi.roomId}/winner`), multi.playerId);
        } else {
            // 3秒エフェクトを見せてから次のラウンドを開始
            window.setTimeout(() => {
                startRound();
            }, 3000);
        }
    } catch (err) {
        console.warn("正解判定に失敗しました", err);
    }
});

function enterMultiResultScreen() {
    playSound("win");
    showScreen("multiResult");
}

multiResultEls.toTitleBtn.addEventListener("click", async () => {
    multiUnwatchAll();
    if (multi.roomId && multi.playerId) {
        try {
            await remove(ref(db, `rooms/${multi.roomId}/players/${multi.playerId}`));
        } catch (err) {
            /* noop */
        }
    }
    multi.roomId = null;
    multi.playerId = null;
    multi.maxPlayers = null;
    currentRoundId = null;
    showScreen("title");
});

// ========================================
// 初期化
// ========================================

function init() {
    console.log("うんちスピードスター initialized");
    showScreen("title");
}

document.addEventListener("DOMContentLoaded", init);


