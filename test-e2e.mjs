/**
 * End-to-end test of Invoice Extractor using Playwright.
 * Tests: page load, table display, review page, file upload, approve flow.
 *
 * Usage: node test-e2e.mjs
 * Requires: both servers running (npm run dev:api & npm run dev:web)
 */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const BASE = 'http://localhost:5175';
const PDF_FILE = String.raw`C:\Users\housh\Documents\WeChat Files\wxid_2hlwl0a6tr8y22\FileStorage\File\2026-02\20250224 Watercare $55.88.pdf`;
const HEIC_FILE = String.raw`C:\Users\housh\Documents\WeChat Files\wxid_2hlwl0a6tr8y22\FileStorage\File\2026-02\20250112 bunnings $41.79.HEIC`;

const issues = [];
let stepNum = 0;

function step(msg) {
  stepNum++;
  console.log(`\n── Step ${stepNum}: ${msg} ──`);
}

function issue(severity, msg, detail = '') {
  issues.push({ severity, msg, detail });
  console.log(`  ❌ [${severity}] ${msg}${detail ? ': ' + detail : ''}`);
}

function ok(msg) {
  console.log(`  ✅ ${msg}`);
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  // Verify test files exist
  for (const f of [PDF_FILE, HEIC_FILE]) {
    if (!fs.existsSync(f)) {
      console.error(`Test file not found: ${f}`);
      process.exit(1);
    }
  }

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  // Collect console errors
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => {
    consoleErrors.push(err.message);
    issue('ERROR', 'Page JS error', err.message);
  });

  try {
    // ── 1. Load app ──
    step('Load app at ' + BASE);
    const response = await page.goto(BASE, { waitUntil: 'networkidle', timeout: 15000 });
    if (!response || response.status() >= 400) {
      issue('CRITICAL', 'App failed to load', `status ${response?.status()}`);
      return;
    }
    // Should redirect to /invoices
    await page.waitForURL('**/invoices', { timeout: 5000 }).catch(() => {});
    const url = page.url();
    if (url.includes('/invoices')) {
      ok('Redirected to /invoices');
    } else {
      issue('ERROR', 'Did not redirect to /invoices', url);
    }

    // ── 2. Check page structure ──
    step('Check All Invoices page structure');

    // Title
    const title = await page.locator('h1, h2, [class*="title"]').first().textContent().catch(() => null);
    if (title && title.includes('Invoice')) {
      ok(`Page title: "${title.trim()}"`);
    } else {
      issue('WARN', 'Page title missing or wrong', title);
    }

    // Top bar
    const topBar = await page.locator('header').first().isVisible().catch(() => false);
    if (topBar) {
      ok('Top bar visible');
    } else {
      issue('ERROR', 'Top bar not visible');
    }

    // Status tabs
    const tabs = await page.locator('button, [role="tab"]').allTextContents();
    const tabTexts = tabs.map(t => t.trim()).filter(t => t);
    const expectedTabs = ['All', 'Processing', 'Awaiting Review', 'Approved', 'Error'];
    for (const t of expectedTabs) {
      if (tabTexts.some(tt => tt.includes(t))) {
        ok(`Tab "${t}" found`);
      } else {
        issue('ERROR', `Tab "${t}" missing`, `Found: ${tabTexts.join(', ')}`);
      }
    }

    // ── 3. Check table ──
    step('Check invoice table');
    await sleep(2000); // Wait for data to load

    const tableRows = await page.locator('table tbody tr').count().catch(() => 0);
    if (tableRows > 0) {
      ok(`Table has ${tableRows} rows`);
    } else {
      // Maybe loading or error state
      const loadingText = await page.locator('text=Loading').isVisible().catch(() => false);
      const errorText = await page.locator('text=Failed').isVisible().catch(() => false);
      const noData = await page.locator('text=No invoices').isVisible().catch(() => false);
      if (loadingText) issue('ERROR', 'Table stuck in loading state');
      else if (errorText) issue('ERROR', 'Table shows error state');
      else if (noData) issue('WARN', 'Table shows no invoices (but API has 9)');
      else issue('ERROR', 'Table has no rows and no status message');
    }

    // Check table headers
    const headers = await page.locator('table thead th').allTextContents();
    const headerTexts = headers.map(t => t.trim()).filter(t => t);
    console.log(`  Table headers: ${headerTexts.join(' | ')}`);
    for (const h of ['Name', 'Supplier', 'Date', 'Amount', 'Status']) {
      if (headerTexts.some(ht => ht.includes(h))) {
        ok(`Header "${h}" found`);
      } else {
        issue('ERROR', `Header "${h}" missing`);
      }
    }

    // ── 4. Check search ──
    step('Test search input');
    const searchInput = page.locator('input[type="search"], input[placeholder*="Search"]').first();
    const searchVisible = await searchInput.isVisible().catch(() => false);
    if (searchVisible) {
      ok('Search input visible');
      await searchInput.fill('watercare');
      await sleep(500);
      const filteredRows = await page.locator('table tbody tr').count().catch(() => -1);
      console.log(`  After search "watercare": ${filteredRows} rows`);
      await searchInput.fill('');
      await sleep(500);
    } else {
      issue('ERROR', 'Search input not found');
    }

    // ── 5. Click into review page ──
    step('Navigate to review page');
    // Click the first "Review" link or first invoice link
    const reviewLink = page.locator('a[href*="/invoices/"]').first();
    const reviewLinkExists = await reviewLink.isVisible().catch(() => false);
    if (!reviewLinkExists) {
      issue('CRITICAL', 'No invoice links found in table');
    } else {
      const href = await reviewLink.getAttribute('href');
      console.log(`  Clicking link: ${href}`);
      await reviewLink.click();
      await sleep(2000);

      const reviewUrl = page.url();
      if (reviewUrl.match(/\/invoices\/\d+/)) {
        ok(`On review page: ${reviewUrl}`);
      } else {
        issue('ERROR', 'Did not navigate to review page', reviewUrl);
      }
    }

    // ── 6. Check review page structure ──
    step('Check review page structure');

    // Sidebar
    const sidebar = await page.locator('[class*="w-[280px]"], [class*="w-\\[280px\\]"]').first().isVisible().catch(() => false);
    if (sidebar) {
      ok('Sidebar visible');
    } else {
      // Try broader check
      const sidebarAlt = await page.locator('text=Awaiting Review').first().isVisible().catch(() => false);
      if (sidebarAlt) {
        ok('Sidebar visible (found "Awaiting Review" text)');
      } else {
        issue('ERROR', 'Sidebar not visible');
      }
    }

    // PDF viewer
    const iframe = await page.locator('iframe').first().isVisible().catch(() => false);
    const img = await page.locator('img[src*="/api/invoices/"]').first().isVisible().catch(() => false);
    if (iframe || img) {
      ok(`PDF/Image viewer visible (${iframe ? 'iframe' : 'img'})`);
    } else {
      issue('ERROR', 'PDF/Image viewer not found (no iframe or img)');
    }

    // Form fields
    const inputs = await page.locator('input[type="text"], input[type="number"], input[type="date"]').count();
    if (inputs >= 5) {
      ok(`Review form has ${inputs} input fields`);
    } else {
      issue('ERROR', `Review form has only ${inputs} input fields (expected 5+)`);
    }

    // Approve button
    const approveBtn = page.locator('button:has-text("Approve")').first();
    const approveBtnVisible = await approveBtn.isVisible().catch(() => false);
    if (approveBtnVisible) {
      ok('Approve button visible');
    } else {
      issue('ERROR', 'Approve button not found');
    }

    // Skip button
    const skipBtn = page.locator('button:has-text("Skip")').first();
    const skipBtnVisible = await skipBtn.isVisible().catch(() => false);
    if (skipBtnVisible) {
      ok('Skip button visible');
    } else {
      issue('ERROR', 'Skip button not found');
    }

    // Delete button
    const deleteBtn = page.locator('button:has-text("Delete")').first();
    const deleteBtnVisible = await deleteBtn.isVisible().catch(() => false);
    if (deleteBtnVisible) {
      ok('Delete button visible');
    } else {
      issue('ERROR', 'Delete button not found');
    }

    // "All Invoices" back link
    const backLink = page.locator('a:has-text("All Invoices")').first();
    const backLinkVisible = await backLink.isVisible().catch(() => false);
    if (backLinkVisible) {
      ok('"All Invoices" back link visible');
    } else {
      issue('WARN', '"All Invoices" back link not found');
    }

    // ── 7. Test Skip ──
    step('Test Skip button');
    if (skipBtnVisible) {
      const beforeUrl = page.url();
      await skipBtn.click();
      await sleep(2000);
      const afterUrl = page.url();
      if (afterUrl !== beforeUrl) {
        ok(`Skip navigated: ${beforeUrl} → ${afterUrl}`);
      } else {
        issue('WARN', 'Skip button did not navigate to different invoice');
      }
    }

    // ── 8. Go back to All Invoices ──
    step('Navigate back to All Invoices');
    await page.goto(BASE + '/invoices', { waitUntil: 'networkidle', timeout: 10000 });
    await sleep(1000);

    // ── 9. Test file upload via Upload button ──
    step('Test file upload (PDF)');

    // Click Upload button to reveal drop zone
    const uploadBtn = page.locator('button:has-text("Upload")').first();
    const uploadBtnVisible = await uploadBtn.isVisible().catch(() => false);
    if (uploadBtnVisible) {
      await uploadBtn.click();
      await sleep(500);
      ok('Upload panel opened');
    } else {
      issue('ERROR', 'Upload button not found on All Invoices page');
    }

    // Find file input and upload PDF
    const fileInput = page.locator('input[type="file"]').first();
    const fileInputExists = await fileInput.count() > 0;
    if (fileInputExists) {
      await fileInput.setInputFiles(PDF_FILE);
      ok(`Uploaded: ${path.basename(PDF_FILE)}`);
      await sleep(3000); // Wait for upload to complete

      // Check upload status
      const doneIcon = await page.locator('[class*="text-emerald"]').first().isVisible().catch(() => false);
      const errorIcon = await page.locator('[class*="text-red"]').first().isVisible().catch(() => false);
      const dupText = await page.locator('text=Duplicate').first().isVisible().catch(() => false);
      if (doneIcon) ok('Upload completed successfully (green check)');
      else if (dupText) ok('File is a duplicate (expected if previously uploaded)');
      else if (errorIcon) issue('ERROR', 'Upload failed (red icon)');
      else issue('WARN', 'Upload status unclear');
    } else {
      issue('ERROR', 'File input not found');
    }

    // ── 10. Upload HEIC file ──
    step('Test file upload (HEIC image)');
    if (fileInputExists) {
      await fileInput.setInputFiles(HEIC_FILE);
      ok(`Uploaded: ${path.basename(HEIC_FILE)}`);
      await sleep(3000);

      const doneIcons = await page.locator('[class*="text-emerald"]').count();
      console.log(`  Upload status icons (green): ${doneIcons}`);
    }

    // ── 11. Check table updated ──
    step('Check table shows uploaded invoices');
    await sleep(2000);
    // Close upload panel if open
    const closeUpload = page.locator('button:has([class*="w-4"][class*="h-4"])').first();

    const newTableRows = await page.locator('table tbody tr').count().catch(() => 0);
    console.log(`  Table now has ${newTableRows} rows`);

    // ── 12. Test global drag-and-drop overlay ──
    step('Test global drag-and-drop overlay');
    // We can simulate dragenter event
    await page.evaluate(() => {
      const event = new DragEvent('dragenter', {
        bubbles: true,
        cancelable: true,
        dataTransfer: new DataTransfer(),
      });
      event.dataTransfer.items.add(new File(['test'], 'test.pdf', { type: 'application/pdf' }));
      document.querySelector('.flex.h-screen')?.dispatchEvent(event);
    });
    await sleep(500);
    const overlay = await page.locator('text=Drop files to upload').isVisible().catch(() => false);
    if (overlay) {
      ok('Global drag overlay appeared');
    } else {
      issue('WARN', 'Global drag overlay did not appear (may need real drag event)');
    }

    // Dismiss overlay
    await page.evaluate(() => {
      document.querySelector('.flex.h-screen')?.dispatchEvent(
        new DragEvent('dragleave', { bubbles: true, cancelable: true })
      );
    });

    // ── 13. Check console errors ──
    step('Check for console errors');
    if (consoleErrors.length === 0) {
      ok('No console errors');
    } else {
      for (const err of consoleErrors) {
        issue('WARN', 'Console error', err.slice(0, 150));
      }
    }

    // ── 14. Take screenshot ──
    step('Take final screenshot');
    await page.goto(BASE + '/invoices', { waitUntil: 'networkidle', timeout: 10000 });
    await sleep(2000);
    await page.screenshot({ path: 'test-screenshot-list.png', fullPage: true });
    ok('Saved test-screenshot-list.png');

    // Screenshot of review page
    const firstLink = page.locator('a[href*="/invoices/"]').first();
    if (await firstLink.isVisible().catch(() => false)) {
      await firstLink.click();
      await sleep(2000);
      await page.screenshot({ path: 'test-screenshot-review.png', fullPage: true });
      ok('Saved test-screenshot-review.png');
    }

  } catch (err) {
    issue('CRITICAL', 'Test crashed', err.message);
    console.error(err);
  } finally {
    // ── Summary ──
    console.log('\n' + '═'.repeat(60));
    console.log('TEST SUMMARY');
    console.log('═'.repeat(60));

    const critical = issues.filter(i => i.severity === 'CRITICAL');
    const errors = issues.filter(i => i.severity === 'ERROR');
    const warns = issues.filter(i => i.severity === 'WARN');

    if (issues.length === 0) {
      console.log('✅ All checks passed!');
    } else {
      if (critical.length) {
        console.log(`\n🔴 CRITICAL (${critical.length}):`);
        critical.forEach(i => console.log(`   - ${i.msg}${i.detail ? ': ' + i.detail : ''}`));
      }
      if (errors.length) {
        console.log(`\n🟠 ERRORS (${errors.length}):`);
        errors.forEach(i => console.log(`   - ${i.msg}${i.detail ? ': ' + i.detail : ''}`));
      }
      if (warns.length) {
        console.log(`\n🟡 WARNINGS (${warns.length}):`);
        warns.forEach(i => console.log(`   - ${i.msg}${i.detail ? ': ' + i.detail : ''}`));
      }
    }

    console.log(`\nTotal: ${critical.length} critical, ${errors.length} errors, ${warns.length} warnings`);
    console.log('═'.repeat(60));

    await browser.close();
  }
}

main().catch(console.error);
