const COMMON_WORDS = new Set((
  'the of and to in is that it for on with as was at by an be this from or but ' +
  'not are were has have had will would can could should there their they you your ' +
  'we our us he she his her him do does did done what when where which who whom how ' +
  'all any each every some more most other into about after before over under between ' +
  'because if then than so such no yes i me my am been being who what why where when ' +
  'which while during through above below both same own just also only very much many ' +
  'make made like get got go went come came take took give gave use used need wants ' +
  'thanks regards hello dear please team meeting update status report work working ' +
  'project task tasks done pending complete completed today tomorrow yesterday ' +
  'hello hi ok okay yes sure fine good great thanks thank'
).split(/\s+/));

const CODE_PATTERN = /^[A-Za-z_@][A-Za-z0-9_@.]*$/;
const VOWEL_PATTERN = /[aeiouyAEIOUY]/;
const LETTER_PATTERN = /\p{L}/u;
const ALNUM_TOKEN_PATTERN = /[\p{L}\p{N}_]+/gu;

const VALUABLE_WORD_SCORE = 0.5;
const MASHING_WORD_SCORE = 0.25;
const MAX_REPETITION_SCORE = 0.4;
const SUPERHUMAN_MEAN_INTERVAL_MS = 55;
const SUPERHUMAN_STD_INTERVAL_MS = 45;

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stdDev(values, avg) {
  if (values.length < 2) return 0;
  const variance = values.reduce((sum, v) => sum + ((v - avg) ** 2), 0) / values.length;
  return Math.sqrt(variance);
}

function isWordLike(token) {
  if (!token) return false;
  const lower = token.toLowerCase();
  if (COMMON_WORDS.has(lower)) return true;
  if (token.length < 2 || token.length > 24) return false;
  // Identifier-like tokens (snake_case, dotted, with digits) count as writing.
  if (/[_@.]/.test(token) || /\d/.test(token)) {
    return CODE_PATTERN.test(token) && /\p{L}/u.test(token);
  }
  // camelCase / PascalCase
  if (/[a-z]/.test(token) && /[A-Z]/.test(token)) return true;
  if (!VOWEL_PATTERN.test(token)) return false;
  // Vowel share must look human: gibberish like "asdfjkl" is vowel-starved,
  // while runs like "aaaa" sit far above any natural word.
  const letters = token.match(/\p{L}/gu) || [];
  const vowels = (token.match(/[aeiouyAEIOUY]/g) || []).length;
  const ratio = letters.length ? vowels / letters.length : 0;
  return ratio >= 0.2 && ratio <= 0.75;
}

function longestSameCharRun(text) {
  let longest = 0;
  let current = 1;
  for (let i = 1; i < text.length; i++) {
    if (text[i] === text[i - 1]) {
      current += 1;
      if (current > longest) longest = current;
    } else {
      current = 1;
    }
  }
  return text.length ? Math.max(longest, 1) : 0;
}

function computeWordScore(text) {
  const tokens = text.match(ALNUM_TOKEN_PATTERN) || [];
  if (!tokens.length) return { wordScore: 0, tokenCount: 0 };
  const wordLike = tokens.filter(isWordLike).length;
  return { wordScore: wordLike / tokens.length, tokenCount: tokens.length };
}

function computeRepetitionScore(text) {
  const stripped = text.replace(/\s+/g, '');
  if (stripped.length < 4) return { repetitionScore: 0, longestRun: 0 };
  const longestRun = longestSameCharRun(stripped);
  return { repetitionScore: longestRun / stripped.length, longestRun };
}

