const { test, expect } = require('./coverage.fixture');

test.skip(!!process.env.E2E_BASE_URL, 'Deterministic local chart price axes');

const ranges = [
  { name: 'sub-cent', price: 0.01159, precision: 5 },
  { name: 'micro', price: 0.00001159, precision: 8 },
  { name: 'nano', price: 0.00000001159, precision: 11 },
  { name: 'smaller than a satoshi', price: 1.159e-11, precision: 14 },
  { name: 'near one', price: 0.999999, precision: 6 },
  { name: 'fractional unit', price: 1.234567, precision: 6 },
  { name: 'tens', price: 12.345, precision: 3 },
  { name: 'large', price: 67123.4, precision: 2 },
  { name: 'very large', price: 123456789.25, precision: 2 },
  { name: 'pico', price: 1.159e-12, precision: 15 },
];

async function setupPriceChart(page, range) {
  const requests = { intervals: [], extras: 0 };
  const step = 10 ** -range.precision;
  const rounded = value => Number(value.toPrecision(15));
  const candle = { time: 1710000000, open: range.price,
    high: rounded(range.price + step), low: rounded(range.price - step), close: range.price, volume: 10 };
  await page.route('https://fapi.binance.com/fapi/v1/**', route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/klines')) {
      requests.intervals.push(url.searchParams.get('interval'));
      return route.fulfill({ json: [0, 1].map(index => [
        (candle.time + index * 60) * 1000, candle.open, candle.high, candle.low, candle.close, candle.volume,
      ]) });
    }
    requests.extras += 1;
    return route.fulfill({ json: url.pathname.endsWith('/premiumIndex')
      ? { markPrice: String(range.price), indexPrice: String(range.price), lastFundingRate: '0.0001' }
      : { openInterest: '1000' } });
  });
  await page.goto('./');
  await page.evaluate(price => {
    window.__priceSeries = null;
    window.__volumeFormats = [];
    window.LightweightCharts = {
      CrosshairMode: { Normal: 0 }, LineStyle: { Dashed: 2 },
      createChart(container) {
        container.replaceChildren(document.createElement('canvas'));
        const scale = { applyOptions() {} };
        const extraSeries = options => {
          window.__volumeFormats.push(options.priceFormat.type);
          return { setData() {}, applyOptions() {} };
        };
        return {
          remove() {}, resize() {}, applyOptions() {},
          timeScale: () => ({ fitContent() {} }), priceScale: () => scale,
          addCandlestickSeries(options) {
            window.__priceSeries = { options, candles: [], lines: [] };
            return {
              setData(candles) { window.__priceSeries.candles = candles; },
              applyOptions(next) { Object.assign(options, next); },
              priceScale: () => scale,
              createPriceLine(line) { window.__priceSeries.lines.push(line); return line; },
              removePriceLine() {},
            };
          },
          addHistogramSeries: extraSeries, addLineSeries: extraSeries,
        };
      },
    };
    picks = [{ symbol: 'ALPHA/USDT', price, exchange: 'binanceusdm',
      volume24h: 2000000, ticks5m: 600, ticks15m: 1800, volatility15m: 2,
      priceChange1h: 1, priceChange4h: 2, priceChange24h: 3 }];
    renderPicks();
  }, range.price);
  return { requests, candle };
}

for (const range of ranges) {
  test(`price axis: ${range.name} prices stay precise across all timeframes without extra requests`, async ({ page }) => {
    const { requests, candle } = await setupPriceChart(page, range);
    await page.evaluate(() => showChartPreview('ALPHA/USDT', document.querySelector('.pick-card')));
    await page.locator('#chartPreviewMaximize').click();
    await expect(page.locator('#chartPreviewStats')).not.toContainText('Loading');
    const assertPriceAxis = async () => {
      const state = await page.evaluate(() => {
        const { options, candles } = window.__priceSeries;
        const format = options.priceFormat;
        return { type: format && format.type, precision: format && format.precision,
          minMove: format && format.minMove, first: candles[0],
          customLabels: format && format.type === 'custom'
            ? [candles[0].low, candles[0].close, candles[0].high].map(format.formatter) : null };
      });
      expect(state.first).toEqual(candle);
      expect(state.minMove).toBeCloseTo(10 ** -range.precision, range.precision + 2);
      if (range.precision > 16) {
        expect(new Set(state.customLabels).size).toBe(3);
        expect(state.customLabels.every(label => /e-\d+$/.test(label))).toBe(true);
        expect(state.customLabels.map(Number)).toEqual([candle.low, candle.close, candle.high]);
      } else {
        expect(state.customLabels).toEqual([candle.low, candle.close, candle.high].map(value => value.toFixed(range.precision)));
        expect(new Set(state.customLabels).size).toBe(3);
      }
      expect(state.type).toBe('custom');
    };
    await assertPriceAxis();
    for (const timeframe of ['5m', '15m', '1h', '4h', '1d', '1m']) {
      await page.locator('#chartPreviewTimeframeSelect').selectOption(timeframe);
      await expect(page.locator('#chartPreviewLoading')).toHaveClass(/hidden/);
      await assertPriceAxis();
      expect(await page.evaluate(() => JSON.parse(currentPreviewSettings).timeframe)).toBe(timeframe);
    }
    const before = { intervals: [...requests.intervals], extras: requests.extras };
    await page.evaluate(() => {
      addSRLinesToChart([{ price: window.__priceSeries.candles[0].low, type: 'support' }], '#ff0000', '15m', true);
      applyTheme('light', false);
      applyTheme('dark', false);
      closeChartPreview();
    });
    await page.getByRole('button', { name: 'Show chart for ALPHA/USDT' }).click();
    await expect(page.locator('#chartPreviewLoading')).toHaveClass(/hidden/);
    await assertPriceAxis();
    expect(requests).toEqual(before);
    expect(requests).toEqual({ intervals: ['1m', '5m', '15m', '1h', '4h', '1d'], extras: 2 });
    expect(await page.evaluate(() => window.__volumeFormats.every(type => type === 'volume'))).toBe(true);
  });
}

