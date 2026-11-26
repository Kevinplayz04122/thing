import { readFileSync } from "node:fs";
import vm from "node:vm";
import { pathToFileURL } from "node:url";

const CLASSIC_TYPES = new Set(["text/javascript", "application/javascript"]);

export function extractInlineScripts(html) {
  const found = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  for (let m; (m = re.exec(html)) !== null; ) {
    const attrs = m[1];
    if (/\bsrc\s*=/i.test(attrs)) continue;
    const typeMatch = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs);
    const type = typeMatch ? typeMatch[1].toLowerCase() : "";
    found.push({ index: found.length + 1, type, code: m[2] });
  }
  return found;
}

export function checkScripts(html) {
  const results = [];
  for (const s of extractInlineScripts(html)) {
    if (s.type && !CLASSIC_TYPES.has(s.type)) {
      results.push({ index: s.index, status: "skipped", detail: `type=${s.type}` });
      continue;
    }
    try {
      new vm.Script(s.code, { filename: `inline-script-${s.index}` });
      results.push({ index: s.index, status: "ok" });
    } catch (e) {
      results.push({ index: s.index, status: "error", detail: String(e.message) });
    }
  }
  return results;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2];
  if (!file) { console.error("usage: node check_inline_scripts.mjs <file.html>"); process.exit(2); }
  const results = checkScripts(readFileSync(file, "utf8"));
  for (const r of results) console.log(`script ${r.index}: ${r.status}${r.detail ? " - " + r.detail : ""}`);
  const bad = results.filter(r => r.status === "error").length;
  console.log(`inline scripts: ${results.length}, errors: ${bad}`);
  process.exit(bad ? 1 : 0);
}