function normalizeTiming(intervals, timingSummary) {
  if (Array.isArray(intervals) && intervals.length > 0) {
    const numeric = intervals.filter((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0);
    if (numeric.length) {
      const avg = mean(numeric);
      return {
        mean: Math.round(avg),
        std: Math.round(stdDev(numeric, avg)),
        count: numeric.length
      };
    }
  }
  if (timingSummary && typeof timingSummary === 'object') {
    return {
      mean: Number(timingSummary.mean) || 0,
      std: Number(timingSummary.std) || 0,
      count: Number(timingSummary.count) || 0
    };
  }
  return { mean: 0, std: 0, count: 0 };
}

/**
 * Classify a reconstructed typing segment as valuable writing, low-value
 * input, or random key-mashing (e.g. hammering keys to inflate counters).
 *
 * Signals:
 *  - wordScore:      share of tokens that look like real words / identifiers
 *  - repetitionScore: longest same-character run relative to length
 *  - correctionRatio: backspaces relative to produced characters
 *  - timing:         machine-like intervals (very fast + very regular)
 *
 * Size is deliberately NOT a quality signal: short but real words
 * ("hello", "bye", "ok") are valuable. Only text with no word-like
 * content at all can be judged insufficient / key-mashing.
 *
 * @param {Object} input
 * @param {string} input.text               Reconstructed typed text
 * @param {number} [input.keyCount]         Total keys pressed (all keys)
 * @param {number} [input.backspaceCount]   Correction keys
 * @param {number} [input.pasteCount]       Paste (Ctrl+V) events
 * @param {number[]} [input.intervals]      Inter-key intervals in ms
 * @param {Object} [input.timing]           Precomputed {mean, std, count}
 * @returns {{classification:string, score:number, wordScore:number,
 *            repetitionScore:number, correctionRatio:number,
 *            meanIntervalMs:number, stdIntervalMs:number, reasons:string[]}}
 */
function analyzeKeystrokeSegment(input = {}) {
  const text = typeof input.text === 'string' ? input.text : '';
  const trimmed = text.trim();
  const keyCount = Math.max(0, Number(input.keyCount) || 0);
  const backspaceCount = Math.max(0, Number(input.backspaceCount) || 0);
  const pasteCount = Math.max(0, Number(input.pasteCount) || 0);

  const { wordScore, tokenCount } = computeWordScore(text);
  const { repetitionScore, longestRun } = computeRepetitionScore(text);
  // Only a genuinely long same-key run counts as hammering. A double
  // letter inside a short real word ("hello", "coffee") is normal typing
  // and must not demote the segment.
  const hasHammerRun = longestRun >= 4;
  const charCount = text.replace(/\s+/g, '').length;
  const correctionRatio = charCount > 0
    ? Math.min(1, backspaceCount / Math.max(1, charCount))
    : (keyCount > 0 ? Math.min(1, backspaceCount / keyCount) : 0);

  const timing = normalizeTiming(input.intervals, input.timing);
  const superhuman = timing.count >= 10
    && timing.mean > 0
    && timing.mean < SUPERHUMAN_MEAN_INTERVAL_MS
    && timing.std < SUPERHUMAN_STD_INTERVAL_MS;

  const reasons = [];
  let classification;

  if (!trimmed.length) {
    // No printable content (e.g. sensitive window, or keys only).
    classification = 'insufficient';
    reasons.push('No printable text captured');
  } else if (wordScore < MASHING_WORD_SCORE) {
    if (tokenCount < 2 && trimmed.length < 8) {
      // A stray character or two — too little to judge either way.
      classification = 'insufficient';
      reasons.push('Too little text to judge');
    } else {
      classification = 'key_mashing';
      reasons.push('Almost no word-like tokens in the output');
    }
  } else if (hasHammerRun && wordScore < 0.5) {
    classification = 'key_mashing';
    reasons.push('Long same-key runs with no readable words');
  } else if (superhuman && wordScore < 0.65) {
    classification = 'key_mashing';
    reasons.push('Machine-like key rhythm without readable words');
  } else if (wordScore >= VALUABLE_WORD_SCORE && !hasHammerRun) {
    // Word-like content — regardless of how short it is.
    classification = 'valuable';
    reasons.push('Readable words');
  } else {
    classification = 'low_value';
    reasons.push('Some readable content, but weak word structure');
  }

  if (pasteCount > 0) {
    reasons.push(`${pasteCount} paste event(s) detected`);
  }
  if (correctionRatio > 0.3) {
    reasons.push('Heavy correction rate');
  }

  const rhythmPlausible = superhuman ? 0 : 1;
  const repetitionFactor = 1 - Math.min(1, repetitionScore / MAX_REPETITION_SCORE);
  const correctionFactor = 1 - Math.min(1, correctionRatio / 0.3);

  let score = Math.round(100 * (
    0.55 * Math.min(1, wordScore)
    + 0.20 * repetitionFactor
    + 0.15 * correctionFactor
    + 0.10 * rhythmPlausible
  ));
  if (classification === 'key_mashing') score = Math.min(score, 30);
  if (classification === 'insufficient') score = 0;
  score = Math.max(0, Math.min(100, score));

  return {
    classification,
    score,
    wordScore: Number(wordScore.toFixed(3)),
    repetitionScore: Number(repetitionScore.toFixed(3)),
    correctionRatio: Number(correctionRatio.toFixed(3)),
    meanIntervalMs: timing.mean,
    stdIntervalMs: timing.std,
    reasons
  };
}

module.exports = { analyzeKeystrokeSegment };
