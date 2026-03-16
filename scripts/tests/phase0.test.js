const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const packageRoot = path.resolve(__dirname, "..", "..");
const scrumJs = path.join(packageRoot, "scripts", "scrum.js");
const initDbJs = path.join(packageRoot, "scripts", "init-db.js");
const installJs = path.join(packageRoot, "scripts", "install.js");
const migrationsDir = path.join(packageRoot, "delivery", "migrations");

function tmpDir() {
  return fs.mkdtempSync(path.join(require("node:os").tmpdir(), "phase0-test-"));
}

function run(command, env = {}) {
  const result = execSync(command, {
    env: { ...process.env, ...env },
    encoding: "utf8",
    timeout: 15000
  });
  return result.trim();
}

function runAllowFail(command, env = {}) {
  try {
    return execSync(command, {
      env: { ...process.env, ...env },
      encoding: "utf8",
      timeout: 15000
    }).trim();
  } catch (error) {
    return (error.stdout || "").trim();
  }
}

function runScrum(args, workspaceRoot, dbPath) {
  const env = {
    SCRUM_WORKSPACE_ROOT: workspaceRoot,
    SCRUM_DB_PATH: dbPath
  };
  return JSON.parse(run(`node ${scrumJs} ${args}`, env));
}

function runInitDb(workspaceRoot, dbPath) {
  const env = {
    SCRUM_WORKSPACE_ROOT: workspaceRoot,
    SCRUM_DB_PATH: dbPath
  };
  return run(`node ${initDbJs}`, env);
}

function migrationCount() {
  return fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql")).length;
}

function cleanup(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
}

function copySkillFolders(targetRoot) {
  const sources = [
    { from: path.join(packageRoot, ".agents", "skills"), to: path.join(targetRoot, ".agents", "skills") },
    { from: path.join(packageRoot, ".claude", "skills"), to: path.join(targetRoot, ".claude", "skills") }
  ];
  for (const { from, to } of sources) {
    if (fs.existsSync(from)) {
      fs.cpSync(from, to, { recursive: true });
    }
  }
}

function extractJson(output) {
  // Extract the last JSON object from output that may contain log lines
  const lines = output.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.startsWith("{")) {
      try {
        return JSON.parse(lines.slice(i).join("\n"));
      } catch {
        continue;
      }
    }
  }
  throw new Error(`No JSON found in output: ${output}`);
}

describe("Phase 0: Fresh workspace initialization", () => {
  let dir;
  let dbPath;

  before(() => {
    dir = tmpDir();
    dbPath = path.join(dir, "delivery", "scrum.db");
  });

  after(() => cleanup(dir));

  it("creates the database with all migrations applied", () => {
    const output = runInitDb(dir, dbPath);
    assert.ok(fs.existsSync(dbPath), "scrum.db should exist");
    assert.ok(output.includes("010_design_and_extension_metadata.sql"), "should apply migration 010");

    const expectedCount = migrationCount();
    const Database = require("better-sqlite3");
    const db = new Database(dbPath, { readonly: true });
    const applied = db
      .prepare("SELECT COUNT(1) AS count FROM schema_migrations")
      .get().count;
    db.close();
    assert.equal(applied, expectedCount, `should have ${expectedCount} migrations applied`);
  });
});

describe("Phase 0: Idempotent re-initialization", () => {
  let dir;
  let dbPath;

  before(() => {
    dir = tmpDir();
    dbPath = path.join(dir, "delivery", "scrum.db");
    runInitDb(dir, dbPath);
  });

  after(() => cleanup(dir));

  it("re-init does not error or change migration count", () => {
    const output = runInitDb(dir, dbPath);
    assert.ok(output.includes("Database ready"), "should succeed on re-init");

    const Database = require("better-sqlite3");
    const db = new Database(dbPath, { readonly: true });
    const applied = db
      .prepare("SELECT COUNT(1) AS count FROM schema_migrations")
      .get().count;
    db.close();
    assert.equal(applied, migrationCount());
  });
});

