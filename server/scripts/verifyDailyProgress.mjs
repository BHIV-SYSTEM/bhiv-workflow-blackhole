// Standalone end-to-end verification of the daily relative progress feature.
// Run with: node server/scripts/verifyDailyProgress.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { workProgress, workProgressStyle, dayScore } from '../../client/src/lib/dayProductivity.js';

const require = createRequire(import.meta.url);
const { applyDailyProgress } = require('../utils/dailyProgress');

const makeTeam = (entries) =>
  entries.map(([name, score, started = true, stillExist = 1]) => ({
    name,
    stillExist,
    hasStartedDay: started,
    dayProductivity: { score }
  }));

// 1. New day: nobody has started, so every bar starts at zero.
{
  const team = applyDailyProgress(makeTeam([
    ['A', 0, false], ['B', 0, false], ['C', 0, false]
  ]));
  assert.deepEqual(team.map((e) => workProgress(e)), [0, 0, 0]);
  assert.deepEqual(team.map((e) => workProgressStyle(e).zone), ['red', 'red', 'red']);
}

// 2. Mid-day: hardest worker 100, least 0, non-starter 0.
{
  const team = applyDailyProgress(makeTeam([
    ['Hardest', 90],
    ['Middle', 50],
    ['Least', 10],
    ['Not started', 0, false]
  ]));
  assert.deepEqual(team.map((e) => workProgress(e)), [100, 50, 0, 0]);
  assert.equal(workProgressStyle(team[0]).zone, 'green');
  assert.equal(workProgressStyle(team[1]).zone, 'yellow');
  assert.equal(workProgressStyle(team[3]).zone, 'red');
  // Raw telemetry is untouched.
  assert.equal(dayScore(team[0]), 90);
  assert.equal(dayScore(team[2]), 10);
}

// 3. Older cached payloads without dayProgress keep working.
{
  assert.equal(workProgress({ dayProductivity: { score: 75 } }), 75);
}

console.log('OK: daily progress starts at 0, scales to the top worker at 100, and preserves raw scores.');
