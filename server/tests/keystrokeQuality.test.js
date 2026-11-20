const { analyzeKeystrokeSegment } = require('../services/keystrokeQuality');

describe('keystrokeQuality analyzer', () => {
  test('classifies real sentences as valuable', () => {
    const result = analyzeKeystrokeSegment({
      text: 'Please review the quarterly report and share your feedback with the team before Friday.',
      keyCount: 88,
      backspaceCount: 3,
      intervals: Array.from({ length: 60 }, (_, i) => 120 + (i % 7) * 15)
    });

    expect(result.classification).toBe('valuable');
    expect(result.score).toBeGreaterThan(60);
    expect(result.wordScore).toBeGreaterThanOrEqual(0.5);
  });

  test('classifies random key mashing as key_mashing', () => {
    const result = analyzeKeystrokeSegment({
      text: 'asdfjkl;asdfjkl;qwertyuiop',
      keyCount: 26,
      backspaceCount: 0,
      intervals: Array.from({ length: 25 }, () => 40)
    });

    expect(result.classification).toBe('key_mashing');
    expect(result.score).toBeLessThanOrEqual(30);
  });

  test('classifies long same-key hammering as key_mashing', () => {
    const result = analyzeKeystrokeSegment({
      text: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      keyCount: 30,
      backspaceCount: 0,
      intervals: Array.from({ length: 29 }, () => 80)
    });

    expect(result.classification).toBe('key_mashing');
  });

  test('flags machine-like rhythm without readable words as key_mashing', () => {
    const result = analyzeKeystrokeSegment({
      text: 'xkcd qz jvp hrbs',
      keyCount: 16,
      backspaceCount: 0,
      intervals: Array.from({ length: 15 }, () => 45)
    });

    expect(result.classification).toBe('key_mashing');
    expect(result.meanIntervalMs).toBeLessThan(55);
  });

  test('classifies short but real words as valuable (size is not a quality signal)', () => {
    // "hello", "bye", "ok" etc. are small but meaningful — they must
    // never be judged invaluable just because they are short.
    for (const text of ['ok', 'bye', 'hello', 'hi there', 'thanks']) {
      const result = analyzeKeystrokeSegment({ text, keyCount: text.length });
      expect(result.classification).toBe('valuable');
      expect(result.score).toBeGreaterThan(0);
    }
  });

  test('marks empty or single-junk-char fragments as insufficient', () => {
    expect(
      analyzeKeystrokeSegment({ text: '', keyCount: 0 }).classification
    ).toBe('insufficient');
    // A lone non-word character is too little to judge either way.
    expect(
      analyzeKeystrokeSegment({ text: 'z', keyCount: 1 }).classification
    ).toBe('insufficient');
  });

  test('classifies weak but partially readable text as low_value', () => {
    const result = analyzeKeystrokeSegment({
      text: 'the zzz qqq www eee rrr ttt yyy',
      keyCount: 31,
      backspaceCount: 1,
      intervals: Array.from({ length: 30 }, () => 150)
    });

    expect(['low_value', 'key_mashing']).toContain(result.classification);
  });

  test('accepts a precomputed timing summary instead of intervals', () => {
    const result = analyzeKeystrokeSegment({
      text: 'hello team please update the status report today',
      keyCount: 49,
      backspaceCount: 2,
      timing: { mean: 140, std: 40, count: 48 }
    });

    expect(result.meanIntervalMs).toBe(140);
    expect(result.classification).toBe('valuable');
  });

  test('notes paste events in reasons', () => {
    const result = analyzeKeystrokeSegment({
      text: 'Pasted long body of text from another document window here',
      keyCount: 10,
      backspaceCount: 0,
      pasteCount: 2,
      intervals: Array.from({ length: 9 }, () => 200)
    });

    expect(result.reasons.some((r) => r.includes('paste'))).toBe(true);
  });

  test('never returns a score outside 0-100', () => {
    const cases = [
      { text: '', keyCount: 0 },
      { text: 'a'.repeat(500), keyCount: 500, intervals: Array(100).fill(10) },
      { text: 'real words are typed here by a human', keyCount: 37, intervals: Array(36).fill(130) }
    ];
    for (const input of cases) {
      const r = analyzeKeystrokeSegment(input);
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
    }
  });
});
