const BASE = 'http://localhost:3333';

async function main() {
  const listR = await fetch(`${BASE}/api/invoices?status=`);
  const list = await listR.json();

  const details = [];
  for (const inv of list) {
    const r = await fetch(`${BASE}/api/invoices/${inv.id}`);
    const data = await r.json();
    details.push({
      id: data.id,
      hash: data.file_hash,
      name: (data.display_name || '').substring(0, 55),
      status: data.status,
      file: data.original_filename,
    });
  }

  // Group by hash
  const byHash = new Map();
  for (const d of details) {
    const h = d.hash || 'NO_HASH';
    if (!byHash.has(h)) byHash.set(h, []);
    byHash.get(h).push(d);
  }

  let dupeCount = 0;
  const toDelete = [];
  for (const [hash, group] of byHash) {
    if (group.length > 1) {
      console.log(`\nDUPLICATE hash=${hash.substring(0, 12)}... (${group.length} copies):`);
      group.forEach((g, i) => {
        const keep = i === 0 ? 'KEEP' : 'DELETE';
        console.log(`  ${keep} id=${g.id} ${g.status} ${g.name}`);
        if (i > 0) toDelete.push(g.id);
      });
      dupeCount++;
    }
  }

  const unique = byHash.size;
  console.log(`\n=== SUMMARY ===`);
  console.log(`Total: ${details.length} | Unique hashes: ${unique} | Duplicate groups: ${dupeCount}`);
  console.log(`To delete: ${toDelete.length} invoices`);
  console.log(`IDs to delete: ${JSON.stringify(toDelete)}`);
}

main().catch(e => { console.error(e); process.exit(1); });
