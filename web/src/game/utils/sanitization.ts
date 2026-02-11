/**
 * Sanitization utility for preventing XSS attacks
 */
class SanitizationClass {
  /**
   * Escapes HTML special characters to prevent XSS attacks
   * @param unsafe - The untrusted string to escape
   * @returns The escaped string safe for HTML insertion
   */
  escapeHTML(unsafe: string): string {
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }
}

export const Sanitization = new SanitizationClass();
