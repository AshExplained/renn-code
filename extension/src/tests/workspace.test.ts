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

// The extension sits at <packageRoot>/extension/
// so the packageRoot is one level up from the extension dir.
const extensionDir = path.resolve(__dirname, "..", "..");
const packageRoot = path.resolve(extensionDir, "..");

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ext-test-"));
}

function cleanup(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // best-effort
  }
}

function copySkillFolders(targetRoot: string): void {
  for (const tree of [".agents/skills", ".claude/skills"]) {
    const src = path.join(packageRoot, tree);
    const dst = path.join(targetRoot, tree);
    if (fs.existsSync(src)) {
      fs.cpSync(src, dst, { recursive: true });
    }
  }
}

// --- Package Discovery ---

describe("Extension: findPackageRoot", () => {
  it("finds the package root from the workspace itself", () => {
    const result = findPackageRoot(packageRoot);
    assert.equal(result, packageRoot);
  });

  it("finds the package root via extensionPath for an empty workspace", () => {
    const emptyDir = tmpDir();
    try {
      // With extensionPath — should find it via the extension's own location
      const withExt = findPackageRoot(emptyDir, extensionDir);
      assert.equal(withExt, packageRoot, "should resolve from extensionPath");
    } finally {
      cleanup(emptyDir);
    }
  });

  it("finds the package root via __dirname fallback", () => {
    const emptyDir = tmpDir();
    try {
      // Even without extensionPath, the compiled code resolves via __dirname
      // since the extension output lives inside the package tree.
      const result = findPackageRoot(emptyDir);
      assert.equal(result, packageRoot, "should resolve via __dirname fallback");
    } finally {
      cleanup(emptyDir);
    }
  });
});

// --- Workspace Detection ---

describe("Extension: detectWorkspace", () => {
  it("detects uninitialized workspace", () => {
    const dir = tmpDir();
    try {
      const result = detectWorkspace(dir, extensionDir);
      assert.equal(result.initialized, false);
      assert.equal(result.dbExists, false);
      assert.equal(result.packageRoot, packageRoot);
    } finally {
      cleanup(dir);
    }
  });

  it("detects initialized workspace", () => {
    const dir = tmpDir();
    try {
      copySkillFolders(dir);
      // Initialize via CLI
      const initDbJs = path.join(packageRoot, "scripts", "init-db.js");
      execSync(`node "${initDbJs}"`, {
        cwd: dir,
        env: { ...process.env, SCRUM_WORKSPACE_ROOT: dir },
        encoding: "utf8",
      });
      const result = detectWorkspace(dir, extensionDir);
      assert.equal(result.initialized, true);
      assert.equal(result.dbExists, true);
    } finally {
      cleanup(dir);
    }
  });
});

// --- Initialize Command Wiring ---

describe("Extension: initializeWorkspace", () => {
  it("initializes an empty workspace using the extension's package root", () => {
    const dir = tmpDir();
    try {
      const result = initializeWorkspace(dir, packageRoot);
      assert.ok(result.success, `init should succeed: ${result.output}`);

      // Verify DB was created
      const dbPath = path.join(dir, "delivery", "scrum.db");
      assert.ok(fs.existsSync(dbPath), "scrum.db should exist");

      // Verify detection now sees it as initialized
      const detection = detectWorkspace(dir, extensionDir);
      assert.equal(detection.initialized, true);
    } finally {
      cleanup(dir);
    }
  });

  it("is idempotent — second init does not fail", () => {
    const dir = tmpDir();
    try {
      const result1 = initializeWorkspace(dir, packageRoot);
      assert.ok(result1.success);

      const result2 = initializeWorkspace(dir, packageRoot);
      assert.ok(result2.success, "second init should also succeed");
    } finally {
      cleanup(dir);
    }
  });
});

// --- Repair Command Wiring ---

describe("Extension: repairWorkspace", () => {
  it("repairs a workspace with missing skill folders", () => {
    const dir = tmpDir();
    try {
      // Initialize first
      initializeWorkspace(dir, packageRoot);

      // Break it — delete some skill folders
      const agentsSkills = path.join(dir, ".agents", "skills");
      if (fs.existsSync(path.join(agentsSkills, "run-sprint"))) {
        fs.rmSync(path.join(agentsSkills, "run-sprint"), { recursive: true });
      }

      // Health should show needs_repair
      const healthBefore = getWorkspaceHealth(dir, packageRoot);
      assert.ok(healthBefore, "should get health");
      assert.equal(healthBefore!.status, "needs_repair");

      // Repair
      const result = repairWorkspace(dir, packageRoot);
      assert.ok(result.success, `repair should succeed: ${result.output}`);

      // Health should now be healthy
      const healthAfter = getWorkspaceHealth(dir, packageRoot);
      assert.ok(healthAfter, "should get health after repair");
      assert.equal(healthAfter!.status, "healthy");
    } finally {
      cleanup(dir);
    }
  });
});

// --- Initialized vs Uninitialized State ---

describe("Extension: initialized vs uninitialized state behavior", () => {
  it("getDashboardData returns empty data for uninitialized workspace", () => {
    const dir = tmpDir();
    try {
      // Initialize DB but no product
      initializeWorkspace(dir, packageRoot);
      const data = getDashboardData(dir, packageRoot);
      assert.equal(data.product, null, "no product yet");
      assert.equal(data.health.status, "healthy");
    } finally {
      cleanup(dir);
    }
  });

  it("getDashboardData returns product data for initialized workspace with product", () => {
    const dir = tmpDir();
    try {
      initializeWorkspace(dir, packageRoot);

      // Create a product
      const scrumJs = path.join(packageRoot, "scripts", "scrum.js");
      execSync(
        `node "${scrumJs}" create-product --name "ExtTest" --idea "test" --goal "test"`,
        {
          cwd: dir,
          env: { ...process.env, SCRUM_WORKSPACE_ROOT: dir },
          encoding: "utf8",
        }
      );
      // Re-init to seed workflow_phase
      execSync(`node "${scrumJs}" init-workspace`, {
        cwd: dir,
        env: { ...process.env, SCRUM_WORKSPACE_ROOT: dir },
        encoding: "utf8",
      });

      const data = getDashboardData(dir, packageRoot);
      assert.ok(data.product, "should have product");
      assert.equal(data.product!.name, "ExtTest");
      assert.equal(data.product!.status, "draft");
      assert.ok(data.phase, "should have phase");
      assert.equal(data.phase!.phase, "init");
    } finally {
      cleanup(dir);
    }
  });
});
