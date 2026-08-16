// ========================================
// うんちスピードスター
// Main JavaScript (ES Module)
// ========================================
//
// このファイルは type="module" として読み込まれる前提です。
// Firebase v9 modular SDK を CDN の ESM ビルドから直接importしています。
// （GitHub Pagesはビルドステップを持たない静的ホスティングのため、
//   npmパッケージではなくCDNのESM URLを使用しています）

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
// ★★★ ここを自分のFirebaseプロジェクトの設定値に差し替えてください ★★★
// Firebaseコンソール > プロジェクトの設定 > 全般 > マイアプリ から取得できます。
const firebaseConfig = {
  apiKey: "AIzaSyCMyz2z02iqgxmdgI3kPZi2-l0JQ1sIy94",
  authDomain: "unch-speedstar.firebaseapp.com",
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
    // Firebase未設定でも「ひとりであそぶ」はローカルだけで動作するようにする
    console.warn("Firebase初期化に失敗しました（設定値を確認してください）", err);
    firebaseReady = false;
}

// ========================================
// 定数：単語リスト・難易度設定
// ========================================

const CORRECT_WORD = "うんち";

// 「うんち」以外のフェイント単語（固定リスト・全レベル共通）
const FAKE_WORDS = [
    "らんち",
    "ぱんち",
    "むんち",
    "ぷんち",
    "るんち",
    "うんつ",
    "うんぢ",
    "うんち",
    "うんと",
    "うんば",
    "うんま",
    "うんみ",
    "うんゆ",
    "うんり",
    "うんぎ",
    "うんご",
    "うんぷ",
    "うんむ",
    "うんく",
    "うんす"
];

// 全単語リスト（フェイク単語 + 正解「うんち」を末尾に追加）
// インデックスの並びはCloud Functions側（functions/index.js）と必ず一致させること。
const ALL_WORDS = FAKE_WORDS.concat([CORRECT_WORD]);
const CORRECT_WORD_INDEX = ALL_WORDS.length - 1;

// difficultyLevel: 1=EASY, 2=NORMAL, 3=HARD, 4=CHAOS
const DIFFICULTY_SETTINGS = {
    1: { name: "EASY", min: 1500, max: 2200, fakeRate: 0.20 },
    2: { name: "NORMAL", min: 1000, max: 2200, fakeRate: 0.35 },
    3: { name: "HARD", min: 600, max: 2200, fakeRate: 0.50 },
    4: { name: "CHAOS", min: 300, max: 2200, fakeRate: 0.70 }
};

// ひとりであそぶ：5回勝負の難易度進行
const SINGLE_LEVEL_PROGRESSION = [1, 1, 2, 3, 4];

const MISS_PENALTY_MS = 500; // お手つき1回につき+0.5秒
const ROUND_TRANSITION_DELAY_MS = 900; // ラウンド間の演出待ち

const LOCAL_HIGHSCORE_KEY = "unchiSpeedstar_highscore_ms";

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
        src.play().catch(() => {
            // ユーザー操作前の自動再生ブロックなどは無視する
        });
    } catch (err) {
        // 再生できない環境でもゲームは継続させる
    }
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
    const n = Math.floor(Math.random() * 900) + 100; // 100〜999
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

function flash(overlayEl, type) {
    overlayEl.classList.remove("flash-good", "flash-bad");
    // reflow to restart animation
    void overlayEl.offsetWidth;
    overlayEl.classList.add(type === "good" ? "flash-good" : "flash-bad");
    window.setTimeout(() => {
        overlayEl.classList.remove("flash-good", "flash-bad");
    }, 220);
}

// 難易度設定にもとづき、次に出す単語を抽選する
function pickWord(difficultyLevel) {
    const settings = DIFFICULTY_SETTINGS[difficultyLevel];
    const isFake = Math.random() < settings.fakeRate;
    if (!isFake) {
        return { word: CORRECT_WORD, isCorrect: true };
    }
    const fake = FAKE_WORDS[Math.floor(Math.random() * FAKE_WORDS.length)];
    return { word: fake, isCorrect: false };
}

// 難易度設定にもとづき、次の表示間隔（ms）を抽選する
function pickInterval(difficultyLevel) {
    const settings = DIFFICULTY_SETTINGS[difficultyLevel];
    return Math.floor(settings.min + Math.random() * (settings.max - settings.min));
}


