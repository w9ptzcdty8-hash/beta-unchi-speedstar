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

// 難易度ごとのダミー出現確率（fakeRate）
const DIFFICULTY_SETTINGS = {
    1: { name: "EASY", min: 1000, max: 1300, fakeRate: 0.60 },   // 正解率40%
    2: { name: "NORMAL", min: 600, max: 1300, fakeRate: 0.70 }, // 正解率30%
    3: { name: "HARD", min: 400, max: 1300, fakeRate: 0.80 },   // 正解率20%
    4: { name: "CHAOS", min: 100, max: 1300, fakeRate: 0.85 }   // 正解率15%
};

// 「ひとりであそぶ」の進行構成 (ラウンド2を NORMAL に)
const SINGLE_LEVEL_PROGRESSION = [1, 2, 2, 3, 4];
const MISS_PENALTY_MS = 500;
const LOCAL_HIGHSCORE_LIST_KEY = "unchiSpeedstar_highscore_list_ms";
const EFFECT_WAIT_MS = 2000; // 演出待機時間（2.0秒）

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
            feedbackBadgeEl.textContent = "〇せいかい";
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

// 合計タイムから称号情報を取得する関数
function getTitleInfo(totalMs) {
    const sec = totalMs / 1000;
    if (sec < 2.50) return { rank: "ss", name: "👑 神速のうんち神" };
    if (sec < 3.00) return { rank: "s", name: "⚡ 光速のうんちマスター" };
    if (sec < 4.00) return { rank: "a", name: "💩 ベテランうんちハンター" };
    if (sec < 6.00) return { rank: "b", name: "🏃 見習いうんちハンター" };
    if (sec < 8.00) return { rank: "c", name: "🐢 のんびりうんち鑑賞家" };
    return { rank: "d", name: "💤 うんち初心者" };
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
    wordElapsed: document.getElementById("single-word-elapsed"),
    quitBtn: document.getElementById("btn-single-quit"),
    resultTotal: document.getElementById("single-result-total"),
    resultDetail: document.getElementById("single-result-detail"),
    resultNewRecord: document.getElementById("single-result-newrecord"),
    retryBtn: document.getElementById("btn-single-retry"),
    toTitleBtn: document.querySelector(".btn-single-to-title")
};

let singleState = null;

function createSingleState() {
    return {
        roundIndex: 0,
        roundTimesMs: [0, 0, 0, 0, 0],          // ペナルティ・見逃し込みの各ラウンド合計
        roundTapTimesMs: [0, 0, 0, 0, 0],       // 純粋なタップ反応時間（お手つき・見逃しを含まない）
        roundMissedTimesMs: [0, 0, 0, 0, 0],    // 各ラウンドの見逃した正解タイム
        roundMissCounts: [0, 0, 0, 0, 0],       // 各ラウンドのお手つき回数
        wordTimeoutId: null,
        wordStartedAt: 0,
        waitingForCorrectTap: false,
        wordIsActive: false,
        finished: false,
        isPaused: false,
        elapsedTimerAnimId: null
    };
}

// 画面上部（HUD）の5回タイム表示：お手つき・見逃しを含まない「純粋なタップタイム」を表示
function renderSingleRoundChips() {
    singleEls.roundTimes.innerHTML = "";
    for (let i = 0; i < 5; i++) {
        const chip = document.createElement("span");
        chip.className = "round-chip";
        if (i < singleState.roundIndex) {
            chip.classList.add("is-done");
            chip.textContent = `${i + 1}: ${formatSeconds(singleState.roundTapTimesMs[i])}`;
        } else if (i === singleState.roundIndex) {
            chip.classList.add("is-current");
            chip.textContent = `${i + 1}回目`;
        } else {
            chip.textContent = `${i + 1}`;
        }
        singleEls.roundTimes.appendChild(chip);
    }
}

// リアルタイム単語経過時間の更新関数（正解タップ時は固定）
function updateWordElapsedDisplay() {
    if (!singleState || singleState.finished) return;

    if (!singleState.isPaused && singleState.wordIsActive && singleState.wordStartedAt > 0) {
        const now = performance.now();
        const elapsed = (now - singleState.wordStartedAt) / 1000;
        singleEls.wordElapsed.textContent = `単語経過: ${elapsed.toFixed(2)}秒`;
    }

    singleState.elapsedTimerAnimId = requestAnimationFrame(updateWordElapsedDisplay);
}

function startSinglePlay() {
    stopSinglePlay();
    singleState = createSingleState();
    resetFeedback(singleEls.feedback, singleEls.stage);
    setWordTextWithAnimation(singleEls.wordText, "");
    renderSingleRoundChips();
    showScreen("single");
    scheduleSingleWord();
    
    // リアルタイム経過時間更新ループを開始
    updateWordElapsedDisplay();
}