describe("Phase 0: workspace_config seeding", () => {
  let dir;
  let dbPath;

  before(() => {
    dir = tmpDir();
    dbPath = path.join(dir, "delivery", "scrum.db");
    runInitDb(dir, dbPath);
    copySkillFolders(dir);
  });

  after(() => cleanup(dir));

  it("init-workspace seeds default config and is idempotent", () => {
    const result1 = runScrum("init-workspace", dir, dbPath);
    assert.equal(result1.status, "initialized");
    assert.ok(result1.health.config.exists, "config should exist after init");
    assert.equal(result1.health.config.config.governance_mode, "standard");

    // Run again — should not error or duplicate
    const result2 = runScrum("init-workspace", dir, dbPath);
    assert.equal(result2.status, "initialized");
    assert.equal(result2.health.config.config.governance_mode, "standard");
  });
});

describe("Phase 0: workflow_phase coherence", () => {
  let dir;
  let dbPath;

  before(() => {
    dir = tmpDir();
    dbPath = path.join(dir, "delivery", "scrum.db");
    runInitDb(dir, dbPath);
    copySkillFolders(dir);
  });

  after(() => cleanup(dir));

  it("tracks phase transitions with previous_phase", () => {
    // Create a product
    runScrum(
      'create-product --name "PhaseTest" --idea "test" --goal "test"',
      dir,
      dbPath
    );

    // Init workspace to seed workflow_phase
    runScrum("init-workspace", dir, dbPath);

    // Read initial phase
    const phase1 = runScrum("get-phase", dir, dbPath);
    assert.equal(phase1.phase, "init");
    assert.equal(phase1.previous_phase, null);

    // Transition to planning
    runScrum("set-phase --phase planning", dir, dbPath);
    const phase2 = runScrum("get-phase", dir, dbPath);
    assert.equal(phase2.phase, "planning");
    assert.equal(phase2.previous_phase, "init");

    // Transition to building
    runScrum("set-phase --phase building", dir, dbPath);
    const phase3 = runScrum("get-phase", dir, dbPath);
    assert.equal(phase3.phase, "building");
    assert.equal(phase3.previous_phase, "planning");
  });
});

describe("Phase 0: Skill folder creation", () => {
  let dir;

  before(() => {
    dir = tmpDir();
  });

  after(() => cleanup(dir));

  it("creates skill folders in the target workspace", () => {
    const agentsSource = path.join(packageRoot, ".agents", "skills");
    const agentsTarget = path.join(dir, ".agents", "skills");

    fs.mkdirSync(agentsTarget, { recursive: true });
    const entries = fs
      .readdirSync(agentsSource, { withFileTypes: true })
      .filter((e) => e.isDirectory());

    for (const entry of entries) {
      fs.cpSync(
        path.join(agentsSource, entry.name),
        path.join(agentsTarget, entry.name),
        { recursive: true }
      );
    }

    assert.ok(fs.existsSync(agentsTarget), "skill target should exist");
    assert.ok(entries.length > 0, "should have at least one skill folder");

    for (const entry of entries) {
      assert.ok(
        fs.existsSync(path.join(agentsTarget, entry.name)),
        `skill ${entry.name} should exist`
      );
    }
  });
});

describe("Phase 0: Missing skill folder detection", () => {
  let dir;
  let dbPath;

  before(() => {
    dir = tmpDir();
    dbPath = path.join(dir, "delivery", "scrum.db");
    runInitDb(dir, dbPath);
    // Deliberately do NOT copy skill folders
  });

  after(() => cleanup(dir));

  it("health check detects missing skill folders", () => {
    runScrum("init-workspace", dir, dbPath);
    const health = runScrum("show-workspace-health", dir, dbPath);
    assert.equal(health.status, "needs_repair");
    assert.ok(
      health.issues.some((i) => i.includes("Skill folder missing")),
      "should report missing skill folders"
    );
  });
});

