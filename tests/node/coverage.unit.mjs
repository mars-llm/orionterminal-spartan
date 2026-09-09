import test from 'node:test';
import assert from 'node:assert/strict';
import { collectRanges, parseCoverageThreshold, summarizeCoverage } from '../../scripts/run-coverage.mjs';

const recording = (...ranges) => ({ functions: [{ ranges: ranges.map(([startOffset, endOffset, count]) => ({ startOffset, endOffset, count })) }] });

test('zero-count children override positive parents within each recording', () => {
  assert.deepEqual(collectRanges([recording([0, 100, 1], [20, 60, 0], [30, 40, 1])], 100),
    [[0, 20], [30, 40], [60, 100]]);
});

test('coverage is unioned only after each recording resolves its children', () => {
  assert.deepEqual(collectRanges([
    recording([0, 100, 1], [20, 60, 0]),
    recording([0, 100, 0], [20, 60, 1]),
  ], 100), [[0, 100]]);
});

test('unexecuted nested function does not inherit root script coverage', () => {
  const entry = { functions: [recording([0, 100, 1]).functions[0], recording([10, 90, 0]).functions[0]] };
  assert.deepEqual(collectRanges([entry], 100), [[0, 10], [90, 100]]);
});

test('line coverage excludes dead statements including their indentation', () => {
  for (const newline of ['\n', '\r\n']) {
    const source = ['const x = 1;', '  neverCalled();', 'done();'].join(newline);
    const start = source.indexOf('neverCalled');
    const end = start + 'neverCalled();'.length;
    const summary = summarizeCoverage(source, [recording([0, source.length, 1], [start, end, 0])]);
    assert.equal(summary.total, 3);
    assert.equal(summary.covered, 2);
  }
});

test('threshold defaults to 80 and accepts bounded decimal numbers', () => {
  assert.equal(parseCoverageThreshold(), 80);
  for (const value of ['0', '80', '80.5', '100']) assert.equal(parseCoverageThreshold(value), Number(value));
});

test('invalid thresholds cannot bypass the gate', () => {
  for (const value of ['', ' ', 'abc', '80garbage', 'NaN', 'Infinity', '-1', '100.1', '1e2']) {
    assert.throws(() => parseCoverageThreshold(value), /COVERAGE_THRESHOLD/);
  }
});
