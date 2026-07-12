export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * JSON.stringify for embedding inside an inline <script> block. Plain
 * JSON.stringify doesn't know it's going into HTML, so a value containing
 * a literal "</script>" would close the tag early and turn the rest of the
 * string into raw, browser-parsed HTML. Escaping "<" as a JS unicode
 * escape keeps the value byte-for-byte equivalent once parsed as JS.
 */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003C");
}

const BASE_STYLE = `
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", sans-serif;
    background: #f5f5f5;
    color: #1a1a1a;
    padding: 1rem;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #16181c; color: #eaeaea; }
  }
  a { color: inherit; }
  h1 { font-size: 1.1rem; margin: 0 0 0.75rem; }
  select, textarea, input[type="text"] {
    font-size: 1rem;
    padding: 0.5rem;
    width: 100%;
    border-radius: 0.5rem;
    border: 1px solid #ccc;
  }
  .card {
    background: white;
    border-radius: 1rem;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    padding: 1.25rem;
    max-width: 480px;
    margin: 1rem auto;
    touch-action: pan-y;
  }
  @media (prefers-color-scheme: dark) {
    .card { background: #24272e; box-shadow: none; border: 1px solid #33363d; }
  }
  .card h2 { margin-top: 0; font-size: 1.15rem; }
  .card .body { white-space: pre-wrap; line-height: 1.5; }
  .card .seed-terms { opacity: 0.6; font-size: 0.85rem; margin-top: 0.5rem; }
  .badge {
    display: inline-block;
    font-size: 0.75rem;
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
    background: #eee;
    margin-right: 0.25rem;
  }
  @media (prefers-color-scheme: dark) { .badge { background: #3a3d44; } }
  .actions { display: flex; gap: 0.5rem; margin-top: 1rem; max-width: 480px; margin-left: auto; margin-right: auto; }
  .actions button, .actions a.button {
    flex: 1;
    font-size: 1rem;
    padding: 0.75rem;
    border-radius: 0.75rem;
    border: none;
    text-align: center;
    text-decoration: none;
    display: block;
    transition: transform 0.1s ease, opacity 0.1s ease;
  }
  .actions button:active, .actions a.button:active {
    transform: scale(0.96);
    opacity: 0.8;
  }
  .btn-drop { background: #ffe0e0; color: #8a1f1f; }
  .btn-detail { background: #eee; color: #333; }
  .btn-keep { background: #dff5df; color: #1f5f2a; }
  @media (prefers-color-scheme: dark) {
    .btn-drop { background: #4a2222; color: #ffb3b3; }
    .btn-detail { background: #33363d; color: #eaeaea; }
    .btn-keep { background: #234a2a; color: #b3f5bc; }
  }
  .empty { text-align: center; opacity: 0.7; margin-top: 3rem; }
  .axis-row { margin: 0.75rem 0; }
  .axis-row label { display: flex; justify-content: space-between; font-size: 0.9rem; }
  form.detail-form { max-width: 480px; margin: 1rem auto; }
  .verdict-choice { display: flex; gap: 0.5rem; margin: 1rem 0; }
  .verdict-choice label {
    flex: 1;
    text-align: center;
    padding: 0.5rem;
    border-radius: 0.5rem;
    border: 1px solid #ccc;
  }
`;

export function layout(title: string, bodyHtml: string): string {
  return `<title>${escapeHtml(title)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${BASE_STYLE}</style>
${bodyHtml}`;
}
