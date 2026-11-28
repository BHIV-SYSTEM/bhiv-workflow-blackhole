const { applyDailyProgress } = require('../utils/dailyProgress');

const emp = (name, score, opts = {}) => ({
  name,
  stillExist: opts.stillExist === undefined ? 1 : opts.stillExist,
  hasStartedDay: opts.hasStartedDay === undefined ? true : opts.hasStartedDay,
  dayProductivity: { score }
});

describe('daily relative progress', () => {
  test('top worker gets 100, least gets 0, others scale between them', () => {
    const team = [
      emp('Least', 20),
      emp('Middle', 60),
      emp('Top', 100)
    ];
    const result = applyDailyProgress(team);
    expect(result.map((e) => e.dayProgress)).toEqual([0, 50, 100]);
  });

  test('an employee who has not started the day stays at zero', () => {
    const team = [emp('Not started', 0, { hasStartedDay: false }), emp('Top', 80)];
    const result = applyDailyProgress(team);
    expect(result[0].dayProgress).toBe(0);
    expect(result[1].dayProgress).toBe(100);
  });

  test('exited employees are always zero', () => {
    const team = [emp('Exited', 100, { stillExist: 0 }), emp('Active', 40)];
    const result = applyDailyProgress(team);
    expect(result[0].dayProgress).toBe(0);
    expect(result[1].dayProgress).toBe(100);
  });

  test('a new day with nobody started is all zero', () => {
    const team = [
      emp('A', 0, { hasStartedDay: false }),
      emp('B', 0, { hasStartedDay: false })
    ];
    const result = applyDailyProgress(team);
    expect(result.map((e) => e.dayProgress)).toEqual([0, 0]);
  });

  test('equal positive scores are all treated as top workers', () => {
    const team = [emp('A', 70), emp('B', 70)];
    const result = applyDailyProgress(team);
    expect(result.map((e) => e.dayProgress)).toEqual([100, 100]);
  });

  test('raw day score is preserved', () => {
    const team = [emp('A', 30), emp('B', 90)];
    applyDailyProgress(team);
    expect(team[0].dayProductivity.score).toBe(30);
    expect(team[1].dayProductivity.score).toBe(90);
  });

  test('handles an empty team without throwing', () => {
    expect(applyDailyProgress([])).toEqual([]);
  });
});
