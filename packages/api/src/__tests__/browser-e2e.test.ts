import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';

/**
 * Type 6: Browser E2E test — real Playwright + real Chrome + real HTTP page.
 * Serves a minimal HTML page, navigates Chrome to it, asserts on DOM.
 */

let browser: Browser;
let page: Page;
let server: ReturnType<typeof serve>;
let baseUrl: string;

beforeAll(async () => {
  // Minimal Hono server with a test page
  const app = new Hono();
  app.get('/', (c) =>
    c.html(`<!DOCTYPE html>
      <html><body>
        <h1 id="title">Invoice Extractor</h1>
        <button id="btn" onclick="document.getElementById('result').textContent='clicked'">Click Me</button>
        <p id="result"></p>
      </body></html>`)
  );

  await new Promise<void>((resolve) => {
    server = serve({ fetch: app.fetch, port: 0 }, (info) => {
      baseUrl = `http://localhost:${info.port}`;
      resolve();
    });
  });

  // Launch Chrome — use the system-installed binary
  browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome-stable',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
    headless: true,
  });
  page = await browser.newPage();
}, 30_000);

afterAll(async () => {
  await page?.close().catch(() => {});
  await browser?.close().catch(() => {});
  server?.close();
});

describe('Playwright browser E2E', () => {
  it('navigates to page and reads DOM', async () => {
    await page.goto(baseUrl);
    const title = await page.textContent('#title');
    expect(title).toBe('Invoice Extractor');
  });

  it('clicks a button and verifies DOM update', async () => {
    await page.goto(baseUrl);
    const resultBefore = await page.textContent('#result');
    expect(resultBefore).toBe('');

    await page.click('#btn');

    const resultAfter = await page.textContent('#result');
    expect(resultAfter).toBe('clicked');
  });

  it('takes a screenshot (returns buffer)', async () => {
    await page.goto(baseUrl);
    const screenshot = await page.screenshot();
    expect(screenshot).toBeInstanceOf(Buffer);
    expect(screenshot.length).toBeGreaterThan(0);
  });

  it('evaluates JavaScript in the browser context', async () => {
    await page.goto(baseUrl);
    const result = await page.evaluate(() => {
      return document.querySelectorAll('button').length;
    });
    expect(result).toBe(1);
  });

  it('captures network requests', async () => {
    const requests: string[] = [];
    page.on('request', (req) => requests.push(req.url()));

    await page.goto(baseUrl);

    expect(requests.some((r) => r.includes(baseUrl))).toBe(true);
    page.removeAllListeners('request');
  });
});
