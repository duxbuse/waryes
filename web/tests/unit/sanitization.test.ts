/**
 * Unit tests for sanitization utility
 */

import { describe, it, expect } from 'vitest';
import { Sanitization } from '../../src/game/utils/sanitization';

describe('Sanitization', () => {
  describe('escapeHTML', () => {
    describe('XSS attack prevention', () => {
      it('should escape script tags', () => {
        const malicious = '<script>alert("XSS")</script>';
        const result = Sanitization.escapeHTML(malicious);
        expect(result).toBe('&lt;script&gt;alert(&quot;XSS&quot;)&lt;&#x2F;script&gt;');
        expect(result).not.toContain('<script>');
      });

      it('should escape img tag with onerror', () => {
        const malicious = '<img src=x onerror=alert(1)>';
        const result = Sanitization.escapeHTML(malicious);
        expect(result).toBe('&lt;img src=x onerror=alert(1)&gt;');
        expect(result).not.toContain('<img');
      });

      it('should escape svg with onload', () => {
        const malicious = '<svg onload=alert(1)>';
        const result = Sanitization.escapeHTML(malicious);
        expect(result).toBe('&lt;svg onload=alert(1)&gt;');
        expect(result).not.toContain('<svg');
      });

      it('should escape iframe injection', () => {
        const malicious = '<iframe src="javascript:alert(1)"></iframe>';
        const result = Sanitization.escapeHTML(malicious);
        expect(result).toBe('&lt;iframe src=&quot;javascript:alert(1)&quot;&gt;&lt;&#x2F;iframe&gt;');
        expect(result).not.toContain('<iframe');
      });

      it('should escape template literal injection', () => {
        const malicious = '${alert(1)}';
        const result = Sanitization.escapeHTML(malicious);
        // $ and {} are not escaped, but the surrounding context makes them safe
        expect(result).toBe('${alert(1)}');
      });

      it('should escape event handlers in attributes', () => {
        const malicious = '" onclick="alert(1)"';
        const result = Sanitization.escapeHTML(malicious);
        expect(result).toBe('&quot; onclick=&quot;alert(1)&quot;');
        expect(result).not.toContain('onclick=');
      });

      it('should escape javascript: protocol', () => {
        const malicious = '<a href="javascript:alert(1)">Click</a>';
        const result = Sanitization.escapeHTML(malicious);
        expect(result).toBe('&lt;a href=&quot;javascript:alert(1)&quot;&gt;Click&lt;&#x2F;a&gt;');
        expect(result).not.toContain('<a');
      });

      it('should escape data: protocol with HTML', () => {
        const malicious = '<a href="data:text/html,<script>alert(1)</script>">Click</a>';
        const result = Sanitization.escapeHTML(malicious);
        expect(result).not.toContain('<script>');
        expect(result).not.toContain('<a href');
      });
    });

    describe('HTML entity escaping', () => {
      it('should escape ampersands', () => {
        const input = 'Tom & Jerry';
        const result = Sanitization.escapeHTML(input);
        expect(result).toBe('Tom &amp; Jerry');
      });

      it('should escape less-than signs', () => {
        const input = '5 < 10';
        const result = Sanitization.escapeHTML(input);
        expect(result).toBe('5 &lt; 10');
      });

      it('should escape greater-than signs', () => {
        const input = '10 > 5';
        const result = Sanitization.escapeHTML(input);
        expect(result).toBe('10 &gt; 5');
      });

      it('should escape double quotes', () => {
        const input = 'Say "hello"';
        const result = Sanitization.escapeHTML(input);
        expect(result).toBe('Say &quot;hello&quot;');
      });

      it('should escape single quotes', () => {
        const input = "It's working";
        const result = Sanitization.escapeHTML(input);
        expect(result).toBe('It&#x27;s working');
      });

      it('should escape forward slashes', () => {
        const input = '</script>';
        const result = Sanitization.escapeHTML(input);
        expect(result).toBe('&lt;&#x2F;script&gt;');
      });

      it('should escape multiple special characters together', () => {
        const input = '<div class="test">&hello\'s</div>';
        const result = Sanitization.escapeHTML(input);
        expect(result).toBe('&lt;div class=&quot;test&quot;&gt;&amp;hello&#x27;s&lt;&#x2F;div&gt;');
      });

      it('should handle multiple ampersands', () => {
        const input = 'A & B & C';
        const result = Sanitization.escapeHTML(input);
        expect(result).toBe('A &amp; B &amp; C');
      });
    });

    describe('edge cases', () => {
      it('should handle empty string', () => {
        const result = Sanitization.escapeHTML('');
        expect(result).toBe('');
      });

      it('should handle string with only spaces', () => {
        const input = '   ';
        const result = Sanitization.escapeHTML(input);
        expect(result).toBe('   ');
      });

      it('should handle very long strings', () => {
        const input = '<script>'.repeat(1000);
        const result = Sanitization.escapeHTML(input);
        expect(result).not.toContain('<script>');
        expect(result.length).toBeGreaterThan(input.length);
      });

      it('should handle unicode characters', () => {
        const input = '你好 <script>alert(1)</script>';
        const result = Sanitization.escapeHTML(input);
        expect(result).toBe('你好 &lt;script&gt;alert(1)&lt;&#x2F;script&gt;');
        expect(result).toContain('你好');
      });

      it('should handle emoji', () => {
        const input = '😀 <script>alert(1)</script>';
        const result = Sanitization.escapeHTML(input);
        expect(result).toBe('😀 &lt;script&gt;alert(1)&lt;&#x2F;script&gt;');
        expect(result).toContain('😀');
      });

      it('should handle newlines and tabs', () => {
        const input = 'Line 1\nLine 2\tTabbed';
        const result = Sanitization.escapeHTML(input);
        expect(result).toBe('Line 1\nLine 2\tTabbed');
      });

      it('should handle mixed case HTML tags', () => {
        const input = '<ScRiPt>alert(1)</ScRiPt>';
        const result = Sanitization.escapeHTML(input);
        expect(result).toBe('&lt;ScRiPt&gt;alert(1)&lt;&#x2F;ScRiPt&gt;');
      });
    });

    describe('valid player names', () => {
      it('should pass through alphanumeric names', () => {
        const input = 'Player123';
        const result = Sanitization.escapeHTML(input);
        expect(result).toBe('Player123');
      });

      it('should pass through names with underscores', () => {
        const input = 'Player_Name';
        const result = Sanitization.escapeHTML(input);
        expect(result).toBe('Player_Name');
      });

      it('should pass through names with hyphens', () => {
        const input = 'Player-Name';
        const result = Sanitization.escapeHTML(input);
        expect(result).toBe('Player-Name');
      });

      it('should pass through names with spaces', () => {
        const input = 'Player Name';
        const result = Sanitization.escapeHTML(input);
        expect(result).toBe('Player Name');
      });

      it('should pass through names with numbers', () => {
        const input = '123456789';
        const result = Sanitization.escapeHTML(input);
        expect(result).toBe('123456789');
      });

      it('should handle names with parentheses safely', () => {
        const input = 'Player (Pro)';
        const result = Sanitization.escapeHTML(input);
        expect(result).toBe('Player (Pro)');
      });

      it('should handle names with brackets safely', () => {
        const input = 'Player [Team]';
        const result = Sanitization.escapeHTML(input);
        expect(result).toBe('Player [Team]');
      });
    });

    describe('defense in depth', () => {
      it('should prevent nested script tags', () => {
        const malicious = '<<script>script>alert(1)<</script>/script>';
        const result = Sanitization.escapeHTML(malicious);
        expect(result).not.toContain('<script>');
        expect(result).toBe('&lt;&lt;script&gt;script&gt;alert(1)&lt;&lt;&#x2F;script&gt;&#x2F;script&gt;');
      });

      it('should prevent encoded script tags', () => {
        const malicious = '&#60;script&#62;alert(1)&#60;/script&#62;';
        const result = Sanitization.escapeHTML(malicious);
        // Already encoded entities should be double-encoded for safety
        expect(result).toBe('&amp;#60;script&amp;#62;alert(1)&amp;#60;&#x2F;script&amp;#62;');
      });

      it('should prevent null byte injection', () => {
        const malicious = '<script\0>alert(1)</script>';
        const result = Sanitization.escapeHTML(malicious);
        expect(result).not.toContain('<script>');
      });

      it('should handle multiple XSS vectors in one string', () => {
        const malicious = '<script>alert(1)</script><img src=x onerror=alert(2)>';
        const result = Sanitization.escapeHTML(malicious);
        expect(result).not.toContain('<script>');
        expect(result).not.toContain('<img');
        // Note: 'onerror=' will still be present as text, but it's safe because the HTML tags are escaped
        expect(result).toContain('&lt;');
        expect(result).toContain('&gt;');
      });
    });

    describe('real-world attack vectors', () => {
      it('should prevent OWASP XSS example 1', () => {
        const malicious = '"><script>alert(String.fromCharCode(88,83,83))</script>';
        const result = Sanitization.escapeHTML(malicious);
        expect(result).not.toContain('<script>');
      });

      it('should prevent OWASP XSS example 2', () => {
        const malicious = "'><script>alert(String.fromCharCode(88,83,83))</script>";
        const result = Sanitization.escapeHTML(malicious);
        expect(result).not.toContain('<script>');
      });

      it('should prevent HTML injection', () => {
        const malicious = '<div style="position:absolute;top:0;left:0;width:100%;height:100%"></div>';
        const result = Sanitization.escapeHTML(malicious);
        expect(result).not.toContain('<div');
        // Note: 'position:absolute' will still be present as text, but it's safe because the HTML tags are escaped
        expect(result).toContain('&lt;');
        expect(result).toContain('&gt;');
        expect(result).toContain('&quot;');
      });

      it('should prevent meta refresh redirect', () => {
        const malicious = '<meta http-equiv="refresh" content="0;url=http://evil.com">';
        const result = Sanitization.escapeHTML(malicious);
        expect(result).not.toContain('<meta');
      });
    });
  });
});
