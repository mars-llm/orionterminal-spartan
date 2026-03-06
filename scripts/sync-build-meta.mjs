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

const indexSource = readFileSync(indexPath, 'utf8');
const serviceWorkerSource = readFileSync(serviceWorkerPath, 'utf8');

const buildMeta = {
  commit: process.env.ORION_BUILD_COMMIT || runGit(['rev-parse', '--short=7', 'HEAD']),
  date: process.env.ORION_BUILD_DATE || runGit(['log', '-1', '--format=%cs', 'HEAD']),
  cardPayloadVersion: Number.parseInt(
    extractRequiredValue(indexSource, /const CARD_PAYLOAD_VERSION = (\d+);/, 'card payload version'),
    10
  ),
  serviceWorkerCache: extractRequiredValue(
    serviceWorkerSource,
    /const CACHE_NAME = 'spartan-orion-screener-(v\d+)';/,
    'service worker cache version'
  ),
};

writeFileSync(buildMetaPath, JSON.stringify(buildMeta, null, 2) + '\n');
console.log(
  `Synced build-meta.json (${buildMeta.commit}, ${buildMeta.date}, card v${buildMeta.cardPayloadVersion}, sw ${buildMeta.serviceWorkerCache})`
);
