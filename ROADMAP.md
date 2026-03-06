# Spartan Orion Screener Roadmap

Last updated: March 6, 2026 (Europe/Berlin)

This file is the single roadmap for near-term product and release work. Items are ordered by current priority and include enough specification to execute without reopening discovery.

## 1. Deployment Freshness and Cache Safety

Status: In progress (local implementation complete; awaiting next deployed live verification)

Problem:
- The live GitHub Pages gate now passes, but the current PWA/service-worker design can still strand returning users on stale `index.html` after a new deploy.
- The risk is highest on GitHub Pages because the app is single-file-first, so one stale shell response can hide all new product behavior.

Scope:
- Change the service worker to use network-first handling for navigation/document requests.
- Keep offline fallback for the app shell so the site still opens without a network connection.
- Limit long-lived cache behavior to static shell assets instead of all same-origin GET requests.
- Trigger an explicit service-worker update check on boot and reload once when an existing controller is replaced.

Files:
- `/Users/mars/code/ZCT/orion-screener/service-worker.js`
- `/Users/mars/code/ZCT/orion-screener/index.html`

Acceptance criteria:
- Returning GitHub Pages users fetch fresh HTML after deploys instead of staying pinned to a cache-first shell.
- Offline fallback still opens the app shell.
- Local Playwright E2E passes after the change.
- No product behavior changes outside deployment/cache freshness.

Progress so far:
- Switched the service worker to network-first handling for HTML/navigation requests.
- Limited persistent runtime caching to static shell assets.
- Added an explicit service-worker update check on boot plus one-time reload when an existing controller is replaced.
- Verified locally with `npm run test:e2e` on March 6, 2026 (`21 passed`, `1 skipped`).

## 2. Live Deployment Observability

Status: Completed locally

Problem:
- We can verify live behavior today by inspecting source and running Playwright, but there is no explicit build/deploy fingerprint in the UI or DOM for quick triage.

Scope:
- Add a lightweight build marker or commit/deploy stamp that is safe to expose in the client.
- Make the marker easy to inspect in live HTML and Playwright without changing the visible product layout.
- Document the verification flow in repo docs or handoff notes.

Files:
- `/Users/mars/code/ZCT/orion-screener/index.html`
- `/Users/mars/code/ZCT/orion-screener/README.md`
- `/Users/mars/code/ZCT/orion-screener/tests/smoke.spec.js`

Acceptance criteria:
- A tester can confirm the deployed build identity from the rendered app or DOM without source-diving.
- The marker is stable enough for automation and does not expose secrets.

Progress so far:
- Added a lightweight build marker to the footer plus matching runtime/DOM metadata attributes.
- Exposed build metadata through `window.__ORION_BUILD_INFO__` for fast live checks and Playwright assertions.
- Documented the verification flow in the README.
- Verified locally with `npm run test:smoke` on March 6, 2026 (`3 passed`, `1 skipped`).

## 3. Proxy Fallback Resilience

Status: Completed locally

Problem:
- The network/proxy UX is much better, but the runtime still treats proxy ordering and failures fairly bluntly.
- A weak public proxy can stay sticky longer than it should and degrade scan reliability.

Scope:
- Track recent proxy success/failure outcomes more explicitly.
- Prefer healthy proxies automatically when direct access is blocked.
- Demote or skip repeatedly failing proxies during scan retries without breaking the current settings UX.

Files:
- `/Users/mars/code/ZCT/orion-screener/index.html`
- `/Users/mars/code/ZCT/orion-screener/tests/settings.spec.js`
- `/Users/mars/code/ZCT/orion-screener/tests/smoke.spec.js`

Acceptance criteria:
- Failed proxies do not remain the de facto first choice during the same session.
- Existing settings controls, validation, and Test/Test All behavior stay intact.

Progress so far:
- Added per-proxy runtime health memory with failure streaks, success timestamps, and bounded cooldowns.
- Updated runtime proxy selection to rank healthier proxies ahead of recently failing ones during retries.
- Preserved the existing settings flow while clarifying the footnote copy about runtime failover behavior.
- Verified locally with `npx playwright test tests/settings.spec.js` on March 6, 2026 (`9 passed`).

## 4. Social Card Regression Harness

Status: Completed locally

Problem:
- The social-card system now supports compact `v2`, legacy `v1`, and hard expiry rules, but its edge-case coverage is still concentrated in a few scenario tests.

Scope:
- Add explicit regression cases for payload-size boundaries, malformed compact arrays, and mixed query-mode entry points.
- Keep the social-card-only product behavior unchanged.
- Preserve 3-day expiry and legacy `v1` decode support.

Files:
- `/Users/mars/code/ZCT/orion-screener/tests/social-card.spec.js`
- `/Users/mars/code/ZCT/orion-screener/tests/share.spec.js`
- `/Users/mars/code/ZCT/orion-screener/index.html`

Acceptance criteria:
- Core compact-payload and expiry behaviors are protected by targeted tests, not only broad end-to-end flows.
- No setup-link sharing is reintroduced.

Progress so far:
- Added regression coverage for oversized payload handling, malformed compact `v2` arrays, and mixed query-mode entry points.
- Kept the social-card-only behavior unchanged, including 3-day expiry and legacy `v1` decode support.
- Verified locally with `npx playwright test tests/social-card.spec.js tests/share.spec.js` on March 6, 2026 (`14 passed`).
