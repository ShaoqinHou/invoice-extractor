const pages = [
  '/reporting/payroll-report',
  '/reporting/bank-reconciliation',
  '/projects/time-entries',
  '/projects/staff-time',
];
const results = [];
for (const path of pages) {
  await state.page.goto('http://localhost:5174' + path, { waitUntil: 'domcontentloaded', timeout: 5000 });
  await new Promise(r => setTimeout(r, 1500));
  const r = await state.page.evaluate(() => {
    const m = document.querySelector('main');
    if (m === null) return 'no main';
    const t = m.textContent || '';
    return t.includes('Something went wrong') || t.includes('Not Found') ? 'ERR: ' + t.substring(0, 100) : 'OK: ' + t.substring(0, 100);
  });
  results.push(path + ' => ' + r);
}
return results.join('\n');
