// Idempotent post-build patches for hub.html:
//   1. Games whose host forbids embedding (frame-ancestors / X-Frame-Options) get an "Open in new tab" card instead of a dead iframe.
//   2. Chat UI polish layer (CSS only) + one literal-markdown fix in the empty-chat hint.
// Usage: node apply_ui_patches.mjs <hub.html>
import { readFileSync, writeFileSync } from "node:fs";

const file = process.argv[2];
if (!file) { console.error("usage: node apply_ui_patches.mjs <hub.html>"); process.exit(2); }
let html = readFileSync(file, "utf8");
const log = [];

function once(label, marker, anchor, build) {
  if (html.includes(marker)) { log.push(`skip (already applied): ${label}`); return; }
  const first = html.indexOf(anchor);
  if (first === -1) throw new Error(`anchor not found: ${label}`);
  if (html.indexOf(anchor, first + 1) !== -1) throw new Error(`anchor not unique: ${label}`);
  html = html.slice(0, first) + build(anchor) + html.slice(first + anchor.length);
  log.push(`applied: ${label}`);
}

// ---------------------------------------------------------------- 1. games with embedding forbidden
once(
  "frame-blocked host list",
  "/* OXYGEN-FRAME-BLOCKED */",
  "function frameSource(game) {",
  (a) => `/* OXYGEN-FRAME-BLOCKED */
  // Hosts verified (response headers, 2026-11-26) to forbid framing by other sites: 99nz.hodlpartners.com sends
  // "Content-Security-Policy: frame-ancestors 'self'". poki.com also blocks framing. Direct navigation works.
  const FRAME_BLOCKED_HOSTS = new Set(["99nz.hodlpartners.com", "poki.com", "www.poki.com"]);
  function isFrameBlocked(url) {
    try { return FRAME_BLOCKED_HOSTS.has(new URL(url, location.href).hostname.toLowerCase()); } catch { return false; }
  }
  ${a}`
);

{
  const marker = "/* OXYGEN-FRAME-BLOCKED-RETURN */";
  if (html.includes(marker)) log.push("skip (already applied): frameSource blocked flag");
  else {
    const target = "    return { src: activeUrl };\n  }\n\n  const FRAME_ALLOW";
    const alt = target.replace(/\n/g, "\r\n");
    const use = html.includes(target) ? target : html.includes(alt) ? alt : null;
    if (!use) throw new Error("anchor not found: frameSource return");
    const nl = use.includes("\r\n") ? "\r\n" : "\n";
    const repl = `    ${marker}${nl}    return isFrameBlocked(activeUrl) ? { src: activeUrl, blocked: true } : { src: activeUrl };${nl}  }${nl}${nl}  const FRAME_ALLOW`;
    html = html.replace(use, () => repl);
    log.push("applied: frameSource blocked flag");
  }
}

once(
  "EmbedBlockedCard component",
  "/* OXYGEN-EMBED-CARD */",
  "function Player({ game, onClose }) {",
  (a) => `/* OXYGEN-EMBED-CARD */
  function EmbedBlockedCard({ game, href }) {
    let host = href;
    try { host = new URL(href, location.href).hostname; } catch {}
    return h("div", { style: { flex: 1, width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 24, textAlign: "center", background: "radial-gradient(circle at 50% 35%, rgba(255,255,255,0.05), transparent 60%), #0b0b0f" } },
      game.thumb ? h("img", { src: game.thumb, alt: "", style: { width: 120, height: 120, objectFit: "cover", borderRadius: 18, border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 12px 40px rgba(0,0,0,0.5)" } }) : h("div", { style: { fontSize: 44 } }, "🎮"),
      h("h3", { style: { fontSize: 20, fontWeight: 800 } }, game.name),
      h("p", { style: { fontSize: 13, color: "var(--muted)", maxWidth: 440, lineHeight: 1.5 } },
        host + " does not allow its games to be embedded inside other sites, so this one has to open in its own tab."),
      h("button", { className: "btn", onClick: () => { window.open(href, "_blank", "noopener,noreferrer"); } }, "Open " + game.name + " in a new tab ↗")
    );
  }

  ${a}`
);