function scheduleSingleWord() {
    if (!singleState || singleState.finished || singleState.isPaused) return;

    const level = SINGLE_LEVEL_PROGRESSION[singleState.roundIndex];
    const interval = pickInterval(level);

    singleState.wordTimeoutId = window.setTimeout(() => {
        showSingleWord(level);
    }, interval);
}

function showSingleWord(level) {
    if (!singleState || singleState.finished || singleState.isPaused) return;

    // 前の単語が「うんち」で見逃されていた（タップされなかった）場合、その時間を加算
    if (singleState.wordIsActive && singleState.waitingForCorrectTap && singleState.wordStartedAt > 0) {
        const missedTime = performance.now() - singleState.wordStartedAt;
        singleState.roundMissedTimesMs[singleState.roundIndex] += missedTime;
        singleState.roundTimesMs[singleState.roundIndex] += missedTime;
    }

    resetFeedback(singleEls.feedback, singleEls.stage);
    const { word, isCorrect } = pickWord(level);
    setWordTextWithAnimation(singleEls.wordText, word);

    singleState.wordIsActive = true;
    singleState.waitingForCorrectTap = isCorrect;
    singleState.wordStartedAt = performance.now();
    playSound("word");

    scheduleSingleWord();
}

function handleSingleTap() {
    if (!singleState || singleState.finished || singleState.isPaused) return;

    const isCorrectTap = singleState.wordIsActive && singleState.waitingForCorrectTap;

    singleState.isPaused = true;
    if (singleState.wordTimeoutId) {
        window.clearTimeout(singleState.wordTimeoutId);
        singleState.wordTimeoutId = null;
    }

    if (isCorrectTap) {
        // --- 正解 ---
        const reaction = performance.now() - singleState.wordStartedAt;
        singleState.roundTapTimesMs[singleState.roundIndex] = reaction;

        // タップした瞬間の単語タイムを画面下に固定表示
        singleEls.wordElapsed.textContent = `単語経過: ${(reaction / 1000).toFixed(2)}秒`;

        const missPenalty = singleState.roundMissCounts[singleState.roundIndex] * MISS_PENALTY_MS;
        singleState.roundTimesMs[singleState.roundIndex] += (reaction + missPenalty);

        playSound("correct");
        triggerFeedback(singleEls.flash, singleEls.feedback, singleEls.stage, "good");

        singleState.wordIsActive = false;
        singleState.waitingForCorrectTap = false;
        singleState.wordStartedAt = 0;

        // 2秒間エフェクトを表示後、次のラウンドへ
        window.setTimeout(() => {
            if (!singleState) return;
            singleState.isPaused = false;
            resetFeedback(singleEls.feedback, singleEls.stage);
            setWordTextWithAnimation(singleEls.wordText, "");
            advanceSingleRound();
        }, EFFECT_WAIT_MS);
    } else {
        // --- お手つき（ダミー単語または文字未表示時のタップ） ---
        singleState.roundMissCounts[singleState.roundIndex] += 1;
        playSound("miss");
        triggerFeedback(singleEls.flash, singleEls.feedback, singleEls.stage, "bad");

        singleState.wordIsActive = false;
        singleState.waitingForCorrectTap = false;
        singleState.wordStartedAt = 0;

        // 2秒間待機後、単語タイマーを再開
        window.setTimeout(() => {
            if (!singleState) return;
            singleState.isPaused = false;
            resetFeedback(singleEls.feedback, singleEls.stage);
            setWordTextWithAnimation(singleEls.wordText, "");
            scheduleSingleWord();
        }, EFFECT_WAIT_MS);
    }
}

function advanceSingleRound() {
    singleState.roundIndex += 1;

    renderSingleRoundChips();

    if (singleState.roundIndex >= 5) {
        singleState.finished = true;
        finishSinglePlay();
        return;
    }

    scheduleSingleWord();
}

// ----------------------------------------
// ローカルハイスコア（ベスト5管理）
// ----------------------------------------

function getLocalHighscores() {
    const raw = window.localStorage.getItem(LOCAL_HIGHSCORE_LIST_KEY);
    if (!raw) {
        // 旧バージョンとの互換性チェック
        const oldVal = window.localStorage.getItem("unchiSpeedstar_highscore_ms");
        if (oldVal) {
            const parsedOld = parseFloat(oldVal);
            if (!isNaN(parsedOld)) return [parsedOld];
        }
        return [];
    }
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
}

function saveLocalHighscore(totalMs) {
    const list = getLocalHighscores();
    list.push(totalMs);
    list.sort((a, b) => a - b);
    const best5 = list.slice(0, 5);
    window.localStorage.setItem(LOCAL_HIGHSCORE_LIST_KEY, JSON.stringify(best5));
    return best5[0] === totalMs; // 1位更新かどうか
}

