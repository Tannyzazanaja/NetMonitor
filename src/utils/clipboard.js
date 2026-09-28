/**
 * Universal Clipboard Utility
 * Supports both Secure Contexts (HTTPS/localhost) and Non-Secure Contexts (HTTP on IP addresses)
 */

export async function copyToClipboard(text) {
  if (!text) return false;

  // 1. Try modern Clipboard API if available and in secure context
  if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn('navigator.clipboard.writeText failed, attempting fallback...', err);
    }
  }

  // 2. Universal Legacy Fallback (Works on plain HTTP, LAN IP addresses, older browsers)
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;

    // Prevent scrolling and keep it invisible
    textArea.style.position = 'fixed';
    textArea.style.top = '-9999px';
    textArea.style.left = '-9999px';
    textArea.style.opacity = '0';
    textArea.setAttribute('readonly', '');

    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    // Copy selection
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    console.error('Universal copyToClipboard error:', err);
    return false;
  }
}
