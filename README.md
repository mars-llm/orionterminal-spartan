# Spartan Orion Screener

A single‑file, no‑build market scanner for Binance Futures. Pulls live data from Orion Terminal’s public screener API, ranks active setups, and shows instant chart previews with the previous 15m + 1h candle S/R lines.

![Spartan Orion Screener](screenshot.png)
_Screenshot — use the **Download HTML** button in the footer to grab the standalone file._

## Why this exists
- **One file, no build** – open directly in your browser or host anywhere.
- **Fast market scan** – filters by volume, volatility, and trades.
- **Instant chart preview** – 1m chart by default with 4 S/R lines (prev 15m high/low + prev 1h high/low).
- **GitHub Pages ready** – ideal for quick sharing and distribution.

## Live Demo (GitHub Pages)
Once deployed, the app will be available at:
```
https://mars-llm.github.io/orionterminal-spartan/
```

## Download (standalone HTML)
From the GitHub Pages version, click **Download HTML** to save a self‑contained file you can run locally.

You can also download directly:
```
https://raw.githubusercontent.com/mars-llm/orionterminal-spartan/main/index.html
```

## Quick Start (local)
1. Download `index.html` (button or raw link).
2. Open it in any modern browser.
3. Click **Scan Market**.

That’s it — no server required.

## How it works
1. **Scan Market** triggers a fetch to Orion Terminal’s public screener API.
2. The response is parsed (2025+ and legacy formats supported).
3. Results are filtered by:
   - 24h volume (USD)
   - 15m volatility
   - 5m trade count
   - symbol exclusion list
4. Results are sorted by activity (5m trades → 15m volatility → volume).
5. Hover a row to open a lightweight chart preview (Binance kline data).
6. If enabled, the chart draws **4 S/R lines**:
   - previous **15m** candle high/low
   - previous **1h** candle high/low

## Deploy to GitHub Pages
1. Create the repo: `mars-llm/orionterminal-spartan`
2. Add these files to the root:
   - `index.html`
   - `manifest.webmanifest`
   - `service-worker.js`
   - `icon-192.png`
   - `icon-512.png`
   - `README.md`
3. Push to `main`.
4. In GitHub:
   - **Settings → Pages → Build and deployment**
   - Source: **Deploy from a branch**
   - Branch: **main** / **/ (root)**
5. Your app will be live at:
   `https://mars-llm.github.io/orionterminal-spartan/`

## PWA Install
When hosted on GitHub Pages:
- Chrome/Edge: **Install app** button in the address bar.
- iOS Safari: **Share → Add to Home Screen**.

## Filters & Profiles
Built‑in presets:
- Default
- High Volume Majors
- Low Cap Gems
- Scalping

All filters are editable from the **Filters** panel.

## Settings
- Chart preview on/off
- Timeframe (default: **1m**)
- Hover delay
- Preview size
- 15m S/R toggle
- 1h S/R toggle

## Data Sources
- **Orion Terminal API** – `https://screener.orionterminal.com/api/screener`
- **Binance Futures API** – `https://fapi.binance.com/fapi/v1/klines`
- **TradingView Lightweight Charts** – CDN

## Notes
- The Orion API does not ship CORS headers. This tool uses public CORS proxies to make `file://` usage possible.
- Chart previews are cached briefly to reduce API calls.
- Data is provided by Orion Terminal and Binance. Please use responsibly and follow provider terms and rate limits.

## License
MIT
