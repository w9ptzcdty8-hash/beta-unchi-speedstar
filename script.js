/**
 * うんちハンター - メインスクリプト
 */

// --- 定数 & 設定 ---
const TARGET_WORD = "うんち";

// 偽単語リスト
const FAKE_WORDS = [
  "うんこ", "らんち", "ぱんち", "ピンチ", "ほんち",
  "いんち", "おんち", "かんち", "さんち", "とんち",
  "はんち", "めんち", "ろんち", "うんちく", "うんちい"
];

// 難易度設定 (fakeRate: ダミー単語が出る確率)
const DIFFICULTY_SETTINGS = {
  1: { name: "EASY", fakeRate: 0.60, switchInterval: 800 },   // 正解率: 40%
  2: { name: "NORMAL", fakeRate: 0.70, switchInterval: 650 }, // 正解率: 30%
  3: { name: "HARD", fakeRate: 0.80, switchInterval: 500 },   // 正解率: 20%
  4: { name: "CHAOS", fakeRate: 0.85, switchInterval: 350 }   // 正解率: 15%
};

// ひとりであそぶモードの難易度進行 (全5ラウンド)
const SINGLE_LEVEL_PROGRESSION = [1, 2, 2, 3, 4];

// --- ゲーム状態変数 ---
let gameState = {
  mode: null, // 'single' | 'multi'
  // ひとりであそぶ用
  single: {
    round: 1,
    startTime: 0,
    totalTimeMs: 0,
    timerId: null,
    wordTimerId: null,
    currentWord: "",
    isTargetDisplayed: false,
    canTap: false
  },
  // ふたりであそぶ用
  multi: {
    targetScore: 5,
    difficulty: 2,
    p1Score: 0,
    p2Score: 0,
    wordTimerId: null,
    currentWord: "",
    isTargetDisplayed: false,
    canTap: false
  }
};

// --- DOM要素の取得 ---
const screens = {
  title: document.getElementById("screen-title"),
  singleGame: document.getElementById("screen-single-game"),
  singleResult: document.getElementById("screen-single-result"),
  multiSetup: document.getElementById("screen-multi-setup"),
  multiGame: document.getElementById("screen-multi-game"),
  multiResult: document.getElementById("screen-multi-result"),
  highscore: document.getElementById("screen-highscore")
};

// --- 画面切り替え ---
function showScreen(screenKey) {
  Object.keys(screens).forEach(key => {
    if (screens[key]) {
      screens[key].classList.remove("active");
    }
  });
  if (screens[screenKey]) {
    screens[screenKey].classList.add("active");
  }
}

// --- 称号判定ロジック ---
function getTitleInfo(totalMs) {
  const sec = totalMs / 1000;
  if (sec < 5.50) {
    return { rank: "SS", name: "👑 神速のうんち神" };
  } else if (sec < 8.00) {
    return { rank: "S", name: "⚡ 光速のうんちマスター" };
  } else if (sec < 12.00) {
    return { rank: "A", name: "💩 ベテランうんちハンター" };
  } else if (sec < 17.00) {
    return { rank: "B", name: "🏃 見習いうんちハンター" };
  } else if (sec < 23.00) {
    return { rank: "C", name: "🐢 のんびりうんち鑑賞家" };
  } else {
    return { rank: "D", name: "💤 うんち初心者" };
  }
}

// --- 単語生成ヘルパー ---
function getRandomWord(difficultyLevel) {
  const config = DIFFICULTY_SETTINGS[difficultyLevel] || DIFFICULTY_SETTINGS[1];
  const isFake = Math.random() < config.fakeRate;

  if (isFake) {
    const randomIndex = Math.floor(Math.random() * FAKE_WORDS.length);
    return { word: FAKE_WORDS[randomIndex], isTarget: false };
  } else {
    return { word: TARGET_WORD, isTarget: true };
  }
}

// ==========================================
// ひとりであそぶ モードの処理
// ==========================================

function startSingleGame() {
  gameState.mode = 'single';
  gameState.single.round = 1;
  gameState.single.totalTimeMs = 0;
  showScreen('singleGame');
  setupSingleRound();
}

