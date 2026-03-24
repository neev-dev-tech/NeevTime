/**
 * SMOKE TEST SCRIPT
 * Run this on Staging or Production after a deployment to verify core health.
 * Usage: node server/scripts/smoke_test.js
 */
const axios = require('axios');
require('dotenv').config();

const BASE_URL = process.env.VITE_API_URL || 'http://localhost:3001';
const TESTS = [
  { name: 'API Health Check', path: '/api/health', method: 'GET' },
  { name: 'Auth Check (Login Page)', path: '/api/login', method: 'GET' },
  { name: 'Attendance Logs API', path: '/api/logs', method: 'GET' },
];

async function runSmokeTests() {
  console.log(`\n🚀 Starting Smoke Tests on: ${BASE_URL}`);
  let failed = 0;

  for (const test of TESTS) {
    try {
      const response = await axios({
        method: test.method,
        url: `${BASE_URL}${test.path}`,
        timeout: 5000,
      });
      console.log(`✅ ${test.name}: PASSED (${response.status})`);
    } catch (err) {
      // 401/403 are technically "passed" for health if the endpoint responded
      if (err.response && [401, 403, 404].includes(err.response.status)) {
         if (err.response.status === 404) {
            console.log(`❌ ${test.name}: FAILED (404 Not Found)`);
            failed++;
         } else {
            console.log(`✅ ${test.name}: PASSED (Responded with ${err.response.status})`);
         }
      } else {
        console.log(`❌ ${test.name}: FAILED (${err.message})`);
        failed++;
      }
    }
  }

  if (failed === 0) {
    console.log('\n✨ ALL CORE SERVICES ARE UP!\n');
    process.exit(0);
  } else {
    console.log(`\n⚠️ ${failed} tests failed. Check server logs.\n`);
    process.exit(1);
  }
}

runSmokeTests();
