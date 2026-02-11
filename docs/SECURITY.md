# Security Guidelines for Stellar Siege

This document outlines security measures implemented in Stellar Siege, particularly focused on preventing Cross-Site Scripting (XSS) attacks through player-submitted content.

## Table of Contents

- [Overview](#overview)
- [XSS Prevention Measures](#xss-prevention-measures)
- [Using the Sanitization Utility](#using-the-sanitization-utility)
- [Server Validation Rules](#server-validation-rules)
- [Testing Security Features](#testing-security-features)
- [Developer Best Practices](#developer-best-practices)
- [Security Architecture](#security-architecture)

## Overview

Stellar Siege implements a **defense-in-depth** approach to security, with multiple layers protecting against XSS attacks:

1. **Server-Side Validation (Primary Defense)**: Rejects malicious input before it reaches any client
2. **Client-Side Sanitization (Defense-in-Depth)**: Escapes dangerous content that might slip through
3. **Safe DOM Manipulation**: Prefers `textContent` over `innerHTML`, uses sanitization when HTML is necessary

## XSS Prevention Measures

### What is XSS?

Cross-Site Scripting (XSS) attacks occur when malicious users inject executable scripts into web applications through user input. In a multiplayer game context, this could allow attackers to:

- Steal session data or localStorage credentials
- Impersonate other players
- Disrupt gameplay for other users
- Redirect users to malicious sites

### Attack Vectors Mitigated

The following attack patterns are blocked by our security implementation:

- **Script tag injection**: `<script>alert(1)</script>`
- **Event handler injection**: `<img src=x onerror=alert(1)>`
- **SVG with onload**: `<svg onload=alert(1)>`
- **Iframe injection**: `<iframe src="malicious.com"></iframe>`
- **Template literal injection**: `${alert(1)}`
- **JavaScript protocol**: `javascript:alert(1)`
- **HTML entity encoding tricks**: Various encoded attack attempts
- **Event attributes**: `onclick`, `onmouseover`, etc.

## Using the Sanitization Utility

### Location

The sanitization utility is located at `web/src/game/utils/sanitization.ts`.

### Import

```typescript
import { Sanitization } from '../game/utils/sanitization';
```

### API

#### `Sanitization.escapeHTML(unsafe: string): string`

Escapes HTML special characters to prevent XSS attacks.

**Escaped Characters:**
- `&` → `&amp;`
- `<` → `&lt;`
- `>` → `&gt;`
- `"` → `&quot;`
- `'` → `&#x27;`
- `/` → `&#x2F;`

**Example Usage:**

```typescript
// In a UI screen where you need to display user-submitted content
const playerName = lobby.host; // User-controlled data

// WRONG - Vulnerable to XSS
element.innerHTML = `Host: ${playerName}`;

// CORRECT - Sanitized
element.innerHTML = `Host: ${Sanitization.escapeHTML(playerName)}`;

// EVEN BETTER - Use textContent when possible (no HTML needed)
element.textContent = `Host: ${playerName}`;
```

### Helper Function Pattern

Many UI screens define a local helper function for convenience:

```typescript
// At the top of your screen class
private sanitizeHTML(text: string): string {
  return Sanitization.escapeHTML(text);
}

// Usage throughout the file
element.innerHTML = `
  <div class="player-name">${this.sanitizeHTML(player.name)}</div>
  <div class="lobby-code">${this.sanitizeHTML(lobby.code)}</div>
`;
```

### When to Use Sanitization

**ALWAYS sanitize when:**
- Using `innerHTML` with any user-controlled data
- Displaying player names, lobby codes, or other user input
- Constructing HTML strings with template literals
- Working with data received from the network

**Prefer `textContent` over sanitization when:**
- No HTML formatting is needed
- Displaying plain text content
- Performance is critical (textContent is faster)

## Server Validation Rules

### Location

Server-side validation is implemented in `server/server.ts` in the `validatePlayerName()` method.

### Validation Criteria

Player names must meet ALL of the following criteria:

#### 1. Length Requirements
- **Minimum**: 1 character (after trimming whitespace)
- **Maximum**: 64 characters
- Empty strings and whitespace-only names are rejected

#### 2. HTML Tag Rejection
- Names containing `<` or `>` characters are rejected
- Prevents all HTML tag injection attempts

#### 3. Dangerous Keyword Blocking

The following keywords are prohibited (case-insensitive):

- `script`
- `javascript:`
- `onerror`
- `onload`
- `onclick`
- `onmouseover`
- `svg`
- `iframe`
- `embed`
- `object`

#### 4. Character Whitelist

Only the following characters are allowed:

- **Letters**: `a-z`, `A-Z`
- **Numbers**: `0-9`
- **Spaces**
- **Hyphens**: `-`
- **Underscores**: `_`
- **Periods**: `.`
- **Apostrophes**: `'`
- **Unicode characters**: `\u0080-\uFFFF` (for international names)

**Whitelist Regex**: `/^[a-zA-Z0-9\s\-_.'\u0080-\uFFFF]+$/`

### Validation Response Format

```typescript
interface ValidationResult {
  valid: boolean;
  error?: string;
}
```

**Example Responses:**

```typescript
// Valid name
{ valid: true }

// Invalid - contains HTML
{ valid: false, error: 'Player name cannot contain HTML tags' }

// Invalid - too long
{ valid: false, error: 'Player name must be 64 characters or less' }

// Invalid - prohibited keyword
{ valid: false, error: 'Player name contains prohibited keywords' }

// Invalid - special characters
{ valid: false, error: 'Player name contains invalid characters. Use letters, numbers, spaces, hyphens, underscores, periods, or apostrophes only' }
```

### Where Validation is Applied

Server validation occurs at these endpoints:

1. **Lobby Creation** (`createLobby` method): Validates host name
2. **Lobby Join** (`joinLobby` method): Validates joining player name

Both methods return an error response if validation fails, preventing malicious names from entering the system.

## Testing Security Features

### Automated Unit Tests

**Location**: `web/tests/unit/sanitization.test.ts`

**Run Tests:**
```bash
cd web
bun test tests/unit/sanitization.test.ts
```

**Test Coverage** (43 test cases):
- XSS attack prevention (script tags, event handlers, SVG, iframe)
- HTML entity escaping (ampersands, quotes, angle brackets)
- Edge cases (empty strings, Unicode, emoji, very long strings)
- Valid player names pass through correctly
- Defense against OWASP Top 10 attack vectors

### Manual Security Testing

**Location**: `manual-xss-test-results.md` (root directory)

**Testing Procedure:**

1. **Start Development Environment**
   ```bash
   # Terminal 1: Start server
   cd server
   bun start

   # Terminal 2: Start client
   cd web
   bun run dev
   ```

2. **Test Malicious Payloads**

   Try to create a lobby with these names (should be REJECTED):
   - `<script>alert(1)</script>`
   - `<img src=x onerror=alert(1)>`
   - `${alert(1)}`
   - `<svg onload=alert(1)>`
   - `javascript:alert(1)`
   - `Player<onclick>Name`

3. **Test Valid Names**

   These names should be ACCEPTED:
   - `John_Doe-123`
   - `Player One`
   - `O'Brien`
   - `Dr.Smith.Jr`
   - `Håkan_Müller` (Unicode)
   - `Player123`

4. **Verify Behavior**

   For rejected names:
   - ✓ Error message appears on client
   - ✓ Lobby is not created
   - ✓ Name does not appear in any lobby list

   For accepted names:
   - ✓ Lobby is created successfully
   - ✓ Name appears correctly in UI
   - ✓ No script execution occurs
   - ✓ No console errors

### Integration Testing

**Run Full Test Suite:**
```bash
cd web
bun test
```

**Verify:**
- All existing tests still pass (no regressions)
- New sanitization tests pass
- TypeScript compilation succeeds with no errors

### Security Verification Checklist

Before deploying changes involving user input, verify:

- [ ] Server validation rejects malicious input
- [ ] Client sanitization escapes dangerous content
- [ ] `textContent` is used where HTML is not needed
- [ ] `innerHTML` assignments use `Sanitization.escapeHTML()`
- [ ] Unit tests cover new input fields
- [ ] Manual testing with XSS payloads performed
- [ ] No console errors during testing
- [ ] Normal user input works correctly

## Developer Best Practices

### 1. Assume All User Input is Malicious

**Never trust data from:**
- WebSocket messages
- Form inputs
- URL parameters
- LocalStorage (can be modified by user)
- Any network source

### 2. Validate on the Server

**Always validate on the server-side:**
- Client-side validation can be bypassed
- Server is the authoritative source of truth
- Reject invalid data before it enters your system

### 3. Use Safe DOM Manipulation

**Preference Order (Safest to Least Safe):**

1. **`textContent`** (SAFEST - No HTML interpretation)
   ```typescript
   element.textContent = playerName; // No XSS risk
   ```

2. **`Sanitization.escapeHTML()` + `innerHTML`** (SAFE - Escaped HTML)
   ```typescript
   element.innerHTML = Sanitization.escapeHTML(playerName);
   ```

3. **`innerHTML` with static content only** (SAFE - No user data)
   ```typescript
   element.innerHTML = '<div class="static">Static Content</div>';
   ```

4. **Raw `innerHTML` with user data** (DANGEROUS - NEVER DO THIS)
   ```typescript
   element.innerHTML = playerName; // ❌ VULNERABLE TO XSS
   ```

### 4. Sanitize at Display Time

**Always sanitize when displaying, not when storing:**
- Store original user input (within validation limits)
- Sanitize when rendering to HTML
- This allows changing sanitization logic without data migration

### 5. Add Tests for New Input Fields

When adding a new user input field:

1. Add server-side validation
2. Add client-side sanitization at display time
3. Write unit tests for validation logic
4. Write unit tests for sanitization
5. Perform manual XSS testing
6. Document the field in this security guide

### 6. Regular Security Audits

**Code Review Checklist:**
- [ ] Search for `innerHTML` assignments - verify all use sanitization
- [ ] Search for user data variables - verify validation and sanitization
- [ ] Check WebSocket message handlers - verify input validation
- [ ] Review form submissions - verify server-side validation

**Audit Commands:**
```bash
# Find all innerHTML usage
grep -r "innerHTML" web/src/screens/

# Find potential user data variables
grep -r "player\.name\|lobby\.host\|\.name" web/src/screens/

# Verify sanitization is imported
grep -r "import.*Sanitization" web/src/screens/
```

### 7. Defense in Depth

**Implement multiple security layers:**

- **Layer 1 (Server)**: Validate and reject malicious input
- **Layer 2 (Client)**: Sanitize before display
- **Layer 3 (DOM)**: Prefer safe APIs like `textContent`

If one layer fails, the others provide protection.

## Security Architecture

### Data Flow

```
User Input
    ↓
Server Validation (validatePlayerName)
    ↓ (if invalid)
Error Response → User sees error message
    ↓ (if valid)
Data Storage (in-memory lobbies)
    ↓
Network Transmission (WebSocket)
    ↓
Client Receives Data
    ↓
Client Sanitization (Sanitization.escapeHTML)
    ↓
Safe DOM Rendering (textContent or sanitized innerHTML)
    ↓
User Sees Content (safe)
```

### Trust Boundaries

**Untrusted Sources:**
- All WebSocket messages
- All form inputs
- URL parameters
- Browser localStorage

**Trusted Sources:**
- Static game data in `web/src/data/factions.ts`
- Server-generated values (lobby codes, timestamps)
- Constants defined in code

**Rule**: Never mix untrusted data with trusted data without validation/sanitization.

### Current Protected Surfaces

The following UI screens have XSS protection implemented:

1. **DeckBuilderScreen.ts**
   - Unit names, faction names, division names
   - Deck names (user input)
   - Transport options
   - Saved deck lists

2. **JoinGameScreen.ts**
   - Lobby host names
   - Lobby codes
   - Player counts
   - Map sizes

3. **GameLobbyScreen.ts**
   - Player names in lobby
   - Host name
   - Confirm dialogs with player names

### Future Considerations

As the game evolves, apply security measures to:

- Chat messages (if implemented)
- Custom deck descriptions (if implemented)
- Clan/guild names (if implemented)
- In-game markers or waypoint labels (if implemented)
- Any new user-generated content

## Reporting Security Issues

If you discover a security vulnerability:

1. **Do NOT create a public GitHub issue**
2. Contact the development team directly
3. Provide a detailed description of the vulnerability
4. Include steps to reproduce
5. Suggest a fix if possible

Security vulnerabilities will be addressed with high priority.

---

## References

- **OWASP XSS Prevention Cheat Sheet**: https://cheats.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html
- **Sanitization Utility**: `web/src/game/utils/sanitization.ts`
- **Server Validation**: `server/server.ts` (validatePlayerName method)
- **Unit Tests**: `web/tests/unit/sanitization.test.ts`
- **Manual Test Results**: `manual-xss-test-results.md`

---

**Last Updated**: 2026-02-11
**Security Status**: ✓ Production-Ready
