'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/lib/core.js');
const I = require('../src/lib/i18n.js');
const { testAadhaar, PILGRIMS } = require('./helpers.js');

test('verhoeff: known vectors', () => {
  assert.equal(C.verhoeffDigit('236'), 3);
  assert.equal(C.verhoeffValid('2363'), true);
  assert.equal(C.verhoeffValid('2364'), false);
  assert.equal(C.verhoeffDigit('12345'), 1);
  assert.equal(C.verhoeffValid('123451'), true);
  assert.throws(() => C.verhoeffDigit('12a'));
});

test('verhoeff: detects every single-digit error and adjacent transposition', () => {
  const n = testAadhaar(7);
  assert.ok(C.verhoeffValid(n));
  for (let i = 0; i < n.length; i++) {
    for (let d = 0; d <= 9; d++) {
      if (String(d) === n[i]) continue;
      assert.equal(C.verhoeffValid(n.slice(0, i) + d + n.slice(i + 1)), false);
    }
    if (i < n.length - 1 && n[i] !== n[i + 1]) {
      const sw = n.slice(0, i) + n[i + 1] + n[i] + n.slice(i + 2);
      assert.equal(C.verhoeffValid(sw), false);
    }
  }
});

test('aadhaar validator', () => {
  for (let s = 1; s < 50; s++) assert.ok(C.isAadhaar(testAadhaar(s)));
  const a = testAadhaar(3);
  assert.ok(C.isAadhaar(a.replace(/(\d{4})(\d{4})(\d{4})/, '$1 $2 $3')));
  assert.equal(C.isAadhaar('1' + a.slice(1)), false, 'leading 1');
  assert.equal(C.isAadhaar('0' + a.slice(1)), false, 'leading 0');
  assert.equal(C.isAadhaar(a.slice(0, 11)), false, 'too short');
  assert.equal(C.isAadhaar(a.slice(0, 11) + ((+a[11] + 1) % 10)), false, 'bad checksum');
});

test('other validators', () => {
  assert.ok(C.isPassport('Z1234567'));
  assert.ok(C.isPassport('AB1234'));
  assert.equal(C.isPassport('AB12'), false);
  assert.equal(C.isPassport('AB12-345'), false);
  assert.equal(C.isPassport('A'.repeat(13)), false);
  for (const ok of ['1', '34', '120']) assert.ok(C.isAge(ok), ok);
  for (const bad of ['0', '121', '-3', '3.5', '', 'ab']) assert.equal(C.isAge(bad), false, bad);
  assert.ok(C.isMobile('9000000001'));
  assert.ok(C.isMobile('+91 90000 00001'));
  assert.equal(C.isMobile('5000000001'), false);
  assert.equal(C.isMobile('900000001'), false);
  assert.ok(C.isPincode('751001'));
  assert.equal(C.isPincode('051001'), false);
  assert.equal(C.isPincode('75100'), false);
  assert.ok(C.isEmail('a.b@example.co.in'));
  assert.equal(C.isEmail('a@b'), false);
  assert.equal(C.isEmail('a b@example.com'), false);
});

test('validatePilgrim / validateContact', () => {
  for (const p of PILGRIMS) assert.deepEqual(C.validatePilgrim(p), {}, p.name);
  const e = C.validatePilgrim({ name: '', age: '200', gender: 'X', idType: 'Aadhaar', idNumber: '123' });
  assert.deepEqual(Object.keys(e).sort(), ['age', 'gender', 'idNumber', 'name']);
  assert.equal(e.idNumber, 'errAadhaar');
  assert.equal(C.validatePilgrim({ ...PILGRIMS[1], idNumber: 'X1' }).idNumber, 'errPassport');
  assert.deepEqual(C.validateContact({ email: 'x', mobile: '1', pincode: '1' }),
    { email: 'errEmail', mobile: 'errMobile', pincode: 'errPincode' });
  assert.deepEqual(C.validateContact({}), {});
});

test('mask', () => {
  assert.equal(C.mask(testAadhaar(1)), '•••• •••• ' + testAadhaar(1).slice(-4));
  assert.equal(C.mask('Z1234567'), '•••• •••• 4567');
  assert.equal(C.mask(''), '');
});

