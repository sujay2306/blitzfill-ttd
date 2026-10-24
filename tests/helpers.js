'use strict';
/*
 * Synthetic test data only. Test Aadhaar numbers use the obviously fake
 * prefix 9999 0000 plus a serial, completed with a Verhoeff check digit.
 */
const C = require('../src/lib/core.js');

function testAadhaar(serial) {
  const body = '99990000' + String(serial).padStart(3, '0');
  return body + C.verhoeffDigit(body);
}

const PILGRIMS = [
  { id: 't1', name: 'Test Pilgrim One', age: '34', gender: 'Male', idType: 'Aadhaar', idNumber: testAadhaar(1), selected: true },
  { id: 't2', name: 'Test Pilgrim Two', age: '31', gender: 'Female', idType: 'Passport', idNumber: 'Z1234567', passportCountry: 'India', selected: true },
  { id: 't3', name: 'Test Pilgrim Three', age: '9', gender: 'Transgender', idType: 'Aadhaar', idNumber: testAadhaar(2), selected: true }
];

const CONTACT = {
  email: 'pilgrim@example.com', mobile: '9000000001', country: 'India',
  state: 'Orissa', city: 'Testpur', pincode: '751001', gothram: 'Testa'
};

module.exports = { testAadhaar, PILGRIMS, CONTACT };
