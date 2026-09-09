import { spawn } from 'node:child_process';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const outputDir = resolve(rootDir, 'coverage');
const rawDir = resolve(outputDir, 'raw');
const targetScriptMarker = /const CARD_PAYLOAD_VERSION = \d+;/;

export function parseCoverageThreshold(value = '80') {
  if (!/^\d+(?:\.\d+)?$/.test(String(value))) {
    throw new Error('COVERAGE_THRESHOLD must be a number between 0 and 100');
  }
  const threshold = Number(value);
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
    throw new Error('COVERAGE_THRESHOLD must be a number between 0 and 100');
  }
  return threshold;
}

export function collectRanges(entries, sourceLength) {
  const ranges = [];
  for (const entry of entries) {
    // A zero-count child overrides its executed parent within one recording.
    // Resolve that hierarchy before unioning coverage across recordings.
    const recorded = (entry.functions || []).flatMap((fn) => fn.ranges || [])
      .filter((range) => range.startOffset >= 0 && range.endOffset <= sourceLength &&
        range.endOffset > range.startOffset);
    const boundaries = [...new Set(recorded.flatMap((range) => [range.startOffset, range.endOffset]))]
      .sort((a, b) => a - b);
    for (let index = 0; index < boundaries.length - 1; index += 1) {
      const start = boundaries[index];
      const end = boundaries[index + 1];
      let specific;
      for (const range of recorded) {
        if (range.startOffset > start || range.endOffset < end) continue;
        if (!specific || range.endOffset - range.startOffset < specific.endOffset - specific.startOffset) {
          specific = range;
        }
      }
      if (specific && specific.count > 0) ranges.push([start, end]);
    }
  }
  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  const merged = [];
  for (const current of ranges) {
    const previous = merged[merged.length - 1];
    if (!previous || current[0] > previous[1]) {
      merged.push(current.slice());
      continue;
    }
    previous[1] = Math.max(previous[1], current[1]);
  }
  return merged;
}

function stripInlineComments(line, state) {
  let result = '';
  let index = 0;
  while (index < line.length) {
    if (state.inBlockComment) {
      const end = line.indexOf('*/', index);
      if (end === -1) {
        return '';
      }
      state.inBlockComment = false;
      index = end + 2;
      continue;
    }

    const blockStart = line.indexOf('/*', index);
    const lineStart = line.indexOf('//', index);

    if (lineStart !== -1 && (blockStart === -1 || lineStart < blockStart)) {
      result += line.slice(index, lineStart);
      return result;
    }

    if (blockStart !== -1) {
      result += line.slice(index, blockStart);
      const blockEnd = line.indexOf('*/', blockStart + 2);
      if (blockEnd === -1) {
        state.inBlockComment = true;
        return result;
      }
      index = blockEnd + 2;
      continue;
    }

    result += line.slice(index);
    return result;
  }

  return result;
}

function isExecutableLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/^[{}()[\],;]+$/.test(trimmed)) return false;
  return /[A-Za-z0-9_$"'`]/.test(trimmed);
}

function isLineCovered(ranges, start, end) {
  for (const [rangeStart, rangeEnd] of ranges) {
    if (rangeEnd <= start) continue;
    if (rangeStart >= end) return false;
    return true;
  }
  return false;
}

export function summarizeCoverage(source, entries) {
  const ranges = collectRanges(entries, source.length);
  const lines = source.split('\n');
  const blockState = { inBlockComment: false };

  let total = 0;
  let covered = 0;
  let offset = 0;

  lines.forEach((line, index) => {
    const sanitizedLine = stripInlineComments(line, blockState);
    const lineStart = offset + line.search(/\S|$/);
    const lineEnd = offset + line.trimEnd().length;

    if (isExecutableLine(sanitizedLine)) {
      total += 1;
      if (isLineCovered(ranges, lineStart, lineEnd)) {
        covered += 1;
      }
    }

    offset += line.length + 1;
  });

  const percent = total > 0 ? Number(((covered / total) * 100).toFixed(2)) : 0;
  return {
    total,
    covered,
    uncovered: Math.max(0, total - covered),
    percent,
  };
}

async function runPlaywrightSuite() {
  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const args = ['playwright', 'test'];

  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: 'inherit',
      env: {
        ...process.env,
        COLLECT_COVERAGE: '1',
        COVERAGE_RAW_DIR: rawDir,
      },
    });

    child.on('error', rejectPromise);
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(new Error(`Playwright coverage run failed with exit code ${code}`));
    });
  });
}

async function loadCoverageEntries() {
  const files = await readdir(rawDir);
  const entries = [];

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const raw = await readFile(resolve(rawDir, file), 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      entries.push(...parsed);
    }
  }

  return entries;
}

async function main() {
  const threshold = parseCoverageThreshold(process.env.COVERAGE_THRESHOLD);
  await rm(rawDir, { recursive: true, force: true });
  await mkdir(rawDir, { recursive: true });

  await runPlaywrightSuite();
  const coverageEntries = await loadCoverageEntries();

  const targetEntries = coverageEntries.filter((entry) => {
    return entry && typeof entry.source === 'string' && targetScriptMarker.test(entry.source);
  });

  if (!targetEntries.length) {
    throw new Error('Unable to find main app script in browser coverage results');
  }

  if (targetEntries.some((entry) => entry.source !== targetEntries[0].source)) {
    throw new Error('Coverage contains different versions of the app script');
  }

  const summary = summarizeCoverage(targetEntries[0].source, targetEntries);
  const summaryText = [
    'Browser coverage summary',
    'Target: index.html inline app script',
    `Covered lines: ${summary.covered}/${summary.total}`,
    `Coverage: ${summary.percent}%`,
    `Threshold: ${threshold}%`,
  ].join('\n');

  await mkdir(outputDir, { recursive: true });
  await writeFile(resolve(outputDir, 'browser-coverage-summary.json'), JSON.stringify({
    threshold,
    summary,
  }, null, 2) + '\n');
  await writeFile(resolve(outputDir, 'browser-coverage-summary.txt'), summaryText + '\n');

  console.log(summaryText);

  if (!Number.isFinite(summary.percent) || summary.percent < threshold) {
    throw new Error(`Coverage ${summary.percent}% is below threshold ${threshold}%`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error && error.message ? error.message : error);
    process.exitCode = 1;
  });
}
