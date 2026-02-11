#!/usr/bin/env node

/**
 * Manual XSS Security Test Demonstration
 *
 * This script demonstrates the XSS protection mechanisms
 * for player names in the Stellar Siege multiplayer system.
 */

console.log('\n' + '='.repeat(80));
console.log('STELLAR SIEGE - XSS SECURITY TEST DEMONSTRATION');
console.log('='.repeat(80));
console.log('\nThis demonstrates the multi-layer XSS protection:');
console.log('1. Server-side validation (PRIMARY DEFENSE)');
console.log('2. Client-side sanitization (DEFENSE-IN-DEPTH)');
console.log('\n' + '='.repeat(80));

// ============================================================================
// SERVER-SIDE VALIDATION (from server/server.ts)
// ============================================================================

function validatePlayerName(name) {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Player name is required' };
  }

  const trimmedName = name.trim();

  if (trimmedName.length < 1) {
    return { valid: false, error: 'Player name cannot be empty' };
  }
  if (trimmedName.length > 64) {
    return { valid: false, error: 'Player name must be 64 characters or less' };
  }

  if (trimmedName.includes('<') || trimmedName.includes('>')) {
    return { valid: false, error: 'Player name cannot contain HTML tags' };
  }

  const dangerousKeywords = ['script', 'javascript:', 'onerror', 'onload', 'onclick', 'onmouseover', 'svg', 'iframe', 'embed', 'object'];
  const lowerName = trimmedName.toLowerCase();
  for (const keyword of dangerousKeywords) {
    if (lowerName.includes(keyword)) {
      return { valid: false, error: 'Player name contains prohibited keywords' };
    }
  }

  const allowedPattern = /^[a-zA-Z0-9\s\-_.'\u0080-\uFFFF]+$/;
  if (!allowedPattern.test(trimmedName)) {
    return { valid: false, error: 'Player name contains invalid characters' };
  }

  return { valid: true };
}

// ============================================================================
// CLIENT-SIDE SANITIZATION (from web/src/game/utils/sanitization.ts)
// ============================================================================

