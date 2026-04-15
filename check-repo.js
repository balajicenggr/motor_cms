"use strict";
const https = require("https");
const TOKEN = process.argv[2] || process.env.GH_TOKEN;
const OWNER = "balajicenggr", REPO = "motor_cms";

function api(p) {
  return new Promise((resolve) => {
    https.get({ hostname: "api.github.com", path: p,
      headers: { "Authorization": `Bearer ${TOKEN}`, "User-Agent": "check",
                 "Accept": "application/vnd.github+json" }
    }, res => {
      let d = ""; res.on("data", c => d += c);
      res.on("end", () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } });
    }).on("error", e => resolve({ error: e.message }));
  });
}

(async () => {
  if (!TOKEN) { console.log("Usage: node check-repo.js YOUR_PAT"); process.exit(1); }
  const files = await api(`/repos/${OWNER}/${REPO}/contents/`);
  if (Array.isArray(files)) {
    console.log("Root files in repo:");
    files.forEach(f => console.log(`  ${f.type === "dir" ? "📁" : "📄"} ${f.name}`));
  } else {
    console.log("Error:", JSON.stringify(files).slice(0, 200));
  }
  // Check package.json content
  const pkg = await api(`/repos/${OWNER}/${REPO}/contents/package.json`);
  if (pkg.content) {
    const content = Buffer.from(pkg.content, "base64").toString();
    const json = JSON.parse(content);
    console.log(`\npackage.json next version: ${json.dependencies?.next}`);
    console.log(`next.config.ts exists: checking...`);
  }
  const cfg = await api(`/repos/${OWNER}/${REPO}/contents/next.config.ts`);
  console.log(`next.config.ts: ${cfg.message === "Not Found" ? "❌ not in repo" : "⚠️ STILL EXISTS"}`);
  const cfgjs = await api(`/repos/${OWNER}/${REPO}/contents/next.config.js`);
  console.log(`next.config.js: ${cfgjs.sha ? "✅ exists" : "❌ not in repo"}`);
})();
