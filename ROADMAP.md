# Spartan Orion Screener Roadmap

Last updated: April 24, 2026 (Europe/Berlin)

This file is the current source of truth for near-term product, release, and documentation priorities.

## 1. Current Product Posture

- GitHub Pages hosts the production demonstration build.
- The app remains single-file-first, centered on `index.html`.
- The product is a market scanner and chart-preview tool, not a backend service.
- Public sharing is social-card-only. Setup-link sharing is intentionally out of scope.

## 2. Non-Negotiable Guardrails

- Preserve the local gate: `npm test` must pass with browser coverage at or above `80%`.
- Preserve the live gate: `npm run test:e2e:live` must pass against the deployed GitHub Pages build.
- Protect deployment freshness so returning GitHub Pages users get updated HTML after deploys.
- Keep boot-path performance strong. Do not reintroduce render-blocking chart or font loads.
- Keep social-card behavior stable:
  - compact `v2` payloads stay
  - legacy `v1` decode stays
  - 3-day expiry stays
  - no backend storage stays
- Never expose private details in public artifacts, docs, UI metadata, or shared URLs.
- Public build metadata may expose safe release facts only:
  - git commit
  - commit date
  - card payload version
  - service-worker cache version
- Public artifacts must never expose:
  - local filesystem paths
  - usernames
  - machine-specific details
  - secrets, tokens, or credentials

## 3. Verified Baseline

Validated on April 24, 2026:

- `npm test`
  - `29 passed`
  - `1 skipped`
  - browser coverage `81.63%`
  - threshold `80%`
- `npm run test:e2e:live`
  - `84 passed`
  - `6 skipped`
  - `0 failed`

Known operational nuance:

- `npm run sync:build-meta`
- `npm run test:e2e`
- `npm run test:e2e:live`
- `npm run test:coverage`
- `npm test`

all rewrite `build-meta.json`.

## 4. Current Priorities

### Priority 1: Keep the deployed Pages build trustworthy

Success means:

- fresh deploys are visible to returning users
- service-worker behavior stays predictable
- the deployed production demonstration build continues to pass the live gate

Files most likely to matter:

- `index.html`
- `service-worker.js`
- `tests/smoke.spec.js`
- `tests/social-card.spec.js`
- `playwright.config.js`

### Priority 2: Protect boot performance and preview responsiveness

Success means:

- app boot stays lightweight
- chart preview work is deferred until needed
- hidden preview states do not keep doing unnecessary work
- additional UI polish does not regress load timing

Files most likely to matter:

- `index.html`
- `tests/smoke.spec.js`
- `tests/coverage.spec.js`

### Priority 3: Keep social-card sharing stable and public-safe

Success means:

- compact payloads keep working locally and on Pages
- expiry, missing-payload, invalid-payload, and oversized-payload behavior stays covered
- the product does not regress back to setup-link sharing
- shared URLs stay self-contained and public-safe

Files most likely to matter:

- `index.html`
- `tests/share.spec.js`
- `tests/social-card.spec.js`

### Priority 4: Keep documentation current and safe to publish

Success means:

- README and roadmap stay aligned with shipped behavior
- no stale instructions remain as the main execution guide
- public docs avoid local-only or machine-specific details

Files most likely to matter:

- `README.md`
- `ROADMAP.md`
- `.github/workflows/pages.yml`

## 5. Working Rules For Future Changes

- Read the full target files before editing high-risk surfaces such as `index.html`, `service-worker.js`, or Playwright tests.
- Prefer the smallest change that preserves behavior and the quality gates.
- If a change affects deployment, sharing, cache behavior, or public metadata, run both local and live validation before calling it done.
- If a change adds any new exposed metadata, explicitly check that it is safe for a public GitHub Pages deployment.

## 6. Current Repo Notes

- The tracked dependency baseline currently includes `@playwright/test` `^1.58.2`.
- `build-meta.json` is generated and commonly drifts after validation runs.
- The local-only handoff file `NEXT_CHAT_HANDOFF.md` is intentionally ignored and should not be treated as public documentation.
