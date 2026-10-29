import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const buildMetaPath = resolve(rootDir, 'build-meta.json');
const indexPath = resolve(rootDir, 'index.html');
const serviceWorkerPath = resolve(rootDir, 'service-worker.js');

function runGit(args) {
  return execFileSync('git', args, {
    cwd: rootDir,
    encoding: 'utf8',
  }).trim();
}

function extractRequiredValue(source, pattern, label) {
  const match = source.match(pattern);
  if (!match) {
    throw new Error(`Unable to extract ${label}`);
  }
  return match[1];
}

export function createBuildMeta({ commit, date, indexSource, serviceWorkerSource }) {
  if (typeof commit !== 'string' || !/^[0-9a-f]{7,40}$/.test(commit)) {
    throw new Error('Build commit must be a 7-40 character lowercase Git hash');
  }
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) {
    throw new Error('Build date must be a valid YYYY-MM-DD date');
  }

  const cardPayloadVersion = Number(
    extractRequiredValue(indexSource, /const CARD_PAYLOAD_VERSION = (\d+);/, 'card payload version')
  );
  const serviceWorkerCache = extractRequiredValue(
    serviceWorkerSource,
    /const CACHE_NAME = 'spartan-orion-screener-(v\d+)';/,
    'service worker cache version'
  );
  if (!Number.isSafeInteger(cardPayloadVersion) || cardPayloadVersion < 1 ||
      !Number.isSafeInteger(Number(serviceWorkerCache.slice(1))) || Number(serviceWorkerCache.slice(1)) < 1) {
    throw new Error('Build versions must be positive safe integers');
  }

  return { commit, date, cardPayloadVersion, serviceWorkerCache };
}

function main() {
  const buildMeta = createBuildMeta({
    commit: process.env.ORION_BUILD_COMMIT || runGit(['rev-parse', '--short=7', 'HEAD']),
    date: process.env.ORION_BUILD_DATE || runGit(['log', '-1', '--format=%cs', 'HEAD']),
    indexSource: readFileSync(indexPath, 'utf8'),
    serviceWorkerSource: readFileSync(serviceWorkerPath, 'utf8'),
  });

  writeFileSync(buildMetaPath, JSON.stringify(buildMeta, null, 2) + '\n');
  console.log(
    `Synced build-meta.json (${buildMeta.commit}, ${buildMeta.date}, card v${buildMeta.cardPayloadVersion}, sw ${buildMeta.serviceWorkerCache})`
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