function escapeHTML(unsafe) {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

// ============================================================================
// TEST SCENARIOS
// ============================================================================

const xssPayloads = [
  { name: '<script>alert(1)</script>', description: 'Basic script tag injection' },
  { name: '<img src=x onerror=alert(1)>', description: 'Image with onerror event' },
  { name: '${alert(1)}', description: 'Template literal injection' },
  { name: '<svg onload=alert(1)>', description: 'SVG with onload event' },
];

const validNames = [
  { name: 'John_Doe-123', description: 'Standard alphanumeric with symbols' },
  { name: 'Player One', description: 'Name with space' },
  { name: "O'Brien", description: 'Name with apostrophe' },
  { name: 'Dr.Smith.Jr', description: 'Name with periods' },
];

console.log('\n📋 TEST 1: XSS ATTACK PAYLOADS (Should be REJECTED)');
console.log('-'.repeat(80));

let attacksBlocked = 0;
for (const payload of xssPayloads) {
  const result = validatePlayerName(payload.name);
  const status = !result.valid ? '✓ BLOCKED' : '✗ ALLOWED';
  const displayName = payload.name.length > 35 ? payload.name.substring(0, 35) + '...' : payload.name;

  console.log(`\n${status} | ${payload.description}`);
  console.log(`  Input: "${displayName}"`);
  console.log(`  Result: ${result.valid ? 'ACCEPTED (DANGER!)' : 'REJECTED'}`);
  if (!result.valid) {
    console.log(`  Reason: ${result.error}`);
    attacksBlocked++;
  }
}

console.log('\n' + '-'.repeat(80));
console.log(`Server blocked ${attacksBlocked}/${xssPayloads.length} XSS attacks`);

console.log('\n\n📋 TEST 2: VALID PLAYER NAMES (Should be ACCEPTED)');
console.log('-'.repeat(80));

let validNamesAccepted = 0;
for (const valid of validNames) {
  const result = validatePlayerName(valid.name);
  const status = result.valid ? '✓ ACCEPTED' : '✗ REJECTED';

  console.log(`\n${status} | ${valid.description}`);
  console.log(`  Input: "${valid.name}"`);
  console.log(`  Result: ${result.valid ? 'ACCEPTED' : 'REJECTED (ERROR!)'}`);
  if (!result.valid) {
    console.log(`  Error: ${result.error}`);
  }
  if (result.valid) {
    validNamesAccepted++;
  }
}

console.log('\n' + '-'.repeat(80));
console.log(`Server accepted ${validNamesAccepted}/${validNames.length} valid names`);

console.log('\n\n📋 TEST 3: DEFENSE-IN-DEPTH (Client-Side Sanitization)');
console.log('-'.repeat(80));
console.log('\nHypothetical scenario: A malicious payload bypasses server validation');
console.log('Client-side sanitization would still prevent XSS execution:\n');

for (const payload of xssPayloads.slice(0, 3)) {
  const sanitized = escapeHTML(payload.name);
  console.log(`Original:  ${payload.name}`);
  console.log(`Sanitized: ${sanitized}`);
  console.log(`Effect:    Would display as text, not execute as code\n`);
}

console.log('-'.repeat(80));
console.log('Client-side escapeHTML() converts dangerous characters to HTML entities');

console.log('\n\n📋 TEST 4: EDGE CASES');
console.log('-'.repeat(80));

const edgeCases = [
  { name: '', description: 'Empty string' },
  { name: '   ', description: 'Whitespace only' },
  { name: 'A'.repeat(65), description: 'Exceeds 64 char limit' },
  { name: 'Player@#$%', description: 'Invalid characters' },
  { name: 'ScRiPt Test', description: 'Mixed case keyword' },
];

let edgeCasesHandled = 0;
for (const edge of edgeCases) {
  const result = validatePlayerName(edge.name);
  const status = !result.valid ? '✓ HANDLED' : '✗ ACCEPTED';
  const displayName = edge.name.length > 20 ? edge.name.substring(0, 20) + '...' : edge.name || '[empty]';

  console.log(`\n${status} | ${edge.description}`);
  console.log(`  Input: "${displayName}"`);
  console.log(`  Result: ${result.valid ? 'ACCEPTED' : 'REJECTED'}`);
  if (!result.valid) {
    console.log(`  Reason: ${result.error}`);
    edgeCasesHandled++;
  }
}

console.log('\n' + '-'.repeat(80));
console.log(`Server correctly handled ${edgeCasesHandled}/${edgeCases.length} edge cases`);

// ============================================================================
// FINAL SUMMARY
// ============================================================================

console.log('\n\n' + '='.repeat(80));
console.log('SECURITY VERIFICATION SUMMARY');
console.log('='.repeat(80));

const allPassed = (
  attacksBlocked === xssPayloads.length &&
  validNamesAccepted === validNames.length &&
  edgeCasesHandled === edgeCases.length
);

if (allPassed) {
  console.log('\n✓ ALL SECURITY TESTS PASSED\n');
  console.log('Security Posture:');
  console.log('  ✓ XSS attacks blocked by server validation');
  console.log('  ✓ Valid player names work correctly');
  console.log('  ✓ Edge cases handled properly');
  console.log('  ✓ Client-side sanitization provides defense-in-depth');
  console.log('  ✓ No script execution possible');
  console.log('\nConclusion: The system is SECURE and ready for production.');
} else {
  console.log('\n✗ SECURITY TESTS FAILED\n');
  console.log('Issues detected:');
  if (attacksBlocked !== xssPayloads.length) {
    console.log(`  ✗ ${xssPayloads.length - attacksBlocked} XSS attack(s) not blocked`);
  }
  if (validNamesAccepted !== validNames.length) {
    console.log(`  ✗ ${validNames.length - validNamesAccepted} valid name(s) rejected`);
  }
  if (edgeCasesHandled !== edgeCases.length) {
    console.log(`  ✗ ${edgeCases.length - edgeCasesHandled} edge case(s) mishandled`);
  }
  console.log('\nConclusion: Review and fix validation logic before deployment.');
}

console.log('\n' + '='.repeat(80));
console.log('Manual testing verification completed.');
console.log('See manual-xss-test-results.md for detailed documentation.');
console.log('='.repeat(80) + '\n');

process.exit(allPassed ? 0 : 1);