function setupSingleRound() {
  const s = gameState.single;
  const level = SINGLE_LEVEL_PROGRESSION[s.round - 1];
  const levelConfig = DIFFICULTY_SETTINGS[level];

  // UI更新
  document.getElementById("single-round-num").textContent = s.round;
  document.getElementById("single-level-name").textContent = levelConfig.name;
  document.getElementById("single-timer").textContent = (s.totalTimeMs / 1000).toFixed(3);
  document.getElementById("single-message").textContent = "画面をよく見てね！";
  document.getElementById("single-word-card").textContent = "???";

  s.canTap = true;
  s.startTime = performance.now();

  // タイマー開始
  clearInterval(s.timerId);
  s.timerId = setInterval(() => {
    const currentMs = performance.now() - s.startTime;
    document.getElementById("single-timer").textContent = ((s.totalTimeMs + currentMs) / 1000).toFixed(3);
  }, 10);

  // 単語切り替え開始
  startSingleWordLoop(levelConfig.switchInterval, level);
}

function startSingleWordLoop(interval, level) {
  const s = gameState.single;
  clearInterval(s.wordTimerId);

  const updateWord = () => {
    const { word, isTarget } = getRandomWord(level);
    s.currentWord = word;
    s.isTargetDisplayed = isTarget;
    document.getElementById("single-word-card").textContent = word;
  };

  updateWord();
  s.wordTimerId = setInterval(updateWord, interval);
}

function handleSingleTap() {
  const s = gameState.single;
  if (!s.canTap) return;

  const elapsedMs = performance.now() - s.startTime;

  if (s.isTargetDisplayed) {
    // 正解！
    s.canTap = false;
    clearInterval(s.timerId);
    clearInterval(s.wordTimerId);

    s.totalTimeMs += elapsedMs;
    document.getElementById("single-timer").textContent = (s.totalTimeMs / 1000).toFixed(3);
    document.getElementById("single-message").textContent = "せいかい！ 🎉";

    setTimeout(() => {
      if (s.round < 5) {
        s.round++;
        setupSingleRound();
      } else {
        showSingleResult();
      }
    }, 1000);

  } else {
    // お手つき（ペナルティ: +500ms）
    s.totalTimeMs += 500;
    document.getElementById("single-message").textContent = "お手つき！ (+0.5秒) ❌";
    setTimeout(() => {
      if (s.canTap) {
        document.getElementById("single-message").textContent = "画面をよく見てね！";
      }
    }, 800);
  }
}

function showSingleResult() {
  clearInterval(gameState.single.timerId);
  clearInterval(gameState.single.wordTimerId);
  
  const totalMs = gameState.single.totalTimeMs;
  const titleInfo = getTitleInfo(totalMs);

  document.getElementById("single-total-time").textContent = `${(totalMs / 1000).toFixed(3)} 秒`;
  document.getElementById("single-title-display").textContent = titleInfo.name;

  // ハイスコア保存
  saveHighScore(totalMs, titleInfo.name);

  showScreen('singleResult');
}

// ==========================================
// ふたりであそぶ モードの処理
// ==========================================

function startMultiGame() {
  gameState.mode = 'multi';
  const targetScore = parseInt(document.getElementById("multi-target-score").value, 10);
  const difficulty = parseInt(document.getElementById("multi-difficulty").value, 10);

  gameState.multi.targetScore = targetScore;
  gameState.multi.difficulty = difficulty;
  gameState.multi.p1Score = 0;
  gameState.multi.p2Score = 0;

  document.getElementById("p1-score").textContent = "0";
  document.getElementById("p2-score").textContent = "0";

  showScreen('multiGame');
  setupMultiRound();
}

function setupMultiRound() {
  const m = gameState.multi;
  const levelConfig = DIFFICULTY_SETTINGS[m.difficulty];

  document.getElementById("multi-word-card").textContent = "???";
  m.canTap = true;

  startMultiWordLoop(levelConfig.switchInterval, m.difficulty);
}

function startMultiWordLoop(interval, level) {
  const m = gameState.multi;
  clearInterval(m.wordTimerId);

  const updateWord = () => {
    const { word, isTarget } = getRandomWord(level);
    m.currentWord = word;
    m.isTargetDisplayed = isTarget;
    document.getElementById("multi-word-card").textContent = word;
  };

  updateWord();
  m.wordTimerId = setInterval(updateWord, interval);
}