{
  const marker = "/* OXYGEN-PLAYER-BLOCKED */";
  if (html.includes(marker)) log.push("skip (already applied): Player blocked branch");
  else {
    const re = /h\("iframe", \{ key: `\$\{game\.slug\}_\$\{nonce\}`, ref: frameRef, title: game\.name, src: source\.src, srcDoc: source\.srcdoc, allow: FRAME_ALLOW, allowFullScreen: true \}\)/;
    if (!re.test(html)) throw new Error("anchor not found: Player iframe");
    html = html.replace(re, (m) => `${marker} source.blocked ? h(EmbedBlockedCard, { game, href: source.src }) : ${m}`);
    log.push("applied: Player blocked branch");
  }
}

{
  const marker = "/* OXYGEN-TAB-BLOCKED */";
  if (html.includes(marker)) log.push("skip (already applied): GameTabView blocked branch");
  else {
    const re = /h\("iframe", \{\s*key: `\$\{game\.slug\}_tab_\$\{nonce\}`,[\s\S]*?allowFullScreen: true\s*\}\)/;
    if (!re.test(html)) throw new Error("anchor not found: GameTabView iframe");
    html = html.replace(re, (m) => `${marker} source.blocked ? h(EmbedBlockedCard, { game, href: source.src }) : ${m}`);
    log.push("applied: GameTabView blocked branch");
  }
}

