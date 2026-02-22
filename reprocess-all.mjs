const BASE = 'http://localhost:3333';

async function main() {
  const listR = await fetch(`${BASE}/api/invoices?status=`);
  const list = await listR.json();
  console.log(`Invoices to reprocess: ${list.length}\n`);

  for (let i = 0; i < list.length; i++) {
    const inv = list[i];
    console.log(`[${i + 1}/${list.length}] ID=${inv.id} ${(inv.display_name || '').substring(0, 50)}`);

    const t0 = Date.now();
    const r = await fetch(`${BASE}/api/invoices/${inv.id}/reprocess`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    const body = await r.json();

    if (r.status !== 200) {
      console.log(`  ERROR (${elapsed}s): ${body.error}`);
      continue;
    }

    // Check the result
    const detail = await (await fetch(`${BASE}/api/invoices/${inv.id}`)).json();
    const entries = detail.entries || [];
    const withAttrs = entries.filter(e => e.attrs && Object.keys(e.attrs || {}).length > 0).length;
    console.log(`  OK (${elapsed}s): total=$${detail.total_amount}, gst=$${detail.gst_amount}, ${entries.length} entries (${withAttrs} attrs), tier=${detail.ocr_tier}`);
  }

  console.log('\nDone!');
}

main().catch(e => { console.error(e); process.exit(1); });
