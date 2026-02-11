/**
 * XSS Validation Test Script
 *
 * This script demonstrates the server-side validation logic
 * for player names to prevent XSS attacks.
 */

// Replicate the server-side validation logic
function validatePlayerName(name: string): { valid: boolean; error?: string } {
  // Check if name exists
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Player name is required' };
  }

  // Trim whitespace
  const trimmedName = name.trim();

  // Check length (1-64 characters)
  if (trimmedName.length < 1) {
    return { valid: false, error: 'Player name cannot be empty' };
  }
  if (trimmedName.length > 64) {
    return { valid: false, error: 'Player name must be 64 characters or less' };
  }

  // Reject HTML tags (< and > characters)
  if (trimmedName.includes('<') || trimmedName.includes('>')) {
    return { valid: false, error: 'Player name cannot contain HTML tags' };
  }

  // Reject script keywords (case-insensitive)
  const dangerousKeywords = ['script', 'javascript:', 'onerror', 'onload', 'onclick', 'onmouseover', 'svg', 'iframe', 'embed', 'object'];
  const lowerName = trimmedName.toLowerCase();
  for (const keyword of dangerousKeywords) {
    if (lowerName.includes(keyword)) {
      return { valid: false, error: 'Player name contains prohibited keywords' };
    }
  }

  // Allow only alphanumeric + basic punctuation (spaces, hyphens, underscores, periods, apostrophes)
  const allowedPattern = /^[a-zA-Z0-9\s\-_.'\u0080-\uFFFF]+$/;
  if (!allowedPattern.test(trimmedName)) {
    return { valid: false, error: 'Player name contains invalid characters. Use letters, numbers, spaces, hyphens, underscores, periods, or apostrophes only' };
  }

  // Name is valid
  return { valid: true };
}

// Replicate client-side sanitization logic
function escapeHTML(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

// Test cases
const testCases = [
  // XSS Attack Payloads (should be rejected)
  { name: '<script>alert(1)</script>', type: 'XSS', shouldPass: false },
  { name: '<img src=x onerror=alert(1)>', type: 'XSS', shouldPass: false },
  { name: '${alert(1)}', type: 'XSS', shouldPass: false },
  { name: '<svg onload=alert(1)>', type: 'XSS', shouldPass: false },
  { name: 'script alert 1', type: 'XSS', shouldPass: false },
  { name: 'javascript:alert(1)', type: 'XSS', shouldPass: false },
  { name: 'onclick test', type: 'XSS', shouldPass: false },
  { name: '<iframe src=malicious.com>', type: 'XSS', shouldPass: false },

  // Valid player names (should be accepted)
  { name: 'John_Doe-123', type: 'Valid', shouldPass: true },
  { name: 'Player One', type: 'Valid', shouldPass: true },
  { name: "O'Brien", type: 'Valid', shouldPass: true },
  { name: 'Dr.Smith.Jr', type: 'Valid', shouldPass: true },
  { name: 'Håkan_Müller', type: 'Valid', shouldPass: true },
  { name: 'Player123', type: 'Valid', shouldPass: true },
  { name: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz_12345678', type: 'Valid', shouldPass: true },

  // Edge cases
  { name: '', type: 'Edge', shouldPass: false },
  { name: '   ', type: 'Edge', shouldPass: false },
  { name: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz1234567890ABC', type: 'Edge', shouldPass: false },
  { name: 'Player@#$%', type: 'Edge', shouldPass: false },
  { name: 'ScRiPt Test', type: 'Edge', shouldPass: false },
];

console.log('='.repeat(80));
console.log('XSS VALIDATION TEST RESULTS');
console.log('='.repeat(80));
console.log();

let passCount = 0;
let failCount = 0;

for (const testCase of testCases) {
  const result = validatePlayerName(testCase.name);
  const actualPass = result.valid;
  const expectedPass = testCase.shouldPass;
  const testPassed = actualPass === expectedPass;

  if (testPassed) {
    passCount++;
  } else {
    failCount++;
  }

  const status = testPassed ? '✓ PASS' : '✗ FAIL';
  const nameDisplay = testCase.name.length > 40 ? testCase.name.substring(0, 40) + '...' : testCase.name;

  console.log(`[${testCase.type.padEnd(5)}] ${status} | "${nameDisplay}"`);
  if (!testPassed) {
    console.log(`         Expected: ${expectedPass ? 'ACCEPT' : 'REJECT'}, Got: ${actualPass ? 'ACCEPT' : 'REJECT'}`);
  }
  if (!result.valid) {
    console.log(`         Error: ${result.error}`);
  }
  console.log();
}

console.log('='.repeat(80));
console.log(`SUMMARY: ${passCount}/${testCases.length} tests passed`);
console.log('='.repeat(80));
console.log();

// Test client-side sanitization (defense-in-depth)
console.log('CLIENT-SIDE SANITIZATION (Defense-in-Depth):');
console.log('-'.repeat(80));
const xssPayloads = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '<svg onload=alert(1)>',
];

for (const payload of xssPayloads) {
  const sanitized = escapeHTML(payload);
  console.log(`Original: ${payload}`);
  console.log(`Sanitized: ${sanitized}`);
  console.log();
}

console.log('='.repeat(80));
console.log('CONCLUSION:');
console.log('-'.repeat(80));
if (failCount === 0) {
  console.log('✓ All tests passed! XSS protection is working correctly.');
  console.log('✓ Server validation blocks malicious input.');
  console.log('✓ Client sanitization provides defense-in-depth.');
  console.log('✓ Valid player names are accepted.');
  process.exit(0);
} else {
  console.log(`✗ ${failCount} test(s) failed. Review validation logic.`);
  process.exit(1);
}