// ========================================
// ひとりであそぶ
// ========================================

const singleEls = {
    flash: document.getElementById("single-flash"),
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
        finished: false
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

    const { word, isCorrect } = pickWord(level);
    singleEls.wordText.textContent = word;
    singleState.wordIsActive = true;
    playSound("word");

    if (isCorrect) {
        singleState.waitingForCorrectTap = true;
        singleState.wordStartedAt = performance.now();
        // 正解の単語はプレイヤーがタップするまで表示し続ける（自動では消えない）
    } else {
        singleState.waitingForCorrectTap = false;
        scheduleSingleWord();
    }
}

function handleSingleTap() {
    if (!singleState || singleState.finished || !singleState.wordIsActive) return;

    if (singleState.waitingForCorrectTap) {
        // 正解タップ
        const reaction = performance.now() - singleState.wordStartedAt;
        const missPenalty = singleState.roundMissCounts[singleState.roundIndex] * MISS_PENALTY_MS;
        singleState.roundTimesMs[singleState.roundIndex] = reaction + missPenalty;

        playSound("correct");
        flash(singleEls.flash, "good");

        singleState.wordIsActive = false;
        singleState.waitingForCorrectTap = false;
        singleEls.wordText.textContent = "";

        advanceSingleRound();
    } else {
        // お手つき（フェイント単語をタップ）
        singleState.roundMissCounts[singleState.roundIndex] += 1;
        playSound("miss");
        flash(singleEls.flash, "bad");
    }
}

function advanceSingleRound() {
    renderSingleRoundChips();
    updateSingleTotalDisplay();

    singleState.roundIndex += 1;

    if (singleState.roundIndex >= 5) {
        singleState.finished = true;
        window.setTimeout(finishSinglePlay, ROUND_TRANSITION_DELAY_MS);
        return;
    }

    window.setTimeout(() => {
        renderSingleRoundChips();
        scheduleSingleWord();
    }, ROUND_TRANSITION_DELAY_MS);
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
// ハイスコア画面（ローカル＋Firebaseランキング）
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
    listeners: [] // { path, callback } を記録し、退出時にoffする
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

        await set(ref(db, `rooms/${roomId}/players/${playerId}`), {
            name: playerName,
            score: 0,
            joinedAt: serverTimestamp()
        });

        // playerCountはトランザクションで安全に加算する
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

    // 対戦画面・結果画面のスコアボード用の監視もあわせて設定しておく
    attachScoreboardWatcher();
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
    showScreen("title");
}

let currentRoundId = null;
let hasTappedThisRound = false;
let currentRoundIsCorrectWord = false;

function enterMultiPlayScreen() {
    showScreen("multiPlay");
}

// players監視をスコアボード描画（対戦画面・結果画面）に反映する
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

function handleRoundUpdate(round) {
    if (round.roundId === currentRoundId) return; // 既に処理済みのラウンド
    currentRoundId = round.roundId;
    hasTappedThisRound = false;

    const settings = DIFFICULTY_SETTINGS[round.difficultyLevel] || DIFFICULTY_SETTINGS[1];
    multiPlayEls.difficultyBadge.textContent = settings.name;

    const word = ALL_WORDS[round.currentWordIndex] ?? CORRECT_WORD;
    currentRoundIsCorrectWord = round.currentWordIndex === CORRECT_WORD_INDEX;

    multiPlayEls.wordText.textContent = "";

    window.setTimeout(() => {
        multiPlayEls.wordText.textContent = word;
        playSound("word");
    }, Math.max(0, round.nextInterval || 0));
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
    if (!multi.roomId || hasTappedThisRound || !currentRoundId) return;
    hasTappedThisRound = true;

    try {
        await set(ref(db, `rooms/${multi.roomId}/rounds/${currentRoundId}/taps/${multi.playerId}`), {
            tapTime: Date.now(),
            tapWordIndex: ALL_WORDS.indexOf(multiPlayEls.wordText.textContent)
        });

        if (currentRoundIsCorrectWord) {
            playSound("correct");
            flash(multiPlayEls.flash, "good");
        } else {
            playSound("miss");
            flash(multiPlayEls.flash, "bad");
        }
    } catch (err) {
        console.warn("タップ送信に失敗しました", err);
        hasTappedThisRound = false;
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