test('price axis: all OHLC values determine precision without floating-point noise or mutation', async ({ page }) => {
  await page.goto('./');
  const result = await page.evaluate(() => {
    const candles = [{ open: 1, high: 2, low: 0.123456789, close: 1 },
      { open: 0.1 + 0.2, high: 1, low: 0.3, close: 0.3 }];
    const original = JSON.stringify(candles);
    const probe = (rows, price) => {
      const format = getChartPriceFormat(rows);
      return { type: format.type, minMove: format.minMove, label: format.formatter(price) };
    };
    return { format: probe(candles, 0.123456789), unchanged: JSON.stringify(candles) === original,
      noise: probe([candles[1]], 0.3), flat: probe([{ close: 0.01 }], 0.01),
      empty: probe([], 1), invalid: probe([null, {}, { close: NaN },
        { close: Infinity }, { close: 0 }, { close: -1 }], 1),
      scientific: probe([{ close: 1.159e-18 }], 1.159e-18),
      nonfinite: [NaN, Infinity, -Infinity].map(value => getChartPriceFormat([]).formatter(value)) };
  });
  expect(result.format).toEqual({ type: 'custom', minMove: 1e-9, label: '0.123456789' });
  expect(result.unchanged).toBe(true);
  expect(result.noise).toEqual({ type: 'custom', minMove: 0.0001, label: '0.3000' });
  expect(result.flat).toEqual({ type: 'custom', minMove: 0.00001, label: '0.01000' });
  expect(result.empty).toEqual({ type: 'custom', minMove: 0.01, label: '1.00' });
  expect(result.invalid).toEqual(result.empty);
  expect(result.scientific).toEqual({ type: 'custom', minMove: 1e-21, label: '1.159e-18' });
  expect(result.nonfinite).toEqual(['—', '—', '—']);
});

test('price axis: cached symbol and timeframe changes restore their own price format', async ({ page }) => {
  const { requests } = await setupPriceChart(page, ranges[0]);
  await page.evaluate(() => {
    const data = (price, delta) => [{ time: 1710000000, open: price, high: price + delta,
      low: price - delta, close: price, volume: 10 }];
    setCachedData(getChartCacheKey('binance-futures', 'ALPHAUSDT', '1m', 100), data(0.01159, 0.00001));
    setCachedData(getChartCacheKey('binance-futures', 'ALPHAUSDT', '1d', 100), data(0.999999, 0.000001));
    setCachedData(getChartCacheKey('binance-futures', 'BRAVOUSDT', '1m', 100), data(67123.4, 0.01));
  });
  for (const [symbol, timeframe, precision] of [
    ['ALPHA/USDT', '1m', 5], ['ALPHA/USDT', '1d', 6], ['BRAVO/USDT', '1m', 2], ['ALPHA/USDT', '1m', 5],
  ]) {
    await page.evaluate(async ({ symbol, timeframe }) => {
      chartSettings.timeframe = timeframe;
      await showChartPreview(symbol, document.querySelector('.pick-card'));
    }, { symbol, timeframe });
    expect(await page.evaluate(() => window.__priceSeries.options.priceFormat.minMove)).toBe(Number('1e-' + precision));
    await expect(page.locator('#chartPreviewSymbol')).toHaveText(symbol);
  }
  expect(requests).toEqual({ intervals: [], extras: 0 });
});