test('matchOption: gender never confuses Male with Female', () => {
  assert.equal(C.matchOption('Male', ['Female', 'Male'], 'gender'), 1);
  assert.equal(C.matchOption('Male', ['Select Gender', 'FEMALE', 'MALE'], 'gender'), 2);
  assert.equal(C.matchOption('Female', ['Male', 'Female'], 'gender'), 1);
  assert.equal(C.matchOption('Male', ['F', 'M'], 'gender'), 1);
  assert.equal(C.matchOption('Transgender', ['Male', 'Female', 'Others'], 'gender'), 2);
  assert.equal(C.matchOption('Transgender', ['Male', 'Female', 'Third Gender'], 'gender'), 2);
  assert.equal(C.matchOption('Male', ['Female'], 'gender'), -1);
});

test('matchOption: id types', () => {
  assert.equal(C.matchOption('Aadhaar', ['Select', 'Aadhaar Card', 'Passport'], 'idType'), 1);
  assert.equal(C.matchOption('Aadhaar', ['--Select--', 'AADHAR CARD NO', 'PASSPORT'], 'idType'), 1);
  assert.equal(C.matchOption('Aadhaar', ['?', 'AADHAARCARD', 'PASSPORT'], 'idType'), 1);
  assert.equal(C.matchOption('Passport', ['Aadhaar', 'Passport'], 'idType'), 1);
  assert.equal(C.matchOption('Passport', ['Aadhaar'], 'idType'), -1);
});

test('matchOption: Indian state aliases', () => {
  const states = ['Select State', 'Andhra Pradesh', 'Arunachal Pradesh', 'Odisha', 'Puducherry', 'Tamil Nadu',
    'Telangana', 'Karnataka', 'Jammu & Kashmir', 'Andaman and Nicobar Islands', 'Delhi'];
  const at = (w) => states[C.matchOption(w, states, 'state')];
  assert.equal(at('Orissa'), 'Odisha');
  assert.equal(at('Pondicherry'), 'Puducherry');
  assert.equal(at('AP'), 'Andhra Pradesh');
  assert.equal(at('TS'), 'Telangana');
  assert.equal(at('TN'), 'Tamil Nadu');
  assert.equal(at('KA'), 'Karnataka');
  assert.equal(at('Jammu and Kashmir'), 'Jammu & Kashmir');
  assert.equal(at('Andaman & Nicobar'), 'Andaman and Nicobar Islands');
  assert.equal(at('New Delhi'), 'Delhi');
  assert.equal(at('andhra pradesh'), 'Andhra Pradesh');
  assert.equal(C.canonical('Orissa', 'state'), 'Odisha');
  assert.equal(C.canonical('Bharat', 'country'), 'India');
});

test('classifyField: names, ids, contact', () => {
  const k = (o) => C.classifyField(o);
  assert.equal(k({ name: 'fName0' }), 'name');
  assert.equal(k({ name: 'name' }), 'name');
  assert.equal(k({ name: 'age3' }), 'age');
  assert.equal(k({ name: 'gender' }), 'gender');
  assert.equal(k({ name: 'idType' }), 'idType');
  assert.equal(k({ name: 'photoIdType' }), 'idType');
  assert.equal(k({ name: 'proofS2' }), 'idType');
  assert.equal(k({ name: 'idNumber' }), 'idNumber');
  assert.equal(k({ name: 'proofId1' }), 'idNumber');
  assert.equal(k({ label: 'Aadhaar Number' }), 'idNumber');
  assert.equal(k({ name: 'pilgrimEmail' }), 'email');
  assert.equal(k({ type: 'email', name: 'x' }), 'email');
  assert.equal(k({ placeholder: 'Mobile No' }), 'mobile');
  assert.equal(k({ name: 'pilgrimPincode' }), 'pincode');
  assert.equal(k({ label: 'PIN Code' }), 'pincode');
  assert.equal(k({ name: 'gothramName' }), 'gothram');
  assert.equal(k({ name: 'pilgrimCity' }), 'city');
  assert.equal(k({ name: 'pilgrimState' }), 'state');
  assert.equal(k({ name: 'pilgrimCountry' }), 'country');
  assert.equal(k({ label: 'Father Name' }), null);
  assert.equal(k({ name: 'userName' }), null);
  assert.equal(k({ name: 'captcha' }), null);
  assert.equal(k({ name: 'otp' }), null);
  assert.equal(k({ name: 'name', type: 'hidden' }), null);
});