// ---------------------------------------------------------------- 2. chat UI polish
const CHAT_CSS = `
/* OXYGEN-CHAT-POLISH-V4 */
.dc-root { -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
.dc-root * { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.18) transparent; }
.dc-root *::-webkit-scrollbar { width: 9px; height: 9px; }
.dc-root *::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 9px; border: 2px solid transparent; background-clip: padding-box; }
.dc-root *::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.3); background-clip: padding-box; }
.dc-root *::-webkit-scrollbar-track { background: transparent; }

.dc-root :is(.dc-chan-btn, .dc-srv-btn, .dc-act-btn, .dc-react-pill):focus-visible { outline: 2px solid var(--dac); outline-offset: 2px; }

.dc-head, .dc-side-head { height: 48px; }
.dc-head { position: relative; z-index: 3; font-weight: 700; box-shadow: 0 1px 0 rgba(0,0,0,0.28), 0 10px 20px -16px rgba(0,0,0,0.7); }
.dc-side-head { box-shadow: 0 1px 0 rgba(0,0,0,0.28); }

.dc-chan-btn { position: relative; }
.dc-chan-btn.active::before { content: ""; position: absolute; left: -8px; top: 7px; bottom: 7px; width: 3px; border-radius: 0 3px 3px 0; background: var(--dac); }
.dc-srv-btn { box-shadow: 0 2px 8px rgba(0,0,0,0.25); }

.dc-feed { scroll-behavior: smooth; overscroll-behavior: contain; padding-bottom: 14px; }
.dc-date-div { letter-spacing: 0.04em; text-transform: uppercase; font-size: 10.5px; }

.dc-msg { padding: 2px 20px; font-size: 14px; line-height: 1.46; overflow-wrap: anywhere; }
.dc-msg.first { margin-top: 14px; }
.dc-msg:hover { background: rgba(255,255,255,0.035); }
.dc-msg a { color: #7cb7ff; text-decoration: none; word-break: break-all; }
.dc-msg a:hover { text-decoration: underline; }
.dc-msg code { font-family: ui-monospace, "Cascadia Code", Consolas, monospace; }
.dc-msg pre { max-width: 100%; overflow-x: auto; margin: 6px 0; padding: 10px 12px; border-radius: 8px; font-size: 12.5px; line-height: 1.5; background: rgba(0,0,0,0.38); border: 1px solid rgba(255,255,255,0.08); }
.dc-msg img { max-width: 100%; }
.dc-av img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }

.dc-reply-bar:hover { color: var(--dt); }
.dc-hover-bar { border-radius: 10px; animation: dcPop 0.12s ease-out; }
.dc-msg:focus-within .dc-hover-bar { display: inline-flex; }
.dc-act-btn { transition: background 0.12s, transform 0.12s, color 0.12s; }
.dc-act-btn:hover { transform: translateY(-1px); }
.dc-react-pill { transition: background 0.12s, border-color 0.12s; }
.dc-react-pill:hover { background: rgba(255,255,255,0.09); border-color: rgba(255,255,255,0.2); }
.dc-react-pill.me { background: color-mix(in srgb, var(--dac) 20%, transparent); border-color: var(--dac); }
@keyframes dcPop { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: none; } }

.dc-composer-box { padding: 4px 18px 16px; }
.dc-composer-bar { border-radius: 14px; padding: 4px 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.18); transition: border-color 0.15s, box-shadow 0.15s; }
.dc-composer-bar:focus-within { border-color: var(--dac); box-shadow: 0 0 0 3px color-mix(in srgb, var(--dac) 22%, transparent), 0 2px 10px rgba(0,0,0,0.18); }
.dc-composer-input { height: 42px; font-size: 14.5px; }
.dc-composer-input::placeholder { color: var(--dm); opacity: 0.8; }

.dc-mem-row { transition: background 0.12s; }
.dc-mem-row:hover { background: rgba(255,255,255,0.06); }

.dc-root.dct-light :is(.dc-rail, .dc-sidebar, .dc-head, .dc-members, .dc-me-pod, .dc-side-head) { border-color: rgba(0,0,0,0.09); }
.dc-root.dct-light .dc-chan-btn:hover { background: rgba(0,0,0,0.05); }
.dc-root.dct-light .dc-chan-btn.active { background: rgba(0,0,0,0.09); }
.dc-root.dct-light .dc-msg:hover { background: rgba(0,0,0,0.03); }
.dc-root.dct-light .dc-composer-bar { border-color: rgba(0,0,0,0.12); }
.dc-root.dct-light .dc-date-div::before, .dc-root.dct-light .dc-date-div::after { background: rgba(0,0,0,0.1); }
.dc-root.dct-light .dc-hover-bar { border-color: rgba(0,0,0,0.12); }
.dc-root.dct-light .dc-msg pre { background: rgba(0,0,0,0.06); border-color: rgba(0,0,0,0.1); }
.dc-root.dct-light .dc-msg a { color: #1d6fd6; }
.dc-root.dct-light .dc-msg span[style*="rgb(228, 228, 231)"] { color: var(--dt) !important; }
.dc-root.dct-light * { scrollbar-color: rgba(0,0,0,0.25) transparent; }

@media (max-width: 680px) {
  .dc-msg { padding: 2px 12px; }
  .dc-composer-box { padding: 4px 10px 12px; }
  .dc-composer-input { font-size: 16px; }
  .dc-hover-bar { right: 8px; }
}
@media (prefers-reduced-motion: reduce) {
  .dc-feed { scroll-behavior: auto; }
  .dc-hover-bar { animation: none; }
  .dc-act-btn:hover { transform: none; }
}
`;

if (html.includes(".dc-guild-item") || html.includes('id="x0c"')) {
  log.push("skip (99nz/v4 Discord UI already present): chat polish CSS");
} else {
  once(
    "chat polish CSS",
    "/* OXYGEN-CHAT-POLISH-V4 */",
    "</style>",
    (a) => CHAT_CSS + a
  );
}

{
  const from = '"Supports **Markdown**, @mentions, /commands, replies, reactions, GIFs & voice memos."';
  const to = '"Supports Markdown (bold, italic, code), @mentions, /commands, replies, reactions, GIFs & voice memos."';
  if (html.includes(to)) log.push("skip (already applied): empty-chat hint");
  else if (html.includes(from)) { html = html.replace(from, () => to); log.push("applied: empty-chat hint"); }
  else log.push("note: empty-chat hint text not found (left unchanged)");
}

writeFileSync(file, html);
console.log(log.join("\n"));
