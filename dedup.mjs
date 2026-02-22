import { createHash } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const BASE = 'http://localhost:3333';
const UPLOADS = './uploads';

async function main() {
  const listR = await fetch(`${BASE}/api/invoices?status=`);
  const list = await listR.json();

  // Get full details with file_path
  const details = [];
  for (const inv of list) {
    const r = await fetch(`${BASE}/api/invoices/${inv.id}`);
    const data = await r.json();
    details.push(data);
  }

  // Compute actual file hashes
  const withHash = [];
  for (const d of details) {
    const fp = d.file_path;
    if (!fp) {
      console.log(`ID=${d.id} NO FILE PATH — skip`);
      continue;
    }
    const fullPath = resolve(fp);
    if (!existsSync(fullPath)) {
      console.log(`ID=${d.id} FILE MISSING: ${fp}`);
      continue;
    }
    const buf = readFileSync(fullPath);
    const hash = createHash('md5').update(buf).digest('hex');
    withHash.push({
      id: d.id,
      hash,
      dbHash: d.file_hash,
      name: (d.display_name || '').substring(0, 55),
      status: d.status,
      file: d.original_filename,
      size: buf.length,
    });
  }

  // Group by computed hash
  const byHash = new Map();
  for (const d of withHash) {
    if (!byHash.has(d.hash)) byHash.set(d.hash, []);
    byHash.get(d.hash).push(d);
  }

  const toDelete = [];
  console.log('\n=== UNIQUE FILES ===');
  for (const [hash, group] of byHash) {
    if (group.length === 1) {
      console.log(`  id=${group[0].id} ${group[0].file} (${(group[0].size/1024).toFixed(0)}KB)`);
    }
  }

  console.log('\n=== DUPLICATES ===');
  for (const [hash, group] of byHash) {
    if (group.length > 1) {
      console.log(`\nhash=${hash.substring(0,12)}... (${group.length} copies, ${(group[0].size/1024).toFixed(0)}KB):`);
      group.forEach((g, i) => {
        const tag = i === 0 ? 'KEEP  ' : 'DELETE';
        console.log(`  ${tag} id=${g.id} [${g.status}] ${g.name}`);
        if (i > 0) toDelete.push(g.id);
      });
    }
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Total invoices: ${details.length}`);
  console.log(`With files: ${withHash.length}`);
  console.log(`Unique files: ${byHash.size}`);
  console.log(`Duplicates to delete: ${toDelete.length}`);
  console.log(`Will keep: ${byHash.size} unique invoices`);
  console.log(`\nDelete IDs: ${JSON.stringify(toDelete)}`);

  // Actually delete them
  if (toDelete.length > 0) {
    console.log('\nDeleting duplicates...');
    for (const id of toDelete) {
      const r = await fetch(`${BASE}/api/invoices/${id}`, { method: 'DELETE' });
      console.log(`  DELETE id=${id}: ${r.status}`);
    }
    console.log('Done!');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