function finishSinglePlay() {
    if (singleState.elapsedTimerAnimId) {
        cancelAnimationFrame(singleState.elapsedTimerAnimId);
    }

    const totalMs = singleState.roundTimesMs.reduce((a, b) => a + b, 0);
    const isNewTopRecord = saveLocalHighscore(totalMs);

    playSound("win");

    if (isNewTopRecord) {
        window.setTimeout(() => playSound("highscore"), 300);
        saveHighscoreToFirebase(totalMs).catch(() => {});
    }

    singleEls.resultNewRecord.classList.toggle("is-hidden", !isNewTopRecord);
    singleEls.resultTotal.textContent = formatSeconds(totalMs);
    
    // リザルト画面での称号の表示
    const titleInfo = getTitleInfo(totalMs);
    const titleBadge = document.getElementById("single-result-title-badge");
    if (titleBadge) {
        titleBadge.textContent = titleInfo.name;
        titleBadge.className = `title-badge rank-${titleInfo.rank}`;
        titleBadge.classList.remove("is-hidden");
    }

    singleEls.resultDetail.innerHTML = "";

    // 各ラウンドのタイム内訳（タップタイム・見逃し・お手つき）を表示
    for (let i = 0; i < 5; i++) {
        const row = document.createElement("div");
        row.className = "result-row";
        const level = SINGLE_LEVEL_PROGRESSION[i];
        const levelName = DIFFICULTY_SETTINGS[level].name;

        const roundTotal = singleState.roundTimesMs[i];
        const tapTime = singleState.roundTapTimesMs[i];
        const missedTime = singleState.roundMissedTimesMs[i];
        const missCount = singleState.roundMissCounts[i];

        row.innerHTML = `
            <div class="result-row-header">
                <span>${i + 1}回目（${levelName}）</span>
                <span>${formatSeconds(roundTotal)}</span>
            </div>
            <div class="result-row-breakdown">
                <span>タップ: ${formatSeconds(tapTime)}</span>
                ${missedTime > 0 ? `<span>見逃し: +${formatSeconds(missedTime)}</span>` : ""}
                ${missCount > 0 ? `<span>お手つき: ${missCount}回(+${formatSeconds(missCount * MISS_PENALTY_MS)})</span>` : ""}
            </div>
        `;
        singleEls.resultDetail.appendChild(row);
    }

    showScreen("singleResult");
}

function stopSinglePlay() {
    if (singleState) {
        if (singleState.wordTimeoutId) {
            window.clearTimeout(singleState.wordTimeoutId);
        }
        if (singleState.elapsedTimerAnimId) {
            cancelAnimationFrame(singleState.elapsedTimerAnimId);
        }
    }
    singleState = null;
}

singleEls.wordBlob.addEventListener("click", handleSingleTap);
singleEls.quitBtn.addEventListener("click", () => {
    stopSinglePlay();
    showScreen("title");
});
singleEls.retryBtn.addEventListener("click", startSinglePlay);
if (singleEls.toTitleBtn) {
    singleEls.toTitleBtn.addEventListener("click", () => showScreen("title"));
}

document.getElementById("btn-goto-single").addEventListener("click", startSinglePlay);

// ========================================
// ハイスコア画面
// ========================================

const highscoreEls = {
    localList: document.getElementById("highscore-local-list"),
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
    // ローカルベスト5表示
    const localBest = getLocalHighscores();
    highscoreEls.localList.innerHTML = "";
    if (localBest.length === 0) {
        highscoreEls.localList.innerHTML = '<li class="highscore-loading">記録なし</li>';
    } else {
        localBest.forEach((ms, index) => {
            const titleInfo = getTitleInfo(ms);
            const li = document.createElement("li");
            li.innerHTML = `
                <span class="hs-rank">${index + 1}位</span>
                <span class="hs-title rank-${titleInfo.rank}">${titleInfo.name}</span>
                <span class="hs-time">${formatSeconds(ms)}</span>
            `;
            highscoreEls.localList.appendChild(li);
        });
    }

    // オンラインランキング（上位10件）表示
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
        // --- お手つき（ダミー単語または文字未表示時） ---
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

        // 2秒ペナルティ後、やり直し可能に設定
        window.setTimeout(() => {
            multi.isPaused = false;
            hasTappedThisRound = false;
            resetFeedback(multiPlayEls.feedback, multiPlayEls.stage);
        }, EFFECT_WAIT_MS);
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
            // 2秒エフェクトを表示後、次のラウンドを開始
            window.setTimeout(() => {
                startRound();
            }, EFFECT_WAIT_MS);
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

