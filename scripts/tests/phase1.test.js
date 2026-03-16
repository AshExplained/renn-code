const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const packageRoot = path.resolve(__dirname, "..", "..");
const scrumJs = path.join(packageRoot, "scripts", "scrum.js");
const initDbJs = path.join(packageRoot, "scripts", "init-db.js");
const installJs = path.join(packageRoot, "scripts", "install.js");

function tmpDir() {
  return fs.mkdtempSync(path.join(require("node:os").tmpdir(), "phase1-test-"));
}

function cleanup(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // best-effort
  }
}

function run(command, env = {}) {
  return execSync(command, {
    env: { ...process.env, ...env },
    encoding: "utf8",
    timeout: 15000,
  }).trim();
}

function runAllowFail(command, env = {}) {
  try {
    return execSync(command, {
      env: { ...process.env, ...env },
      encoding: "utf8",
      timeout: 15000,
    }).trim();
  } catch (error) {
    return (error.stdout || "").trim();
  }
}

function runScrum(args, workspaceRoot, dbPath) {
  return JSON.parse(
    run(`node ${scrumJs} ${args}`, {
      SCRUM_WORKSPACE_ROOT: workspaceRoot,
      SCRUM_DB_PATH: dbPath,
    })
  );
}

function initWorkspace(dir, dbPath) {
  run(`node ${initDbJs}`, {
    SCRUM_WORKSPACE_ROOT: dir,
    SCRUM_DB_PATH: dbPath,
  });
  return runScrum("init-workspace", dir, dbPath);
}

function copySkillFolders(targetRoot) {
  for (const tree of [".agents/skills", ".claude/skills"]) {
    const src = path.join(packageRoot, tree);
    const dst = path.join(targetRoot, tree);
    if (fs.existsSync(src)) {
      fs.cpSync(src, dst, { recursive: true });
    }
  }
}

// --- Workspace Detection Tests ---

describe("Phase 1: Non-initialized workspace detection", () => {
  let dir;

  before(() => {
    dir = tmpDir();
  });

  after(() => cleanup(dir));

  it("detects an uninitialized workspace (no scrum.db)", () => {
    const dbPath = path.join(dir, "delivery", "scrum.db");
    assert.ok(!fs.existsSync(dbPath), "DB should not exist");

    // Extension would call show-workspace-health which requires an existing DB
    // so it falls back to --check on install.js
    const output = runAllowFail(`node ${installJs} --check`, {
      SCRUM_WORKSPACE_ROOT: dir,
      SCRUM_DB_PATH: dbPath,
    });
    const health = JSON.parse(output);
    assert.equal(health.status, "not_initialized");
  });
});

describe("Phase 1: Initialized workspace detection", () => {
  let dir;
  let dbPath;

  before(() => {
    dir = tmpDir();
    dbPath = path.join(dir, "delivery", "scrum.db");
    copySkillFolders(dir);
    initWorkspace(dir, dbPath);
  });

  after(() => cleanup(dir));

  it("detects an initialized workspace and returns healthy status", () => {
    const health = runScrum("show-workspace-health", dir, dbPath);
    assert.equal(health.status, "healthy");
    assert.ok(health.config.exists, "config should exist");
    assert.ok(health.extension.exists, "extension metadata should exist");
  });
});

// --- One-Click Init Tests ---

describe("Phase 1: One-click initialization from empty workspace", () => {
  let dir;
  let dbPath;

  before(() => {
    dir = tmpDir();
    dbPath = path.join(dir, "delivery", "scrum.db");
    // Copy skill sources so repair can find them
    copySkillFolders(dir);
  });

  after(() => cleanup(dir));

  it("init-workspace creates DB, config, and extension metadata in one step", () => {
    // This simulates what the extension's initialize button does
    run(`node ${initDbJs}`, {
      SCRUM_WORKSPACE_ROOT: dir,
      SCRUM_DB_PATH: dbPath,
    });

    const result = runScrum("init-workspace", dir, dbPath);

    assert.equal(result.status, "initialized");
    assert.equal(result.health.status, "healthy");
    assert.ok(result.health.config.exists, "workspace_config seeded");
    assert.ok(result.health.extension.exists, "extension_install_metadata seeded");
    assert.ok(fs.existsSync(dbPath), "scrum.db created");
  });
});

