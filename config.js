/*
 * MCK site configuration — the ONLY file you need to edit to go live.
 *
 * Everything here is public (it ships to every visitor's browser).
 * Never put passwords, API keys or other secrets in this file.
 */
window.MCK_CONFIG = Object.freeze({
  // Google Apps Script web app URL, ending in /exec.
  // Leave empty and registration stays disabled with a "not configured" notice.
  // Example: 'https://script.google.com/macros/s/AKfy...xyz/exec'
  endpoint: '',

  // true = simulate the backend. Nothing is saved, and the page shows a
  // DEMO MODE banner. Use for local design work only; set false before launch.
  // Tip: in demo mode, an email containing "fail" simulates a backend error.
  demoMode: false,

  // Optional: only accept emails from these domains, e.g. ['example.com'].
  // Keep in sync with ALLOWED_EMAIL_DOMAINS in backend/Code.gs (the server
  // enforces it; this copy only gives faster feedback).
  allowedEmailDomains: [],

  // Give up waiting for the backend after this many milliseconds.
  requestTimeoutMs: 20000,

  // Where members can ask questions or request correction/deletion of their
  // details. Leave label empty to show a "contact details coming soon" note.
  // Examples: { label: 'Message the organiser on Teams', href: '' }
  //           { label: 'mck.organiser@example.com', href: 'mailto:mck.organiser@example.com' }
  contact: {
    label: '',
    href: ''
  }
});
