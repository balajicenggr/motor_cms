"use strict";
/**
 * Upload ALL source files to GitHub
 * Usage: node upload-all.js YOUR_PAT
 * Get PAT: github.com/settings/tokens → Fine-grained → motor_cms → Contents: Read+Write
 */
const https = require("https");
const fs    = require("fs");
const path  = require("path");

const TOKEN = process.argv[2];
const OWNER = "balajicenggr", REPO = "motor_cms", BRANCH = "main";
const BASE  = __dirname;

if (!TOKEN) {
  console.error("Usage: node upload-all.js YOUR_GITHUB_PAT");
  process.exit(1);
}

// Every file needed for the build
const FILES = [
  "package.json",
  "next.config.js",
  "tailwind.config.ts",
  "tsconfig.json",
  "postcss.config.js",
  ".env.example",
  ".gitignore",
  "src/app/globals.css",
  "src/app/layout.tsx",
  "src/app/page.tsx",
  "src/lib/supabase.ts",
  "src/types/index.ts",
  "src/components/dashboard/GaugeCard.tsx",
  "src/components/dashboard/HealthStatus.tsx",
  "src/components/dashboard/MLPanel.tsx",
  "src/components/dashboard/TimeSeriesChart.tsx",
  "src/components/dashboard/AlertPanel.tsx",
  "src/components/dashboard/SystemLog.tsx",
  "src/components/dashboard/Header.tsx",
];

function api(method, p, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: "api.github.com", path: p, method,
      headers: {
        "Authorization": `Bearer ${TOKEN}`,
        "Accept": "application/vnd.github+json",
        "User-Agent": "motor-cms-upload",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(data ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } : {})
      }
    }, res => {
      let d = ""; res.on("data", c => d += c);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, body: d }); }
      });
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

async function getSHA(filePath) {
  const r = await api("GET", `/repos/${OWNER}/${REPO}/contents/${filePath}?ref=${BRANCH}`);
  return r.status === 200 ? r.body.sha : null;
}

async function uploadFile(relPath) {
  const full = path.join(BASE, relPath);
  if (!fs.existsSync(full)) { console.log(`  ⚠️  SKIP (missing): ${relPath}`); return false; }
  const content = fs.readFileSync(full).toString("base64");
  const sha = await getSHA(relPath);
  const res = await api("PUT", `/repos/${OWNER}/${REPO}/contents/${relPath}`, {
    message: `upload: ${relPath}`,
    content, branch: BRANCH,
    ...(sha ? { sha } : {})
  });
  const ok = res.status === 200 || res.status === 201;
  console.log(`  ${ok ? "✅" : "❌"} ${relPath} (${res.status})`);
  if (!ok) console.log(`     ${JSON.stringify(res.body).slice(0, 100)}`);
  return ok;
}

(async () => {
  console.log(`Uploading ${FILES.length} files to github.com/${OWNER}/${REPO}...\n`);
  let ok = 0, fail = 0;
  for (const f of FILES) {
    const success = await uploadFile(f);
    success ? ok++ : fail++;
    await new Promise(r => setTimeout(r, 150)); // rate limit
  }
  console.log(`\n${ok} uploaded, ${fail} failed`);
  if (ok > 0) console.log(`\n✅ Vercel will auto-redeploy → https://vercel.com/dashboard`);
})();