// --- Detection Persists After Reload ---

describe("Phase 1: Detection persists (simulated reload)", () => {
  let dir;
  let dbPath;

  before(() => {
    dir = tmpDir();
    dbPath = path.join(dir, "delivery", "scrum.db");
    copySkillFolders(dir);
    initWorkspace(dir, dbPath);
  });

  after(() => cleanup(dir));

  it("workspace remains detected on subsequent health checks", () => {
    // First check
    const health1 = runScrum("show-workspace-health", dir, dbPath);
    assert.equal(health1.status, "healthy");

    // Simulated reload — just check again
    const health2 = runScrum("show-workspace-health", dir, dbPath);
    assert.equal(health2.status, "healthy");
    assert.equal(
      health1.database.appliedCount,
      health2.database.appliedCount,
      "migration count should persist"
    );
  });
});

// --- Status View (Mission Control Data) ---

describe("Phase 1: Mission control status for initialized workspace", () => {
  let dir;
  let dbPath;

  before(() => {
    dir = tmpDir();
    dbPath = path.join(dir, "delivery", "scrum.db");
    copySkillFolders(dir);
    initWorkspace(dir, dbPath);
    // Create product so status view has data
    runScrum(
      'create-product --name "StatusTest" --idea "test" --goal "test"',
      dir,
      dbPath
    );
    // Re-run init to seed workflow_phase for the product
    runScrum("init-workspace", dir, dbPath);
  });

  after(() => cleanup(dir));

  it("show-product returns the product for dashboard display", () => {
    const products = runScrum("show-product", dir, dbPath);
    assert.ok(Array.isArray(products), "should return array");
    assert.equal(products.length, 1);
    assert.equal(products[0].name, "StatusTest");
    assert.equal(products[0].status, "draft");
    assert.equal(products[0].next_command, "/plan-epics");
  });

  it("get-phase returns the current workflow phase", () => {
    const phase = runScrum("get-phase", dir, dbPath);
    assert.equal(phase.phase, "init");
  });

  it("get-config returns workspace configuration", () => {
    const config = runScrum("get-config", dir, dbPath);
    assert.equal(config.governance_mode, "standard");
    assert.equal(config.review_granularity, "task");
  });
});

// --- Repair from Extension ---

describe("Phase 1: Repair behavior on partially initialized workspace", () => {
  let dir;
  let dbPath;

  before(() => {
    dir = tmpDir();
    dbPath = path.join(dir, "delivery", "scrum.db");
    copySkillFolders(dir);
    initWorkspace(dir, dbPath);
  });

  after(() => cleanup(dir));

  it("detects and repairs a workspace with missing skill subfolders", () => {
    // Delete some skills to simulate partial state
    const agentsSkills = path.join(dir, ".agents", "skills");
    fs.rmSync(path.join(agentsSkills, "sync-state"), {
      recursive: true,
      force: true,
    });
    fs.rmSync(path.join(agentsSkills, "close-sprint"), {
      recursive: true,
      force: true,
    });

    // Health check should detect the issue
    const health = runScrum("show-workspace-health", dir, dbPath);
    assert.equal(health.status, "needs_repair");
    assert.ok(
      health.issues.some((i) => i.includes("sync-state")),
      "should detect missing sync-state"
    );

    // Repair via install.js --repair (what the extension button calls)
    const env = { SCRUM_WORKSPACE_ROOT: dir, SCRUM_DB_PATH: dbPath };
    const output = runAllowFail(`node ${installJs} --repair`, env);
    const lines = output.split("\n");
    let result;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].trim().startsWith("{")) {
        try {
          result = JSON.parse(lines.slice(i).join("\n"));
          break;
        } catch {
          continue;
        }
      }
    }

    assert.ok(result, "should produce JSON repair result");
    assert.equal(result.health.status, "healthy", "should be healthy after repair");

    // Verify restored
    assert.ok(
      fs.existsSync(path.join(agentsSkills, "sync-state", "SKILL.md")),
      "sync-state should be restored"
    );
    assert.ok(
      fs.existsSync(path.join(agentsSkills, "close-sprint", "SKILL.md")),
      "close-sprint should be restored"
    );
  });
});
