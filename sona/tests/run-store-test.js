const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errs.push(m.text()); });
  await p.goto('http://127.0.0.1:8127/tests/store-test.html');
  await p.waitForFunction(() => window.__results, { timeout: 10000 });
  const results = await p.evaluate(() => window.__results);
  const fails = results.filter((r) => !r.pass);
  console.log(`PASS ${results.length - fails.length}/${results.length}`);
  fails.forEach((f) => console.log('FAIL:', f.name));
  console.log('ERRORS', JSON.stringify(errs));
  await b.close();
  process.exit(fails.length || errs.length ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
