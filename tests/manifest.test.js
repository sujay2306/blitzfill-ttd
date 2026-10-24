'use strict';
/* Static checks on the shipped extension: manifest, permissions, syntax,
 * zero-network policy and the no-automation line. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const HOSTS = ['https://ttdevasthanams.ap.gov.in/*', 'https://tirupatibalaji.ap.gov.in/*'];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const shippedJs = walk(path.join(ROOT, 'src')).filter((f) => f.endsWith('.js'));

test('manifest basics', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(manifest.minimum_chrome_version, '111');
  const msgs = JSON.parse(fs.readFileSync(path.join(ROOT, '_locales/en/messages.json'), 'utf8'));
  assert.equal(msgs.appName.message, 'BlitzFill for TTD');
  assert.ok(msgs.appName.message.length <= 45);
  assert.ok(msgs.appDesc.message.length <= 132);
  assert.equal(manifest.commands.fill.suggested_key.default, 'Alt+Shift+F');
});

test('permissions are minimal', () => {
  assert.deepEqual([...manifest.permissions].sort(), ['scripting', 'storage']);
  assert.deepEqual(manifest.host_permissions, HOSTS);
  const all = JSON.stringify(manifest);
  for (const bad of ['<all_urls>', '"tabs"', 'http://', '*://*/*', 'webRequest', 'cookies', 'history']) {
    assert.ok(!all.includes(bad), 'manifest must not contain ' + bad);
  }
  for (const cs of manifest.content_scripts) assert.deepEqual(cs.matches, HOSTS);
  assert.equal(manifest.content_scripts.filter((c) => c.world === 'MAIN').length, 1);
});

test('strict CSP for extension pages', () => {
  const csp = manifest.content_security_policy.extension_pages;
  assert.match(csp, /script-src 'self'(;|$)/);
  assert.match(csp, /connect-src 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.ok(!/unsafe|https?:/.test(csp));
});

test('every referenced file exists', () => {
  const refs = new Set([manifest.background.service_worker, manifest.action.default_popup]);
  for (const cs of manifest.content_scripts) cs.js.forEach((f) => refs.add(f));
  Object.values(manifest.icons).forEach((f) => refs.add(f));
  Object.values(manifest.action.default_icon).forEach((f) => refs.add(f));
  const bg = fs.readFileSync(path.join(ROOT, 'src/background.js'), 'utf8');
  for (const m of bg.matchAll(/'(src\/[^']+\.js)'/g)) refs.add(m[1]);
  for (const f of refs) assert.ok(fs.existsSync(path.join(ROOT, f)), 'missing ' + f);
});

test('node --check passes on every JS file', () => {
  const files = shippedJs.concat(walk(path.join(ROOT, 'tests')).filter((f) => f.endsWith('.js')),
    fs.existsSync(path.join(ROOT, 'scripts')) ? walk(path.join(ROOT, 'scripts')).filter((f) => f.endsWith('.js')) : []);
  for (const f of files) execFileSync(process.execPath, ['--check', f]);
});

test('zero network: no remote code or request APIs in shipped code', () => {
  for (const f of walk(path.join(ROOT, 'src'))) {
    const src = fs.readFileSync(f, 'utf8');
    const rel = path.relative(ROOT, f);
    for (const re of [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /sendBeacon/, /EventSource/, /\bimport\s*\(/, /\beval\s*\(/, /new Function\s*\(/]) {
      assert.ok(!re.test(src), rel + ' uses ' + re);
    }
    const urls = src.match(/https?:\/\/[^\s'"`)]+/g) || [];
    for (const u of urls) {
      assert.ok(/^https:\/\/(ttdevasthanams\.ap\.gov\.in|tirupatibalaji\.ap\.gov\.in|github\.com\/sujay2306\/)|^http:\/\/www\.w3\.org\/2000\/svg$/.test(u), rel + ' references ' + u);
    }
  }
});

test('autofill only: no submit, CAPTCHA or OTP automation', () => {
  // UI strings may tell the user to solve the CAPTCHA themselves; code may not touch it.
  for (const f of shippedJs.filter((x) => !x.endsWith('i18n.js'))) {
    const src = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    const rel = path.relative(ROOT, f);
    assert.ok(!/\.submit\s*\(|requestSubmit/.test(src), rel + ' submits forms');
    assert.ok(!/captcha|otp/i.test(src), rel + ' touches CAPTCHA/OTP');
  }
});

test('brand: no leftover names', () => {
  const files = walk(ROOT).filter((f) => !f.includes('node_modules') && !f.includes(path.sep + '.git' + path.sep) &&
    !f.includes(path.sep + 'dist' + path.sep) && /\.(js|json|html|css|md|sh|yml|txt)$/.test(f) && !f.endsWith('package-lock.json'));
  const bad = ['swift' + 'fill', 'flash' + 'fill'];
  for (const f of files) {
    const s = fs.readFileSync(f, 'utf8').toLowerCase();
    for (const b of bad) assert.ok(!s.includes(b), path.relative(ROOT, f) + ' contains ' + b);
  }
});
