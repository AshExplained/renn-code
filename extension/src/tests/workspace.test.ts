import { describe, it, before, after } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";
import {
  findPackageRoot,
  detectWorkspace,
  initializeWorkspace,
  repairWorkspace,
  getWorkspaceHealth,
  getDashboardData,
} from "../workspace";

/**
 * These tests simulate a PACKAGED extension install — NOT the source tree.
 *
 * They create a temp directory that mimics what VS Code would have after
 * installing the VSIX:
 *
 *   /tmp/fake-vscode-extension/
 *     backend/
 *       scripts/scrum.js, init-db.js, install.js, lib/
 *       delivery/migrations/
 *       .agents/skills/
 *       .claude/skills/
 *       node_modules/better-sqlite3/
 *       package.json
 *
 * findPackageRoot is called with extensionPath = "/tmp/fake-vscode-extension/"
 * and must resolve to "/tmp/fake-vscode-extension/backend/" — proving the
 * packaged extension can operate without the source repo.
 */

// The real backend payload built by prepare-backend.js
const extensionDir = path.resolve(__dirname, "..", "..");
const builtBackend = path.join(extensionDir, "backend");

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ext-pkg-test-"));
}

function cleanup(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // best-effort
  }
}

/**
 * Create a simulated packaged extension install in a temp directory.
 * Copies the prepared backend payload — the same files that would be
 * inside the VSIX after `vsce package`.
 */
function createPackagedExtensionInstall(): string {
  const fakeExtDir = tmpDir();
  const fakeBackend = path.join(fakeExtDir, "backend");
  // dereference: true ensures symlinks are copied as real files,
  // making the copy portable — same as what vsce package does when
  // building the VSIX zip.
  fs.cpSync(builtBackend, fakeBackend, { recursive: true, dereference: true });
  return fakeExtDir;
}

// --- Pre-flight: verify backend was prepared ---

describe("Extension: backend payload exists", () => {
  it("prepare-backend has been run and backend/ is self-contained", () => {
    assert.ok(
      fs.existsSync(path.join(builtBackend, "scripts", "scrum.js")),
      "backend/scripts/scrum.js must exist — run `npm run prepare-backend` first"
    );
    assert.ok(
      fs.existsSync(path.join(builtBackend, "scripts", "init-db.js")),
      "backend/scripts/init-db.js must exist"
    );
    assert.ok(
      fs.existsSync(path.join(builtBackend, "scripts", "install.js")),
      "backend/scripts/install.js must exist"
    );
    assert.ok(
      fs.existsSync(path.join(builtBackend, "scripts", "lib", "scrum-db.js")),
      "backend/scripts/lib/scrum-db.js must exist"
    );
    assert.ok(
      fs.existsSync(path.join(builtBackend, "delivery", "migrations", "001_init.sql")),
      "backend/delivery/migrations/ must exist"
    );
    assert.ok(
      fs.existsSync(path.join(builtBackend, "node_modules", "better-sqlite3", "package.json")),
      "backend/node_modules/better-sqlite3 must exist — run `npm run prepare-backend`"
    );

    // Verify better-sqlite3 can actually be loaded from the backend
    const bsqlMain = require.resolve("better-sqlite3", {
      paths: [path.join(builtBackend, "node_modules")]
    });
    assert.ok(bsqlMain, "better-sqlite3 must be resolvable from backend/node_modules");
  });
});

// --- Package Discovery (packaged layout) ---

describe("Extension: findPackageRoot (packaged layout)", () => {
  let fakeExtDir: string;

  before(() => {
    fakeExtDir = createPackagedExtensionInstall();
  });

  after(() => cleanup(fakeExtDir));

  it("finds backend/ inside a simulated packaged extension install", () => {
    const emptyWorkspace = tmpDir();
    try {
      const result = findPackageRoot(emptyWorkspace, fakeExtDir);
      const expected = path.join(fakeExtDir, "backend");
      assert.equal(result, expected, "should resolve to <extensionPath>/backend/");
    } finally {
      cleanup(emptyWorkspace);
    }
  });

  it("returns null when extensionPath has no backend/", () => {
    const emptyWorkspace = tmpDir();
    const emptyExtDir = tmpDir();
    try {
      const result = findPackageRoot(emptyWorkspace, emptyExtDir);
      assert.equal(result, null, "should return null with no backend/");
    } finally {
      cleanup(emptyWorkspace);
      cleanup(emptyExtDir);
    }
  });

  it("prefers workspace-local scripts over bundled backend", () => {
    // When the workspace IS the harness repo, workspace-local wins
    const repoRoot = path.resolve(extensionDir, "..");
    if (fs.existsSync(path.join(repoRoot, "scripts", "scrum.js"))) {
      const result = findPackageRoot(repoRoot, fakeExtDir);
      assert.equal(result, repoRoot, "workspace-local should take priority");
    }
  });
});

