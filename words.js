// ========================================
// うんちスピードスター
// Word Data (ES Module)
// ========================================

export const CORRECT_WORD = "うんち";

export const FAKE_WORDS = [
    "らんち", "ぱんち", "むんち", "ぷんち", "るんち", "うんつ", "うんぢ", "うんと",
    "うんば", "うんま", "うんみ", "うんゆ", "うんり", "うんぎ", "うんご", "うんぷ",
    "うんむ", "うんく", "うんす", "うんこ", "うんて", "うんちく", "うんちゃん",
    "うんち〜", "うんしょう", "うんけい", "うんそう", "うんめい", "うんにょ", "うんどう",
    "うんちん", "うんかい", "うんが", "うんぜん", "うんてん", "うんねん", "うんぽん",
    "うんすい", "うんがく", "うんてんし", "うんぴ", "うんちっち", "うんちー", "うんちや", "うんちよ"
];

const UNIQUE_FAKE_WORDS = Array.from(new Set(FAKE_WORDS)).filter(w => w !== CORRECT_WORD);
export const ALL_WORDS = UNIQUE_FAKE_WORDS.concat([CORRECT_WORD]);
export const CORRECT_WORD_INDEX = ALL_WORDS.length - 1;
export { UNIQUE_FAKE_WORDS };