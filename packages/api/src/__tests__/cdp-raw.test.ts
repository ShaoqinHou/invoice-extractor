import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync, spawn, type ChildProcess } from 'child_process';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import WebSocket from 'ws';

/**
 * Type 7: Raw CDP (Chrome DevTools Protocol) test.
 * Launches Chrome manually, connects via WebSocket, sends CDP commands.
 * This is what the /verify skill's MCP server would do under the hood.
 */

let chrome: ChildProcess;
let wsUrl: string;
let server: ReturnType<typeof serve>;
let pageUrl: string;

function cdpCommand(ws: WebSocket, id: number, method: string, params: Record<string, unknown> = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`CDP timeout: ${method}`)), 10_000);
    const handler = (data: WebSocket.Data) => {
      const msg = JSON.parse(data.toString());
      if (msg.id === id) {
        clearTimeout(timeout);
        ws.off('message', handler);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

beforeAll(async () => {
  // Start a test page server
  const app = new Hono();
  app.get('/', (c) =>
    c.html(`<!DOCTYPE html><html><body>
      <h1 id="heading">CDP Test Page</h1>
      <div id="counter">0</div>
      <script>window.myGlobal = 42;</script>
    </body></html>`)
  );

  await new Promise<void>((resolve) => {
    server = serve({ fetch: app.fetch, port: 0 }, (info) => {
      pageUrl = `http://localhost:${info.port}`;
      resolve();
    });
  });

  // Launch Chrome with remote debugging
  chrome = spawn('/usr/bin/google-chrome-stable', [
    '--headless', '--no-sandbox', '--disable-gpu',
    '--remote-debugging-port=9333',
    '--remote-debugging-address=127.0.0.1',
    'about:blank',
  ], { stdio: 'pipe' });

  // Wait for Chrome to be ready
  for (let i = 0; i < 20; i++) {
    try {
      await new Promise((r) => setTimeout(r, 500));
      const res = await fetch('http://127.0.0.1:9333/json/version');
      const data = await res.json();
      wsUrl = data.webSocketDebuggerUrl;
      break;
    } catch {
      // retry
    }
  }
  if (!wsUrl) throw new Error('Chrome did not start');
}, 30_000);

afterAll(() => {
  chrome?.kill();
  server?.close();
});

describe('Raw CDP protocol', () => {
  it('connects to Chrome and gets browser version', async () => {
    const res = await fetch('http://127.0.0.1:9333/json/version');
    const data = await res.json();
    expect(data.Browser).toContain('Chrome');
    expect(data['Protocol-Version']).toBe('1.3');
  });

  it('creates a new tab, navigates, and reads DOM via CDP', async () => {
    // Create new target (tab) — URL must be PUT as the body or encoded properly
    const createRes = await fetch(`http://127.0.0.1:9333/json/new?${encodeURIComponent(pageUrl)}`, { method: 'PUT' });
    const text = await createRes.text();
    let target: any;
    try { target = JSON.parse(text); } catch {
      // Fallback: get first available tab from list
      const listRes = await fetch('http://127.0.0.1:9333/json/list');
      const tabs = await listRes.json();
      // Navigate existing about:blank tab
      target = tabs.find((t: any) => t.url === 'about:blank') || tabs[0];
    }
    const targetWsUrl = target.webSocketDebuggerUrl;

    const ws = new WebSocket(targetWsUrl);
    await new Promise<void>((resolve) => ws.on('open', resolve));

    try {
      // Enable page events
      await cdpCommand(ws, 1, 'Page.enable');

      // Navigate
      await cdpCommand(ws, 2, 'Page.navigate', { url: pageUrl });
      await cdpCommand(ws, 3, 'Page.loadEventFired' as any).catch(() => {});
      // Small wait for page load
      await new Promise((r) => setTimeout(r, 1000));

      // Read DOM via JavaScript evaluation
      const evalResult = await cdpCommand(ws, 4, 'Runtime.evaluate', {
        expression: 'document.getElementById("heading").textContent',
      });
      expect(evalResult.result.value).toBe('CDP Test Page');

      // Read a JS global
      const globalResult = await cdpCommand(ws, 5, 'Runtime.evaluate', {
        expression: 'window.myGlobal',
      });
      expect(globalResult.result.value).toBe(42);

      // Take a screenshot via CDP
      const screenshot = await cdpCommand(ws, 6, 'Page.captureScreenshot', {
        format: 'png',
      });
      expect(screenshot.data).toBeTruthy();
      // It's a base64 string
      const buf = Buffer.from(screenshot.data, 'base64');
      expect(buf.length).toBeGreaterThan(100);
    } finally {
      ws.close();
      // Close the tab
      await fetch(`http://127.0.0.1:9333/json/close/${target.id}`).catch(() => {});
    }
  });

  it('can list all open tabs', async () => {
    const res = await fetch('http://127.0.0.1:9333/json/list');
    const tabs = await res.json();
    expect(Array.isArray(tabs)).toBe(true);
  });
});
