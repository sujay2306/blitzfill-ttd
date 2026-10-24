'use strict';
/*
 * End-to-end: drives a real Chrome against offline fixtures that imitate
 * the TTD forms. Branded Chrome no longer loads unpacked extensions from the
 * command line, so the shipped scripts are injected into the page and the
 * engine is driven through its CustomEvent protocol, exactly as the
 * content-script bridge does it.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { PILGRIMS, CONTACT } = require('./helpers.js');

const ROOT = path.join(__dirname, '..');
const CHROME = process.env.CHROME_PATH || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium-browser', '/usr/bin/chromium'
].find((p) => fs.existsSync(p));

const skip = !CHROME ? 'Chrome not found (set CHROME_PATH)' : false;

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const file = path.join(ROOT, path.normalize(rel));
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

const payload = (extra) => ({
  pilgrims: PILGRIMS.map(({ name, age, gender, idType, idNumber, passportCountry }) => ({ name, age, gender, idType, idNumber, passportCountry: passportCountry || '' })),
  contact: CONTACT,
  overwrite: false,
  ...extra
});

function rpc(page, cmd, data) {
  return page.evaluate((cmd, data) => new Promise((resolve) => {
    const id = 'e2e' + Math.random();
    document.addEventListener('blitzfill:res', function on(e) {
      const m = JSON.parse(e.detail);
      if (m.id !== id || m.beat) return;
      document.removeEventListener('blitzfill:res', on);
      resolve(m.result);
    });
    document.dispatchEvent(new CustomEvent('blitzfill:req', { detail: JSON.stringify({ id, cmd, payload: data }) }));
  }), cmd, data);
}

async function openWithEngine(browser, base, fixture) {
  const page = await browser.newPage();
  await page.goto(base + '/tests/fixtures/' + fixture);
  await page.addScriptTag({ url: base + '/src/lib/core.js' });
  await page.addScriptTag({ url: base + '/src/content/engine.js' });
  return page;
}

test('E2E against TTD-like fixtures', { skip, timeout: 120000 }, async (t) => {
  const puppeteer = (await import('puppeteer-core')).default; // ESM-only package
  const srv = await serve();
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: process.env.CI ? ['--no-sandbox'] : []
  });
  t.after(async () => { await browser.close(); srv.close(); });

  await t.test('fixture is faithful: naive back-to-back writes lose data', async () => {
    const page = await browser.newPage();
    await page.goto(base + '/tests/fixtures/pilgrim.html');
    const lost = await page.evaluate(async () => {
      const K = window.fixture.KEY;
      const name = document.querySelector('input[name="name"]');
      const age = document.querySelector('input[name="age"]');
      const ev = (el) => ({ target: el, nativeEvent: { isTrusted: true } });
      name.value = 'Lost Write';
      name[K].onChange(ev(name));
      age.value = '40';
      age[K].onChange(ev(age)); // same render's closure: wipes the name write
      // and synthetic events are rejected outright
      name.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 50));
      const s = window.fixture.state().pilgrims[0];
      return { name: s.name, age: s.age, rejected: window.fixture.stats.rejected };
    });
    assert.equal(lost.name, '', 'stale closure must drop the first write');
    assert.equal(lost.age, '40');
    assert.ok(lost.rejected >= 1, 'untrusted events must be rejected');
    await page.close();
  });

  await t.test('pilgrim form: every field correct, no submit, timing reported', async () => {
    const page = await openWithEngine(browser, base, 'pilgrim.html');
    const r = await rpc(page, 'fill', payload());
    const s = await page.evaluate(() => ({ state: window.fixture.state(), stats: window.fixture.stats,
      decoy: document.querySelector('#newsletter input').value,
      dom: [...document.querySelectorAll('#app input')].map((e) => [e.name, e.value]) }));
    console.log(`    pilgrim form: filled ${r.filled} fields in ${r.ms} ms (commits: ${s.stats.commits})`);
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.form, 'pilgrim');
    assert.deepEqual(r.failed, []);
    const exp = PILGRIMS;
    s.state.pilgrims.forEach((p, i) => {
      assert.equal(p.name, exp[i].name, 'name ' + i);
      assert.equal(p.age, exp[i].age, 'age ' + i);
      assert.equal(p.gender, exp[i].gender, 'gender ' + i);
      assert.equal(p.idType, exp[i].idType, 'idType ' + i);
      assert.equal(p.idNumber, exp[i].idNumber, 'idNumber ' + i);
    });
    assert.equal(s.state.pilgrims[1].passportNumber, 'Z1234567');
    assert.equal(s.state.pilgrims[1].passportCountry, 'India');
    assert.deepEqual(r.review, [{ row: 2, what: 'passport' }]);
    assert.deepEqual(s.state.contact, { email: CONTACT.email, country: 'India', state: 'Odisha', city: 'Testpur', pincode: '751001', gothram: 'Testa' });
    assert.equal(s.decoy, '', 'contact goes to the last matching email field');
    assert.equal(s.state.errors.age1, undefined, 'age must not be re-blurred after Passport');
    assert.equal(s.stats.rejected, 0, 'engine never sends untrusted events to React handlers');
    assert.equal(s.stats.submitClicks, 0, 'never submits');
    assert.equal(r.filled, 3 * 5 + 2 + 6);
    assert.ok(r.ms < 3000, 'fill time ' + r.ms);
    // DOM reflects committed state too
    const dom = Object.fromEntries(s.dom.filter(([n]) => n === 'state' || n === 'pincode'));
    assert.equal(dom.state, 'Odisha');

    // undo restores text fields
    const u = await rpc(page, 'undo');
    assert.equal(u.restored, 15, JSON.stringify(u));
    assert.equal(u.skipped, 8, 'read-only dropdowns with no previous option are left alone');
    const after = await page.evaluate(() => window.fixture.state());
    assert.deepEqual(after.pilgrims.map((p) => p.name), ['', '', '']);
    assert.equal(after.contact.city, '');
    await page.close();
  });

  await t.test('pilgrim form: second fill respects overwrite=false; overwrite=true rewrites', async () => {
    const page = await openWithEngine(browser, base, 'pilgrim.html');
    await rpc(page, 'fill', payload());
    const again = await rpc(page, 'fill', payload());
    assert.equal(again.ok, true);
    assert.equal(again.filled, 0, JSON.stringify(again));
    const other = payload({ overwrite: true });
    other.pilgrims[0] = { ...other.pilgrims[0], name: 'Renamed Pilgrim' };
    const ow = await rpc(page, 'fill', other);
    assert.ok(ow.filled >= 1);
    const st = await page.evaluate(() => window.fixture.state());
    assert.equal(st.pilgrims[0].name, 'Renamed Pilgrim');
    assert.equal(st.pilgrims[1].name, PILGRIMS[1].name);
    await page.close();
  });

  await t.test('undo while a fill is running is refused', async () => {
    const page = await openWithEngine(browser, base, 'pilgrim.html');
    const [f, u] = await page.evaluate((data) => {
      const send = (cmd, payload) => new Promise((resolve) => {
        const id = cmd + Math.random();
        document.addEventListener('blitzfill:res', function on(e) {
          const m = JSON.parse(e.detail);
          if (m.id !== id || m.beat) return;
          document.removeEventListener('blitzfill:res', on);
          resolve(m.result);
        });
        document.dispatchEvent(new CustomEvent('blitzfill:req', { detail: JSON.stringify({ id, cmd, payload }) }));
      });
      return Promise.all([send('fill', data), send('undo', null)]);
    }, payload());
    assert.equal(f.ok, true);
    assert.deepEqual(u, { ok: false, error: 'busy' });
    await page.close();
  });

  await t.test('re-fill never duplicates a pilgrim already on the page', async () => {
    const page = await openWithEngine(browser, base, 'pilgrim.html');
    const first = payload();
    first.pilgrims = first.pilgrims.slice(0, 2);
    await rpc(page, 'fill', first);
    const r = await rpc(page, 'fill', payload()); // A, B, C again
    assert.equal(r.dupes, 2, JSON.stringify(r));
    assert.equal(r.leftover, 0);
    const names = await page.evaluate(() => window.fixture.state().pilgrims.map((p) => p.name));
    assert.deepEqual(names, PILGRIMS.map((p) => p.name));
    await page.close();
  });

  await t.test('prefilled row without an ID input does not shift other rows', async () => {
    const page = await openWithEngine(browser, base, 'pilgrim.html?prefill=1');
    const two = payload();
    two.pilgrims = [two.pilgrims[0], two.pilgrims[2]];
    const r = await rpc(page, 'fill', two);
    assert.deepEqual(r.failed, [], JSON.stringify(r));
    const st = await page.evaluate(() => window.fixture.state().pilgrims);
    assert.equal(st[0].name, 'Prefilled Person');
    assert.equal(st[0].idNumber, '');
    assert.equal(st[1].name, PILGRIMS[0].name);
    assert.equal(st[1].idNumber, PILGRIMS[0].idNumber);
    assert.equal(st[2].name, PILGRIMS[2].name);
    assert.equal(st[2].idNumber, PILGRIMS[2].idNumber);
    await page.close();
  });

  await t.test('srivani form: native selects with async options, hidden rows skipped', async () => {
    const page = await openWithEngine(browser, base, 'srivani.html');
    const two = payload();
    two.pilgrims = two.pilgrims.slice(0, 2).concat([two.pilgrims[2], two.pilgrims[0], two.pilgrims[1]]);
    const r = await rpc(page, 'fill', two);
    console.log(`    srivani form: filled ${r.filled} fields in ${r.ms} ms`);
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.form, 'srivani');
    assert.deepEqual(r.failed, []);
    assert.equal(r.used, 4, 'only 4 visible member rows');
    assert.equal(r.leftover, 1);
    const m = await page.evaluate(() => window.srivani.model);
    const exp = two.pilgrims;
    for (let i = 0; i < 4; i++) {
      assert.equal(m[i].fName, exp[i].name);
      assert.equal(m[i].age, exp[i].age);
      assert.equal(m[i].gender, exp[i].gender);
      assert.equal(m[i].proofS, exp[i].idType === 'Aadhaar' ? 'AADHAAR CARD' : 'PASSPORT');
      assert.equal(m[i].proofId, exp[i].idNumber);
    }
    for (let i = 4; i < 9; i++) assert.equal(m[i].fName, '', 'hidden row ' + i);
    assert.deepEqual(m.filter((x) => x.ageError).map((x) => x.fName), [], 'age blurred before proof type');
    await page.close();
  });

  await t.test('bridge: message + floating button drive the engine', async () => {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument((data) => {
      const listeners = [];
      window.__msgListeners = listeners;
      window.chrome = {
        runtime: { id: 'test', onMessage: { addListener: (f) => listeners.push(f), removeListener() {} } },
        storage: {
          local: { get: async () => ({ sf: data }) },
          onChanged: { addListener() {}, removeListener() {} }
        }
      };
    }, { v: 1, pilgrims: PILGRIMS, contact: CONTACT, settings: { fab: true, autofill: false, overwrite: false, lang: 'en', theme: 'system' } });
    await page.goto(base + '/tests/fixtures/pilgrim.html');
    for (const f of ['src/lib/core.js', 'src/content/engine.js', 'src/lib/i18n.js', 'src/content/bridge.js']) {
      await page.addScriptTag({ url: base + '/' + f });
    }
    await page.waitForSelector('blitzfill-fab', { timeout: 3000 });
    const status = await page.evaluate(() => new Promise((res) => window.__msgListeners[0]({ type: 'status' }, {}, res)));
    assert.deepEqual(status.form, { type: 'pilgrim', rows: 3, empty: 3 });
    const box = await page.evaluate(() => {
      const r = document.querySelector('blitzfill-fab').getBoundingClientRect();
      return { w: r.width, h: r.height };
    });
    assert.equal(box.w, 0, 'host is a zero-size anchor; button is fixed inside the shadow root');
    // click the fixed button: bottom-right corner, 20px inset
    const vp = page.viewport();
    await page.mouse.click(vp.width - 50, vp.height - 40);
    await page.waitForFunction(() => window.fixture.state().contact.gothram !== '', { timeout: 10000 });
    const st = await page.evaluate(() => window.fixture.state());
    assert.equal(st.pilgrims[0].name, PILGRIMS[0].name);
    assert.equal(st.contact.state, 'Odisha');
    // second request over the message channel: nothing left to fill
    const r = await page.evaluate(() => new Promise((res) => window.__msgListeners[0]({ type: 'fill' }, {}, res)));
    assert.equal(r.ok, true);
    assert.equal(r.filled, 0);
    await page.close();
  });

  await t.test('bridge: auto-fill re-arms after the form goes away (SPA navigation)', async () => {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument((data) => {
      window.chrome = {
        runtime: { id: 'test', onMessage: { addListener() {}, removeListener() {} } },
        storage: { local: { get: async () => ({ sf: data }) }, onChanged: { addListener() {}, removeListener() {} } }
      };
    }, { v: 1, pilgrims: PILGRIMS, contact: CONTACT, settings: { fab: true, autofill: true, overwrite: false, lang: 'en', theme: 'system' } });
    await page.goto(base + '/tests/fixtures/pilgrim.html');
    for (const f of ['src/lib/core.js', 'src/content/engine.js', 'src/lib/i18n.js', 'src/content/bridge.js']) {
      await page.addScriptTag({ url: base + '/' + f });
    }
    const filled = () => page.waitForFunction(() => window.fixture.state().contact.gothram !== '' &&
      window.fixture.state().pilgrims[2].idNumber !== '', { timeout: 10000 });
    await filled();
    // next booking: the form unmounts, then a fresh one with the same row count appears
    await page.evaluate(() => { window.__app = document.getElementById('app'); window.__app.remove(); });
    await new Promise((r) => setTimeout(r, 700));
    await page.evaluate(() => { window.fixture.reset(); document.body.prepend(window.__app); });
    await filled();
    const st = await page.evaluate(() => window.fixture.state());
    assert.equal(st.pilgrims[0].name, PILGRIMS[0].name);
    await page.close();
  });
});