function handleMultiTap(player) {
  const m = gameState.multi;
  if (!m.canTap) return;

  if (m.isTargetDisplayed) {
    // 正解！
    m.canTap = false;
    clearInterval(m.wordTimerId);

    if (player === 'p1') m.p1Score++;
    else if (player === 'p2') m.p2Score++;

    document.getElementById("p1-score").textContent = m.p1Score;
    document.getElementById("p2-score").textContent = m.p2Score;

    if (m.p1Score >= m.targetScore || m.p2Score >= m.targetScore) {
      setTimeout(showMultiResult, 800);
    } else {
      setTimeout(setupMultiRound, 1000);
    }
  } else {
    // お手つき (相手に1ポイント)
    m.canTap = false;
    clearInterval(m.wordTimerId);

    if (player === 'p1') m.p2Score++;
    else if (player === 'p2') m.p1Score++;

    document.getElementById("p1-score").textContent = m.p1Score;
    document.getElementById("p2-score").textContent = m.p2Score;

    if (m.p1Score >= m.targetScore || m.p2Score >= m.targetScore) {
      setTimeout(showMultiResult, 800);
    } else {
      setTimeout(setupMultiRound, 1000);
    }
  }
}

function showMultiResult() {
  const m = gameState.multi;
  clearInterval(m.wordTimerId);

  const winnerText = m.p1Score > m.p2Score ? "P1 のかち！ 🏆" : "P2 のかち！ 🏆";
  document.getElementById("multi-winner-text").textContent = winnerText;
  document.getElementById("multi-final-score").textContent = `${m.p1Score} - ${m.p2Score}`;

  showScreen('multiResult');
}

// ==========================================
// ハイスコア機能
// ==========================================

function saveHighScore(totalMs, titleName) {
  let scores = getHighScores();
  scores.push({ timeMs: totalMs, title: titleName, date: new Date().toLocaleDateString() });
  scores.sort((a, b) => a.timeMs - b.timeMs);
  scores = scores.slice(0, 5); // 上位5件のみ
  localStorage.setItem("unchi_hunter_highscores_v2", JSON.stringify(scores));
}

function getHighScores() {
  const data = localStorage.getItem("unchi_hunter_highscores_v2");
  return data ? JSON.parse(data) : [];
}

function renderHighScores() {
  const listEl = document.getElementById("highscore-list");
  listEl.innerHTML = "";
  const scores = getHighScores();

  if (scores.length === 0) {
    listEl.innerHTML = "<li>きろくが まだ ありません</li>";
    return;
  }

  scores.forEach((item, index) => {
    const li = document.createElement("li");
    const secText = (item.timeMs / 1000).toFixed(3);
    const titleText = item.title || getTitleInfo(item.timeMs).name;
    li.innerHTML = `
      <span class="hs-rank">${index + 1}.</span>
      <span class="hs-title">${titleText}</span>
      <span class="hs-time">${secText}秒</span>
    `;
    listEl.appendChild(li);
  });
}

// ==========================================
// イベントリスナー設定
// ==========================================

document.addEventListener("DOMContentLoaded", () => {
  // 画面遷移ボタン
  document.getElementById("btn-mode-single").addEventListener("click", startSingleGame);
  document.getElementById("btn-mode-multi").addEventListener("click", () => showScreen('multiSetup'));
  document.getElementById("btn-highscore").addEventListener("click", () => {
    renderHighScores();
    showScreen('highscore');
  });

  document.getElementById("btn-single-retry").addEventListener("click", startSingleGame);
  document.getElementById("btn-single-to-title").addEventListener("click", () => showScreen('title'));

  document.getElementById("btn-multi-start").addEventListener("click", startMultiGame);
  document.getElementById("btn-multi-to-title").addEventListener("click", () => showScreen('title'));
  document.getElementById("btn-multi-retry").addEventListener("click", startMultiGame);
  document.getElementById("btn-multi-result-to-title")?.addEventListener("click", () => showScreen('title'));

  document.getElementById("btn-highscore-to-title").addEventListener("click", () => showScreen('title'));

  // ゲーム内操作
  document.getElementById("single-word-card").addEventListener("click", handleSingleTap);
  document.getElementById("p1-btn").addEventListener("click", () => handleMultiTap('p1'));
  document.getElementById("p2-btn").addEventListener("click", () => handleMultiTap('p2'));
});
