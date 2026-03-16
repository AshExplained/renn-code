#!/usr/bin/env node

/**
 * Prepares the backend payload for the packaged VS Code extension.
 *
 * After packaging (vsce package), the extension lives at a VS Code-managed
 * location like ~/.vscode/extensions/renn-code-0.1.0/ with NO access to the
 * source repo. This script copies the runtime files the extension needs into
 * extension/backend/ so they ship inside the VSIX.
 *
 * The extension's findPackageRoot() resolves <extensionPath>/backend/ as
 * the package root when the workspace-local and node_modules paths don't exist.
 */

const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const extensionDir = path.resolve(__dirname, "..");
const repoRoot = path.resolve(extensionDir, "..");
const backendDir = path.join(extensionDir, "backend");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyDir(src, dst) {
  if (!fs.existsSync(src)) {
    console.log(`  skip (missing): ${src}`);
    return;
  }
  fs.cpSync(src, dst, { recursive: true });
  console.log(`  copied: ${path.relative(extensionDir, dst)}`);
}

function copyFile(src, dst) {
  ensureDir(path.dirname(dst));
  fs.copyFileSync(src, dst);
  console.log(`  copied: ${path.relative(extensionDir, dst)}`);
}

console.log("Preparing backend payload for extension packaging...\n");

// Clean previous backend
if (fs.existsSync(backendDir)) {
  fs.rmSync(backendDir, { recursive: true, force: true });
}
ensureDir(backendDir);

// 1. Copy scripts/
copyDir(
  path.join(repoRoot, "scripts"),
  path.join(backendDir, "scripts")
);

// Remove test files from the backend copy (not needed at runtime)
const testsDir = path.join(backendDir, "scripts", "tests");
if (fs.existsSync(testsDir)) {
  fs.rmSync(testsDir, { recursive: true, force: true });
  console.log("  removed: backend/scripts/tests/");
}

// 2. Copy delivery/migrations/
copyDir(
  path.join(repoRoot, "delivery", "migrations"),
  path.join(backendDir, "delivery", "migrations")
);

// 3. Copy skill folders
copyDir(
  path.join(repoRoot, ".agents", "skills"),
  path.join(backendDir, ".agents", "skills")
);
copyDir(
  path.join(repoRoot, ".claude", "skills"),
  path.join(backendDir, ".claude", "skills")
);

// 4. Create a minimal package.json for the backend
const backendPkg = {
  name: "renn-code-backend",
  version: "0.1.0",
  private: true,
  dependencies: {
    "better-sqlite3": "^12.2.0"
  }
};
const pkgPath = path.join(backendDir, "package.json");
fs.writeFileSync(pkgPath, JSON.stringify(backendPkg, null, 2) + "\n");
console.log("  created: backend/package.json");

// 5. Install better-sqlite3 in the backend dir
console.log("\n  Installing better-sqlite3 in backend/...");
execSync("npm install --omit=dev", {
  cwd: backendDir,
  stdio: "inherit",
  env: { ...process.env, npm_config_cache: path.join(backendDir, ".npm-cache") }
});

console.log("\nBackend payload ready at extension/backend/");
