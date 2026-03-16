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
//    Use a temp cache outside the backend dir to avoid shipping cache files.
const tmpCache = path.join(require("node:os").tmpdir(), "renn-backend-npm-cache");
console.log("\n  Installing better-sqlite3 in backend/...");
execSync("npm install --omit=dev", {
  cwd: backendDir,
  stdio: "inherit",
  env: { ...process.env, npm_config_cache: tmpCache }
});

// 6. Verify the install actually worked — static check
const bsqlPath = path.join(backendDir, "node_modules", "better-sqlite3", "package.json");
if (!fs.existsSync(bsqlPath)) {
  console.error("\nERROR: better-sqlite3 was not installed in backend/node_modules/.");
  console.error("The packaged extension will not work without it.");
  process.exit(1);
}
console.log("  verified: backend/node_modules/better-sqlite3 exists");

// 7. End-to-end smoke test: copy the backend to a temp dir (simulating
//    a packaged VSIX install) and run init-db.js from there.
//    This proves the backend is fully self-contained and portable.
const os = require("node:os");
const smokeDir = fs.mkdtempSync(path.join(os.tmpdir(), "renn-smoke-"));
const smokeBackend = path.join(smokeDir, "backend");
const smokeWorkspace = path.join(smokeDir, "workspace");

try {
  fs.cpSync(backendDir, smokeBackend, { recursive: true, dereference: true });
  fs.mkdirSync(smokeWorkspace, { recursive: true });

  const initDbJs = path.join(smokeBackend, "scripts", "init-db.js");
  const dbPath = path.join(smokeWorkspace, "delivery", "scrum.db");

  execSync(`node "${initDbJs}"`, {
    cwd: smokeWorkspace,
    env: {
      ...process.env,
      SCRUM_WORKSPACE_ROOT: smokeWorkspace,
      SCRUM_DB_PATH: dbPath
    },
    encoding: "utf8",
    timeout: 15000
  });

  if (!fs.existsSync(dbPath)) {
    console.error("\nERROR: Smoke test failed — init-db.js did not create the database.");
    process.exit(1);
  }

  console.log("  smoke test: backend is portable (init-db.js succeeded from copied location)");
} catch (error) {
  console.error(`\nERROR: Smoke test failed — the bundled backend is not self-contained.`);
  console.error(error.message || error);
  process.exit(1);
} finally {
  fs.rmSync(smokeDir, { recursive: true, force: true });
}

console.log("\nBackend payload ready at extension/backend/");
