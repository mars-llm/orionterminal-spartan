import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const indexPath = resolve(rootDir, 'index.html');

function getInlineScriptHashes(source) {
  const hashes = [];
  const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = scriptPattern.exec(source)) !== null) {
    if (/\bsrc\s*=/i.test(match[1])) continue;
    const hash = createHash('sha256').update(match[2], 'utf8').digest('base64');
    hashes.push(`'sha256-${hash}'`);
  }

  return hashes;
}

function updateScriptSrcDirective(policy, hashes) {
  const directivePattern = /script-src\s+([^;]+);/i;
  const match = policy.match(directivePattern);
  if (!match) {
    throw new Error('Unable to find script-src directive in Content Security Policy');
  }

  const sources = match[1]
    .split(/\s+/)
    .filter(Boolean)
    .filter((source) => !/^'sha256-[A-Za-z0-9+/=]+'$/.test(source));
  const nextDirective = `script-src ${sources.concat(hashes).join(' ')};`;
  return policy.replace(directivePattern, nextDirective);
}

async function main() {
  const source = await readFile(indexPath, 'utf8');
  const metaPattern = /(<meta\s+http-equiv="Content-Security-Policy"\s+content=")([^"]*)(">)/i;
  const metaMatch = source.match(metaPattern);
  if (!metaMatch) {
    throw new Error('Unable to find Content Security Policy meta tag');
  }

  const hashes = getInlineScriptHashes(source);
  if (!hashes.length) {
    throw new Error('Unable to find inline scripts to hash');
  }

  const nextPolicy = updateScriptSrcDirective(metaMatch[2], hashes);
  const nextSource = source.replace(metaPattern, `$1${nextPolicy}$3`);
  if (nextSource !== source) {
    await writeFile(indexPath, nextSource);
  }

  console.log(`Synced CSP hashes (${hashes.length} inline scripts)`);
}

main().catch((error) => {
  console.error(error && error.message ? error.message : error);
  process.exitCode = 1;
});
