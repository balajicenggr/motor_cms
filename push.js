/**
 * Push motor-cms-vercel to GitHub → balajicenggr/motor_cms
 * node push.js
 */
"use strict";
const https = require("https");
const fs    = require("fs");
const path  = require("path");

const OWNER  = "balajicenggr";
const REPO   = "motor_cms";
const BRANCH = "main";
const TOKEN  = "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";
const BASE   = __dirname;

const FILES = [
  ".gitignore", ".env.example",
  "package.json", "next.config.ts", "tailwind.config.ts",
  "tsconfig.json", "postcss.config.js",
  "src/app/globals.css", "src/app/layout.tsx", "src/app/page.tsx",
  "src/lib/supabase.ts", "src/types/index.ts",
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
        "User-Agent": "motor-cms",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(data ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } : {})
      }
    }, res => {
      let d = "";
      res.on("data", c => d += c);
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

async function getOrCreateBranch() {
  // Try to get existing branch
  const r = await api("GET", `/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`);
  if (r.status === 200) return r.body.object?.sha;

  // Repo is empty — create initial tree + commit + ref
  console.log("  Empty repo — bootstrapping...");
  const tree = await api("POST", `/repos/${OWNER}/${REPO}/git/trees`, {
    tree: [{ path: ".gitkeep", mode: "100644", type: "blob", content: "" }]
  });
  if (!tree.body.sha) throw new Error("Tree failed: " + JSON.stringify(tree.body).slice(0,150));

  const commit = await api("POST", `/repos/${OWNER}/${REPO}/git/commits`, {
    message: "init", tree: tree.body.sha, parents: []
  });
  if (!commit.body.sha) throw new Error("Commit failed: " + JSON.stringify(commit.body).slice(0,150));

  const ref = await api("POST", `/repos/${OWNER}/${REPO}/git/refs`, {
    ref: `refs/heads/${BRANCH}`, sha: commit.body.sha
  });
  if (ref.status !== 201) throw new Error("Ref failed: " + JSON.stringify(ref.body).slice(0,150));

  console.log(`  ✅ Branch ${BRANCH} created: ${commit.body.sha.slice(0,7)}`);
  return commit.body.sha;
}

(async () => {
  console.log("═══════════════════════════════════════════════");
  console.log("  Motor CMS → GitHub (Git Data API)");
  console.log(`  ${OWNER}/${REPO} branch:${BRANCH}`);
  console.log("═══════════════════════════════════════════════\n");

  const latestSHA = await getOrCreateBranch();
  console.log(`✅ Base commit: ${latestSHA.slice(0,7)}`);

  // Get base tree SHA
  const commitInfo = await api("GET", `/repos/${OWNER}/${REPO}/git/commits/${latestSHA}`);
  const baseTreeSHA = commitInfo.body.tree.sha;
  console.log(`✅ Base tree:   ${baseTreeSHA.slice(0,7)}\n`);

  // Create blobs
  console.log(`Creating ${FILES.length} blobs...`);
  const treeItems = [];
  for (const relPath of FILES) {
    const full = path.join(BASE, relPath);
    if (!fs.existsSync(full)) { console.log(`  ⚠️  SKIP: ${relPath}`); continue; }
    const blob = await api("POST", `/repos/${OWNER}/${REPO}/git/blobs`, {
      content: fs.readFileSync(full).toString("base64"), encoding: "base64"
    });
    if (!blob.body.sha) { console.log(`  ❌ Blob failed: ${relPath} — ${JSON.stringify(blob.body).slice(0,100)}`); continue; }
    treeItems.push({ path: relPath, mode: "100644", type: "blob", sha: blob.body.sha });
    console.log(`  ✅ ${relPath}`);
    await new Promise(r => setTimeout(r, 80));
  }

  // Create tree
  console.log("\nCreating tree...");
  const newTree = await api("POST", `/repos/${OWNER}/${REPO}/git/trees`, {
    base_tree: baseTreeSHA, tree: treeItems
  });
  if (!newTree.body.sha) { console.error("❌ Tree failed:", JSON.stringify(newTree.body).slice(0,200)); process.exit(1); }
  console.log(`✅ Tree: ${newTree.body.sha.slice(0,7)}`);

  // Create commit
  const newCommit = await api("POST", `/repos/${OWNER}/${REPO}/git/commits`, {
    message: "deploy: Motor CMS Next.js dashboard for Vercel\n\nSupabase Realtime · ISO 10816 thresholds · ML fault detection",
    tree: newTree.body.sha, parents: [latestSHA]
  });
  if (!newCommit.body.sha) { console.error("❌ Commit failed:", JSON.stringify(newCommit.body).slice(0,200)); process.exit(1); }
  console.log(`✅ Commit: ${newCommit.body.sha.slice(0,7)}`);

  // Update ref
  const upd = await api("PATCH", `/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, {
    sha: newCommit.body.sha, force: true
  });
  if (upd.status === 200) {
    console.log(`✅ Branch ${BRANCH} → ${newCommit.body.sha.slice(0,7)}`);
  } else {
    console.error("❌ Ref update failed:", JSON.stringify(upd.body).slice(0,200));
    process.exit(1);
  }

  console.log(`\n═══════════════════════════════════════════════`);
  console.log(`✅ https://github.com/${OWNER}/${REPO}`);
  console.log(`\nVercel deploy:`);
  console.log(`  1. vercel.com/new → import ${OWNER}/${REPO}`);
  console.log(`  2. Framework: Next.js  |  Root Directory: ./  (leave blank)`);
  console.log(`  3. Add env vars:`);
  console.log(`     NEXT_PUBLIC_SUPABASE_URL      = https://xflnuafbijrqhkbiukvk.supabase.co`);
  console.log(`     NEXT_PUBLIC_SUPABASE_ANON_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhmbG51YWZiaWpycWhrYml1a3ZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMjY5MzAsImV4cCI6MjA5MTgwMjkzMH0.fGu60r279DSrgKSNSXmSzh5GUFduKfQieBnVx_i5HwQ`);
  console.log(`  4. Deploy ✅`);
  console.log(`═══════════════════════════════════════════════\n`);
})();