// --- Workspace Detection (packaged layout) ---

describe("Extension: detectWorkspace (packaged layout)", () => {
  let fakeExtDir: string;

  before(() => {
    fakeExtDir = createPackagedExtensionInstall();
  });

  after(() => cleanup(fakeExtDir));

  it("detects uninitialized workspace and still finds the package root", () => {
    const workspace = tmpDir();
    try {
      const result = detectWorkspace(workspace, fakeExtDir);
      assert.equal(result.initialized, false);
      assert.equal(result.dbExists, false);
      assert.ok(result.packageRoot, "should find package root via bundled backend");
      assert.ok(
        result.packageRoot!.endsWith("backend"),
        "package root should be the backend/ dir"
      );
    } finally {
      cleanup(workspace);
    }
  });
});

// --- Initialize from packaged extension ---

describe("Extension: initializeWorkspace (packaged layout)", () => {
  let fakeExtDir: string;

  before(() => {
    fakeExtDir = createPackagedExtensionInstall();
  });

  after(() => cleanup(fakeExtDir));

  it("initializes an empty workspace using the bundled backend", () => {
    const workspace = tmpDir();
    try {
      const packageRoot = path.join(fakeExtDir, "backend");
      const result = initializeWorkspace(workspace, packageRoot);
      assert.ok(result.success, `init should succeed: ${result.output}`);

      const dbPath = path.join(workspace, "delivery", "scrum.db");
      assert.ok(fs.existsSync(dbPath), "scrum.db should exist");

      // Skill folders should be installed in the workspace
      assert.ok(
        fs.existsSync(path.join(workspace, ".agents", "skills", "run-sprint")),
        "skill folders should be installed"
      );
    } finally {
      cleanup(workspace);
    }
  });

  it("is idempotent from the packaged backend", () => {
    const workspace = tmpDir();
    try {
      const packageRoot = path.join(fakeExtDir, "backend");
      const result1 = initializeWorkspace(workspace, packageRoot);
      assert.ok(result1.success);

      const result2 = initializeWorkspace(workspace, packageRoot);
      assert.ok(result2.success, "second init should also succeed");
    } finally {
      cleanup(workspace);
    }
  });
});

// --- Repair from packaged extension ---

describe("Extension: repairWorkspace (packaged layout)", () => {
  let fakeExtDir: string;

  before(() => {
    fakeExtDir = createPackagedExtensionInstall();
  });

  after(() => cleanup(fakeExtDir));

  it("repairs missing skill folders using the bundled backend", () => {
    const workspace = tmpDir();
    try {
      const packageRoot = path.join(fakeExtDir, "backend");
      initializeWorkspace(workspace, packageRoot);

      // Break it — delete a skill folder
      const agentsSkills = path.join(workspace, ".agents", "skills");
      fs.rmSync(path.join(agentsSkills, "run-sprint"), { recursive: true });

      // Health should show needs_repair
      const healthBefore = getWorkspaceHealth(workspace, packageRoot);
      assert.ok(healthBefore);
      assert.equal(healthBefore!.status, "needs_repair");

      // Repair
      const result = repairWorkspace(workspace, packageRoot);
      assert.ok(result.success, `repair should succeed: ${result.output}`);

      // Should be healthy now
      const healthAfter = getWorkspaceHealth(workspace, packageRoot);
      assert.ok(healthAfter);
      assert.equal(healthAfter!.status, "healthy");
    } finally {
      cleanup(workspace);
    }
  });
});

// --- Dashboard data (packaged layout) ---

describe("Extension: getDashboardData (packaged layout)", () => {
  let fakeExtDir: string;

  before(() => {
    fakeExtDir = createPackagedExtensionInstall();
  });

  after(() => cleanup(fakeExtDir));

  it("returns product data from a workspace initialized via bundled backend", () => {
    const workspace = tmpDir();
    try {
      const packageRoot = path.join(fakeExtDir, "backend");
      initializeWorkspace(workspace, packageRoot);

      // Create a product
      const scrumJs = path.join(packageRoot, "scripts", "scrum.js");
      execSync(
        `node "${scrumJs}" create-product --name "PkgTest" --idea "test" --goal "test"`,
        {
          cwd: workspace,
          env: { ...process.env, SCRUM_WORKSPACE_ROOT: workspace },
          encoding: "utf8",
        }
      );
      execSync(`node "${scrumJs}" init-workspace`, {
        cwd: workspace,
        env: { ...process.env, SCRUM_WORKSPACE_ROOT: workspace },
        encoding: "utf8",
      });

      const data = getDashboardData(workspace, packageRoot);
      assert.ok(data.product, "should have product");
      assert.equal(data.product!.name, "PkgTest");
      assert.ok(data.phase, "should have phase");
      assert.equal(data.phase!.phase, "init");
      assert.equal(data.health.status, "healthy");
    } finally {
      cleanup(workspace);
    }
  });
});