test('words splits camelCase', () => {
  assert.equal(C.words('pilgrimEmailId'), 'pilgrim email id');
  assert.equal(C.words('fName0'), 'f name 0');
});

test('migrate: defaults, sanitising, unknown input', () => {
  const d = C.migrate(undefined);
  assert.equal(d.v, C.SCHEMA_VERSION);
  assert.equal(d.contact.country, 'India');
  assert.equal(d.settings.autofill, false);
  assert.equal(d.settings.fab, true);
  const m = C.migrate({
    pilgrims: [{ name: ' A B ', age: 30, gender: 'f', idType: 'aadhar', idNumber: '9999 0000 0011' }, { name: '' }, null],
    settings: { lang: 'te', theme: 'neon', autofill: 'yes' }
  });
  assert.equal(m.pilgrims.length, 1);
  assert.equal(m.pilgrims[0].gender, 'Female');
  assert.equal(m.pilgrims[0].idType, 'Aadhaar');
  assert.equal(m.pilgrims[0].idNumber, '999900000011');
  assert.equal(m.pilgrims[0].selected, true);
  assert.equal(m.settings.lang, 'en', 'non-English stored lang maps to en');
  assert.equal(m.settings.theme, 'system');
  assert.equal(m.settings.autofill, false);
});

test('isTTDUrl', () => {
  assert.ok(C.isTTDUrl('https://ttdevasthanams.ap.gov.in/home/dashboard'));
  assert.ok(C.isTTDUrl('https://tirupatibalaji.ap.gov.in/#/srivani'));
  assert.equal(C.isTTDUrl('http://ttdevasthanams.ap.gov.in/'), false);
  assert.equal(C.isTTDUrl('https://ttdevasthanams.ap.gov.in.evil.com/'), false);
  assert.equal(C.isTTDUrl(undefined), false);
});

test('i18n: summary text and fallbacks', () => {
  assert.equal(I.summarize('en', { ok: true, filled: 18, ms: 240, failed: [] }).text, 'Filled 18 fields in 240 ms');
  assert.equal(I.summarize('en', { ok: false, error: 'noForm' }).tone, 'bad');
  assert.equal(I.t('xx', 'fabFill', { n: 3 }), 'Fill 3');
  assert.deepEqual(Object.keys(I.DICT), ['en']);
});

test('core api is frozen', () => {
  assert.ok(Object.isFrozen(C));
});

test('placeable: drops pilgrims already on the page and caps at empty rows', () => {
  const fake = (value) => ({ value, isConnected: true, closest: () => null, offsetWidth: 1, offsetHeight: 1, getClientRects: () => [1] });
  const doc = {
    querySelectorAll: (sel) => (sel.includes('fName') ? [fake(PILGRIMS[0].name.toUpperCase()), fake('')] : [fake(PILGRIMS[2].idNumber)])
  };
  const form = { type: 'pilgrim', rows: 3, empty: 1 };
  assert.deepEqual(C.placeable(PILGRIMS, form, false, doc).map((p) => p.id), ['t2']);
  assert.equal(C.placeable(PILGRIMS, form, true, doc).length, 3, 'overwrite keeps everyone');
  assert.equal(C.placeable(PILGRIMS, { type: 'generic', empty: 0 }, false, doc).length, 3);
  assert.equal(C.idKey(' z12-345 '), 'Z12345');
});

test('i18n: timeout and engine errors have their own messages', () => {
  assert.match(I.summarize('en', { ok: false, error: 'timeout' }).text, /stopped responding/);
  assert.equal(I.summarize('en', { ok: false, error: 'noEngine' }).text, I.t('en', 'errNoTab'));
});
