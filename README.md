# Spartan Orion Screener

Single-file market scanner for Binance USDT-M perpetual futures. It scans Binance directly, ranks the strongest candidates, shows instant chart previews, and shares compact social cards without signup or API keys. GitHub Pages hosts the production demonstration build.

**[Launch App](https://mars-llm.github.io/orionterminal-spartan/)** · [Download HTML](https://raw.githubusercontent.com/mars-llm/orionterminal-spartan/main/index.html) · [GitHub](https://github.com/mars-llm/orionterminal-spartan)

![Spartan Orion Screener](screenshot.png)

## What You Get

- One-click scans with ranked `Top 1-3` candidates and metric tooltips
- `New` badges highlight setups absent from the previous successful scan with the same filters; comparisons stay in memory and reset when the page reloads
- Instant chart previews plus a larger modal with S/R overlays, MA, volume, funding, and open interest
- Built-in presets for majors, low caps, scalping, and the default mid-cap flow
- Settings for chart appearance, display behavior, and CORS/proxy management
- Social-card-only sharing for either the current top setups or the active filter state
- PWA install support and a downloadable `index.html` for local use

## Quick Start

1. Open the [live production demonstration build](https://mars-llm.github.io/orionterminal-spartan/) or download `index.html`.
2. Click **Scan Market**.
3. Wait for the market checks to finish, then hover a result row for the chart preview or expand it for the full modal.
4. Use **Share Social Card** to create a visual share link.

If the browser restricts requests when opening `index.html` from `file://`, serve the folder locally and open it in the browser:

```bash
python3 -m http.server 8000
```

Install as an app from Chrome/Edge via the install icon, or from iOS Safari via **Share -> Add to Home Screen**.

## Sharing

- Sharing is social-card-only. Setup-link sharing is intentionally not part of the product anymore.
- If results exist, the card captures the top setups. If results are empty, it captures the active filter thresholds.
- Supported URLs are `?card=<payload>` and `?view=social-card&card=<payload>`.
- New links use compact `v2` payloads. Legacy `v1` payloads still decode.
- Cards expire after 3 days and expired cards are explicitly blocked.
- There is no backend storage; the full card payload lives in the URL.
- Social-card URLs are public by design, so never add private details to shared captions, filters, or derived metadata.

## Market coverage

- Scans use Binance's active, USDT-quoted and USDT-margined perpetual contracts directly. They do not depend on Orion's preview, sign-in, or a CORS proxy.
- Rolling 24h volume is Binance quote volume in USDT. The 5m activity filter uses the number of trades in the latest closed 5m candle. The 15m range is `(highest high / lowest low - 1) * 100` across the latest three closed 5m candles. These are explicit candle-based metrics, not replicas of Orion's calculations.
- Closed-candle metrics can lag the current market by up to five minutes. The 1h and 4h changes use complete 12- and 48-candle windows; missing longer windows are unavailable, not reported as zero.
- The first scan checks every market passing the volume/exclusion prefilters with at most six concurrent candle requests and a 90-second overall deadline. Candle data is reused within its closed 5m window, and exchange metadata is cached for ten minutes.
- Missing market data produces a visible incomplete-scan notice, including on setup social cards. Rate-limit and regional-access responses stop the scan; they are not bypassed through proxies. Retry is user-triggered rather than automatically replaying a full batch.
- USDC, delivery, inactive, and conflicting base-asset/symbol markets are excluded. Displayed results still obey the selected result limit.

## Development

This is a single-file-first frontend app centered on `index.html`.

```bash
npm install
npm run sync:build-meta
npm test
```

Useful commands:

- `npm run test:e2e` runs the local Playwright suite.
- `npm run test:e2e:live` runs the live GitHub Pages gate.
- `npm run test:coverage` writes browser coverage summaries to `coverage/`.
- `npm run test:social-card` focuses on social-card regressions.

## Deployment Verification

- `npm run sync:build-meta` generates `build-meta.json`.
- The app exposes build metadata in the footer, on the root HTML element, and through `window.__ORION_BUILD_INFO__`.
- Runtime checks can verify `data-app-build`, `data-build-date`, `data-card-payload-version`, `data-service-worker-cache`, `data-runtime-channel`, and `data-build-source`.
- Public build metadata must stay release-safe: never expose local paths, usernames, tokens, or other private machine details.

## Data Sources

- [Binance Futures](https://www.binance.com) for the market universe, rolling tickers, candles, funding, and open interest
- Binance Vision, Coinbase, and Kraken as chart fallbacks when needed
- Configurable proxies for chart fallbacks and legacy diagnostics only; market scans never use them
- [Lightweight Charts](https://tradingview.github.io/lightweight-charts/) for chart rendering

MIT License
