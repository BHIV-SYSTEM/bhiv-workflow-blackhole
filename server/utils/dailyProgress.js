/**
 * Daily relative progress ("target setter").
 *
 * The absolute day-score zones are replaced by a team-relative target built
 * from the current day's scores only:
 *   - the hardest worker in the team gets 100
 *   - the least active employee gets 0
 *   - anyone who has not started the day gets 0
 *
 * Because the target is derived from the day's live data on every request, it
 * naturally starts at zero on a new day and rises as the team works. The
 * original dayProductivity.score is left untouched, so every existing consumer
 * of that field keeps its data.
 *
 * @param {Array} employees team rows, each with hasStartedDay, stillExist and
 *                          dayProductivity.score
 * @returns {Array} the same rows with an added `dayProgress` (0-100) field
 */
function applyDailyProgress(employees) {
  const list = Array.isArray(employees) ? employees : [];
  const eligible = list.filter(
    (emp) => emp.stillExist !== 0 && emp.hasStartedDay === true
  );
  const scores = eligible.map((emp) => Number(emp.dayProductivity?.score) || 0);
  const min = scores.length > 0 ? Math.min(...scores) : 0;
  const max = scores.length > 0 ? Math.max(...scores) : 0;

  for (const emp of list) {
    const started = emp.stillExist !== 0 && emp.hasStartedDay === true;
    if (!started) {
      emp.dayProgress = 0;
      continue;
    }
    const score = Number(emp.dayProductivity?.score) || 0;
    emp.dayProgress = max > min
      ? Math.round(((score - min) / (max - min)) * 100)
      : (max > 0 ? 100 : 0);
  }
  return list;
}

module.exports = { applyDailyProgress };
