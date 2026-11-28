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

const zoneFor = (value) => workProgressStyle({ dayProgress: value }).zone;

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
  assert.equal(workProgressStyle(team[1]).zone, 'red');
  assert.equal(workProgressStyle(team[3]).zone, 'red');
  // Raw telemetry is untouched.
  assert.equal(dayScore(team[0]), 90);
  assert.equal(dayScore(team[2]), 10);
}

// 3. Colour thresholds on the displayed progress number: <70 red, <80 yellow, >=80 green.
{
  const boundaries = [
    [0, 'red'], [69, 'red'], [70, 'yellow'], [79, 'yellow'], [80, 'green'], [100, 'green']
  ];
  for (const [value, expected] of boundaries) {
    assert.equal(zoneFor(value), expected, `progress ${value} should be ${expected}`);
  }
  // Samples from the reported live view that were previously mis-coloured.
  const corrected = [[34, 'red'], [46, 'red'], [78, 'yellow'], [74, 'yellow'], [68, 'red'], [69, 'red'], [73, 'yellow']];
  for (const [value, expected] of corrected) {
    assert.equal(zoneFor(value), expected, `progress ${value} should be ${expected}`);
  }
}

// 4. Re-check the exact 42 progress values reported from the live Daily view.
{
  const reported = [
    14, 34, 36, 15, 46, 78, 66, 25, 74, 8, 68, 61, 100, 13, 11, 0, 15, 18, 40,
    9, 69, 3, 16, 56, 70, 38, 53, 8, 70, 26, 20, 33, 73, 73, 18, 5, 18, 50, 81,
    0, 0, 0
  ];
  const zones = reported.map(zoneFor);
  assert.equal(reported.length, 42);
  assert.equal(zones.filter((z) => z === 'green').length, 2);  // only 100 and 81
  assert.equal(zones.filter((z) => z === 'yellow').length, 6); // 78, 74, 70, 70, 73, 73
  assert.equal(zones.filter((z) => z === 'red').length, 34);
}

// 5. Older cached payloads without dayProgress keep working.
{
  assert.equal(workProgress({ dayProductivity: { score: 75 } }), 75);
}

console.log('OK: daily progress starts at 0, scales to the top worker at 100, and uses <70 red / <80 yellow / >=80 green.');