describe("Phase 0: Partial skill install detection and repair", () => {
  let dir;
  let dbPath;

  before(() => {
    dir = tmpDir();
    dbPath = path.join(dir, "delivery", "scrum.db");
    runInitDb(dir, dbPath);
    // Install skills but then delete some to simulate partial install
    copySkillFolders(dir);
  });

  after(() => cleanup(dir));

  it("detects missing skill subfolders and incomplete skills", () => {
    const agentsSkills = path.join(dir, ".agents", "skills");

    // Delete one skill folder entirely
    fs.rmSync(path.join(agentsSkills, "run-sprint"), { recursive: true, force: true });

    // Delete SKILL.md from another to make it incomplete
    fs.unlinkSync(path.join(agentsSkills, "plan-sprint", "SKILL.md"));

    runScrum("init-workspace", dir, dbPath);
    const health = runScrum("show-workspace-health", dir, dbPath);

    assert.equal(health.status, "needs_repair");
    assert.ok(
      health.issues.some((i) => i.includes("Skill missing") && i.includes("run-sprint")),
      "should detect missing run-sprint subfolder"
    );
    assert.ok(
      health.issues.some((i) => i.includes("Skill incomplete") && i.includes("plan-sprint")),
      "should detect incomplete plan-sprint (missing SKILL.md)"
    );
  });

  it("repair restores missing and incomplete skill contents", () => {
    const env = {
      SCRUM_WORKSPACE_ROOT: dir,
      SCRUM_DB_PATH: dbPath
    };
    const output = runAllowFail(`node ${installJs} --repair`, env);
    const result = extractJson(output);

    assert.ok(result.repaired, "should report as repaired");
    assert.equal(result.health.status, "healthy", "should be healthy after repair");

    // Verify the previously missing skill folder was restored
    const runSprintDir = path.join(dir, ".agents", "skills", "run-sprint");
    assert.ok(fs.existsSync(runSprintDir), "run-sprint should be restored");
    assert.ok(
      fs.existsSync(path.join(runSprintDir, "SKILL.md")),
      "run-sprint/SKILL.md should exist"
    );

    // Verify the previously incomplete skill was repaired
    const planSprintSkill = path.join(dir, ".agents", "skills", "plan-sprint", "SKILL.md");
    assert.ok(fs.existsSync(planSprintSkill), "plan-sprint/SKILL.md should be restored");
  });
});

describe("Phase 0: Missing DB repair", () => {
  let dir;
  let dbPath;

  before(() => {
    dir = tmpDir();
    dbPath = path.join(dir, "delivery", "scrum.db");
    copySkillFolders(dir);
  });

  after(() => cleanup(dir));

  it("repair creates the database from scratch", () => {
    assert.ok(!fs.existsSync(dbPath), "DB should not exist initially");

    const env = {
      SCRUM_WORKSPACE_ROOT: dir,
      SCRUM_DB_PATH: dbPath
    };
    const output = runAllowFail(`node ${installJs} --repair`, env);
    const result = extractJson(output);

    assert.ok(result.repaired, "should report as repaired");
    assert.ok(fs.existsSync(dbPath), "DB should exist after repair");
    assert.equal(result.health.status, "healthy");
    assert.equal(result.health.database.appliedCount, migrationCount());
  });
});

describe("Phase 0: Health check reporting", () => {
  let healthyDir;
  let healthyDbPath;
  let brokenDir;
  let brokenDbPath;

  before(() => {
    healthyDir = tmpDir();
    healthyDbPath = path.join(healthyDir, "delivery", "scrum.db");
    runInitDb(healthyDir, healthyDbPath);
    copySkillFolders(healthyDir);
    runScrum("init-workspace", healthyDir, healthyDbPath);

    brokenDir = tmpDir();
    brokenDbPath = path.join(brokenDir, "delivery", "scrum.db");
  });

  after(() => {
    cleanup(healthyDir);
    cleanup(brokenDir);
  });

  it("reports healthy for a fully initialized workspace", () => {
    const health = runScrum("show-workspace-health", healthyDir, healthyDbPath);
    assert.equal(health.status, "healthy");
    assert.equal(health.issues.length, 0);
  });

  it("reports not_initialized for a workspace without a DB", () => {
    const env = {
      SCRUM_WORKSPACE_ROOT: brokenDir,
      SCRUM_DB_PATH: brokenDbPath
    };
    const output = runAllowFail(`node ${installJs} --check`, env);
    const health = JSON.parse(output);
    assert.equal(health.status, "not_initialized");
    assert.ok(health.issues.length > 0);
  });
});
