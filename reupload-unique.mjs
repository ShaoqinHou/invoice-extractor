import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const BASE = 'http://localhost:3333';
const UPLOADS = './uploads';

async function main() {
  const files = fs.readdirSync(UPLOADS);

  // Find unique files by hash
  const hashMap = new Map();
  for (const f of files) {
    const buf = fs.readFileSync(path.join(UPLOADS, f));
    const hash = crypto.createHash('md5').update(buf).digest('hex');
    if (!hashMap.has(hash)) {
      // Extract original filename
      const origName = f.replace(/^\d+_[a-f0-9]+_/, '');
      hashMap.set(hash, { path: path.join(UPLOADS, f), origName, size: buf.length });
    }
  }

  // Skip test-invoice.pdf (1KB dummy)
  const toUpload = [...hashMap.values()].filter(f => f.origName !== 'test-invoice.pdf');
  console.log(`Uploading ${toUpload.length} unique files...\n`);

  for (let i = 0; i < toUpload.length; i++) {
    const file = toUpload[i];
    console.log(`[${i + 1}/${toUpload.length}] ${file.origName} (${(file.size / 1024).toFixed(0)}KB)`);

    const buf = fs.readFileSync(file.path);
    const blob = new Blob([buf], { type: 'application/octet-stream' });
    const formData = new FormData();
    formData.append('file', blob, file.origName);

    const r = await fetch(`${BASE}/api/invoices`, { method: 'POST', body: formData });
    const body = await r.json();

    if (r.status === 202) {
      console.log(`  OK: id=${body.id} "${body.display_name}"`);
    } else if (r.status === 409) {
      console.log(`  DUPLICATE: already exists as id=${body.existing_id}`);
    } else {
      console.log(`  ERROR ${r.status}: ${body.error}`);
    }
  }

  // Wait for processing to finish
  console.log('\nWaiting for processing to complete...');
  let pending = true;
  while (pending) {
    await new Promise(r => setTimeout(r, 5000));
    const queueR = await fetch(`${BASE}/api/invoices/queue`);
    const queue = await queueR.json();
    const processing = queue.filter(q => ['uploading', 'extracting', 'processing', 'verifying'].includes(q.status));
    if (processing.length === 0) {
      pending = false;
      console.log('All processing complete!');
    } else {
      console.log(`  Still processing: ${processing.length} invoices...`);
    }
  }

  // Final list
  const listR = await fetch(`${BASE}/api/invoices?status=`);
  const list = await listR.json();
  console.log(`\nFinal invoice count: ${list.length}`);
  list.forEach(i => console.log(`  ID=${i.id} [${i.status}] ${i.display_name?.substring(0, 55)}`));
}

main().catch(e => { console.error(e); process.exit(1); });
