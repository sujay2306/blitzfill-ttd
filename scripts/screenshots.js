'use strict';
/*
 * Renders the 1280x800 Chrome Web Store screenshots into store/screenshots/.
 * Uses a stubbed chrome.* API and synthetic test data only (test Aadhaar
 * numbers are generated with a 9999 0000 prefix plus a Verhoeff digit).
 *   node scripts/screenshots.js
 */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { PILGRIMS, CONTACT } = require('../tests/helpers.js');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'store', 'screenshots');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };

const STAGE = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;background:#eef0f3;font:15px system-ui,-apple-system,"Segoe UI",sans-serif}
.stage{height:100%;display:flex;align-items:center;justify-content:center;gap:72px}
.copy{max-width:380px;color:#1c1917}.copy h1{font-size:40px;line-height:1.1;margin:0 0 14px;letter-spacing:-.02em}
.copy p{font-size:18px;color:#57534e;margin:0;line-height:1.5}
iframe{width:380px;height:620px;border:0;border-radius:14px;box-shadow:0 24px 60px rgba(28,25,23,.18),0 2px 6px rgba(28,25,23,.08);background:#fff}
</style></head><body><div class="stage"><div class="copy"><h1>__H__</h1><p>__P__</p></div>
<iframe src="/src/popup/popup.html"></iframe></div></body></html>`;

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://x');
      if (url.pathname === '/stage') {
        res.writeHead(200, { 'content-type': TYPES['.html'] });
        res.end(STAGE.replace('__H__', url.searchParams.get('h')).replace('__P__', url.searchParams.get('p')));
        return;
      }
      const file = path.join(ROOT, path.normalize(decodeURIComponent(url.pathname)));
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

function chromeStub(data, manifest) {
  const store = { sf: data };
  const result = { ok: true, form: 'pilgrim', ms: 184, filled: 23, skipped: 0, failed: [], review: [], blanks: 0, rows: 3, used: 3, leftover: 0 };
  window.chrome = {
    runtime: { id: 'demo', getManifest: () => manifest, getURL: (p) => '/' + p, onMessage: { addListener() {} } },
    storage: {
      local: { get: async (k) => (k ? { [k]: store[k] } : store), set: async (o) => Object.assign(store, o), clear: async () => {} },
      onChanged: { addListener() {}, removeListener() {} }
    },
    tabs: {
      query: async () => [{ id: 7, url: 'https://ttdevasthanams.ap.gov.in/home/dashboard' }],
      sendMessage: async (_id, msg) => (msg.type === 'status' ? { ok: true, form: { type: 'pilgrim', rows: 3, empty: 3 } } : result)
    },
    commands: { getAll: async () => [{ name: 'fill', shortcut: 'Alt+Shift+F' }] }
  };
}

(async () => {
  const puppeteer = (await import('puppeteer-core')).default;
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await serve();
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: process.env.CI ? ['--no-sandbox'] : [] });
  try {
    const shots = [
      { file: 'screenshot-1.png', theme: 'light', h: 'Every pilgrim, filled in one click', p: 'Save your group once. BlitzFill types names, ages, genders and ID numbers into TTD booking forms, then tells you how fast it was.' },
      { file: 'screenshot-2.png', theme: 'dark', h: 'Private by design', p: 'Your details stay in this browser. No account, no servers, no analytics. Light and dark themes included.' }
    ];
    for (const s of shots) {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });
      await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: s.theme }]);
      const data = { v: 1, pilgrims: PILGRIMS, contact: CONTACT, settings: { fab: true, autofill: false, overwrite: false, lang: 'en', theme: s.theme } };
      await page.evaluateOnNewDocument(chromeStub, data, manifest);
      await page.goto(base + '/stage?h=' + encodeURIComponent(s.h) + '&p=' + encodeURIComponent(s.p), { waitUntil: 'networkidle0' });
      const frame = page.frames().find((f) => f.url().includes('popup.html'));
      await frame.waitForSelector('#fill');
      await new Promise((r) => setTimeout(r, 300));
      await frame.click('#fill');
      await new Promise((r) => setTimeout(r, 400));
      await page.screenshot({ path: path.join(OUT, s.file) });
      await page.close();
    }

    // 3: a TTD-like offline fixture right after a fill, with highlights and the floating button
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.evaluateOnNewDocument((data) => {
      const ls = [];
      window.chrome = {
        runtime: { id: 'demo', onMessage: { addListener: (f) => ls.push(f), removeListener() {} } },
        storage: { local: { get: async () => ({ sf: data }) }, onChanged: { addListener() {}, removeListener() {} } }
      };
    }, { v: 1, pilgrims: PILGRIMS, contact: CONTACT, settings: { fab: true, autofill: false, overwrite: false, lang: 'en', theme: 'light' } });
    await page.goto(base + '/tests/fixtures/pilgrim.html');
    await page.addStyleTag({ content: `
      body{background:#eef0f3;margin:0;padding:40px 60px;font:15px system-ui,sans-serif;color:#1c1917}
      #app::before{content:"Pilgrim details  (offline test page, sample data)";display:block;font-size:22px;font-weight:700;margin-bottom:18px}
      #newsletter{display:none!important}
      .row,#contact{background:#fff;border-radius:12px;padding:16px;gap:10px;box-shadow:0 1px 3px rgba(0,0,0,.08);margin-bottom:12px}
      input{width:170px;padding:9px 10px;border:1px solid #d6d3d1;border-radius:8px;font:inherit}
      [class*="passportVisaPopup"]{background:#fff;border-radius:12px;border:1px solid #f2630a;padding:16px;display:flex;gap:10px}
      [class*="passportVisaPopup"][hidden]{display:none}
      button{padding:9px 16px;border-radius:8px;border:1px solid #d6d3d1;background:#fff;font:inherit}` });
    for (const f of ['src/lib/core.js', 'src/content/engine.js', 'src/lib/i18n.js', 'src/content/bridge.js']) await page.addScriptTag({ url: base + '/' + f });
    await page.waitForSelector('blitzfill-fab');
    await page.mouse.click(1280 - 50, 800 - 40);
    await page.waitForFunction(() => window.fixture.state().contact.gothram !== '', { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 150));
    await page.screenshot({ path: path.join(OUT, 'screenshot-3.png') });
    await page.close();
    console.log('wrote', fs.readdirSync(OUT).join(', '));
  } finally {
    await browser.close();
    srv.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
