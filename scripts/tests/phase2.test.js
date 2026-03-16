const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const packageRoot = path.resolve(__dirname, "..", "..");
const scrumJs = path.join(packageRoot, "scripts", "scrum.js");
const initDbJs = path.join(packageRoot, "scripts", "init-db.js");

function tmpDir() {
  return fs.mkdtempSync(path.join(require("node:os").tmpdir(), "phase2-test-"));
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
    return { output: run(command, env), exitCode: 0 };
  } catch (error) {
    return { output: (error.stdout || error.message || "").trim(), exitCode: error.status || 1 };
  }
}

function runScrum(args, dir, dbPath) {
  return JSON.parse(
    run(`node ${scrumJs} ${args}`, {
      SCRUM_WORKSPACE_ROOT: dir,
      SCRUM_DB_PATH: dbPath,
    })
  );
}

function runScrumFail(args, dir, dbPath) {
  return runAllowFail(`node ${scrumJs} ${args}`, {
    SCRUM_WORKSPACE_ROOT: dir,
    SCRUM_DB_PATH: dbPath,
  });
}

function initWorkspace(dir, dbPath) {
  run(`node ${initDbJs}`, { SCRUM_WORKSPACE_ROOT: dir, SCRUM_DB_PATH: dbPath });
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

// --- Design Artifact Creation and Submission ---

describe("Phase 2: Design artifact creation and submission", () => {
  let dir, dbPath;

  before(() => {
    dir = tmpDir();
    dbPath = path.join(dir, "delivery", "scrum.db");
    copySkillFolders(dir);
    initWorkspace(dir, dbPath);
    runScrum('create-product --name "DesignProd" --idea "test" --goal "test"', dir, dbPath);
  });

  after(() => cleanup(dir));

  it("creates a design artifact in draft state", () => {
    const result = runScrum(
      'create-design-artifact --file-path "ui_designs/home.png"',
      dir, dbPath
    );
    assert.equal(result.state, "draft");
    assert.equal(result.status, "created");
  });

  it("submits artifact and moves to pending_review", () => {
    const result = runScrum(
      "submit-design --artifact-id DESIGN-1",
      dir, dbPath
    );
    assert.equal(result.state, "pending_review");
    assert.equal(result.status, "submitted");
  });
});

// --- Design Approval and Freeze ---

describe("Phase 2: Design approval and freeze (CLI path)", () => {
  let dir, dbPath;

  before(() => {
    dir = tmpDir();
    dbPath = path.join(dir, "delivery", "scrum.db");
    copySkillFolders(dir);
    initWorkspace(dir, dbPath);
    runScrum('create-product --name "FreezeProd" --idea "test" --goal "test"', dir, dbPath);
    runScrum('create-design-artifact --file-path "mockup.png"', dir, dbPath);
    runScrum("submit-design --artifact-id DESIGN-1", dir, dbPath);
  });

  after(() => cleanup(dir));

  it("approves via CLI and transitions to approved", () => {
    const result = runScrum(
      'review-design --artifact-id DESIGN-1 --decision approved --reviewer "reviewer-a"',
      dir, dbPath
    );
    assert.equal(result.decision, "approved");
    assert.equal(result.state, "approved");
  });

  it("freezes an approved artifact", () => {
    const result = runScrum(
      'freeze-design --artifact-id DESIGN-1 --freeze-note "Ready for implementation"',
      dir, dbPath
    );
    assert.equal(result.state, "frozen");
    assert.equal(result.revision, 1);
  });

  it("list shows frozen state and reviewer info", () => {
    const artifacts = runScrum("list-design-artifacts", dir, dbPath);
    assert.equal(artifacts.length, 1);
    assert.equal(artifacts[0].state, "frozen");
    assert.equal(artifacts[0].latest_reviewer, "reviewer-a");
    assert.equal(artifacts[0].latest_decision, "approved");
  });
});

// --- Design Approval with Reviewer Session (extension path) ---

describe("Phase 2: Design approval with reviewer session", () => {
  let dir, dbPath;

  before(() => {
    dir = tmpDir();
    dbPath = path.join(dir, "delivery", "scrum.db");
    copySkillFolders(dir);
    initWorkspace(dir, dbPath);
    runScrum('create-product --name "SessionProd" --idea "test" --goal "test"', dir, dbPath);
    runScrum('create-design-artifact --file-path "comp.png"', dir, dbPath);
    runScrum("submit-design --artifact-id DESIGN-1", dir, dbPath);
  });

  after(() => cleanup(dir));

  it("review links to a separate reviewer session", () => {
    // Create a reviewer session (separate from the design-generation session)
    const session = runScrum(
      'start-session --skill review-design --mode design-review',
      dir, dbPath
    );
    const sessionId = session.session_id;

    const result = runScrum(
      `review-design --artifact-id DESIGN-1 --decision approved --reviewer "ext-reviewer" --reviewer-session-id ${sessionId}`,
      dir, dbPath
    );
    assert.equal(result.decision, "approved");

    // Verify the review record has the reviewer session
    const reviews = runScrum("list-design-reviews --artifact-id DESIGN-1", dir, dbPath);
    assert.equal(reviews.length, 1);
    assert.equal(reviews[0].reviewer, "ext-reviewer");
    assert.equal(reviews[0].reviewer_session_id, sessionId);
  });
});

// --- Changes Requested and Iteration ---

describe("Phase 2: Design changes requested and iteration", () => {
  let dir, dbPath;

  before(() => {
    dir = tmpDir();
    dbPath = path.join(dir, "delivery", "scrum.db");
    copySkillFolders(dir);
    initWorkspace(dir, dbPath);
    runScrum('create-product --name "IterProd" --idea "test" --goal "test"', dir, dbPath);
    runScrum('create-design-artifact --file-path "screen.png"', dir, dbPath);
    runScrum("submit-design --artifact-id DESIGN-1", dir, dbPath);
  });

  after(() => cleanup(dir));

  it("request changes moves artifact to changes_requested", () => {
    const result = runScrum(
      'review-design --artifact-id DESIGN-1 --decision changes_requested --reviewer "reviewer-b" --summary "Needs better contrast"',
      dir, dbPath
    );
    assert.equal(result.state, "changes_requested");
  });

  it("can re-submit after changes and get approved", () => {
    // Re-submit
    const submitted = runScrum(
      'submit-design --artifact-id DESIGN-1 --content-hash "abc123"',
      dir, dbPath
    );
    assert.equal(submitted.state, "pending_review");

    // Approve
    const approved = runScrum(
      'review-design --artifact-id DESIGN-1 --decision approved --reviewer "reviewer-b"',
      dir, dbPath
    );
    assert.equal(approved.state, "approved");
  });

  it("review history shows both reviews", () => {
    const reviews = runScrum("list-design-reviews --artifact-id DESIGN-1", dir, dbPath);
    assert.equal(reviews.length, 2);
    // Ordered by created_at DESC — newest first
    assert.equal(reviews[0].decision, "approved");
    assert.equal(reviews[1].decision, "changes_requested");
  });
});

// --- Supersede Frozen Design ---

describe("Phase 2: Supersede frozen design", () => {
  let dir, dbPath;

  before(() => {
    dir = tmpDir();
    dbPath = path.join(dir, "delivery", "scrum.db");
    copySkillFolders(dir);
    initWorkspace(dir, dbPath);
    runScrum('create-product --name "SuperProd" --idea "test" --goal "test"', dir, dbPath);
    runScrum('create-design-artifact --file-path "v1.png"', dir, dbPath);
    runScrum("submit-design --artifact-id DESIGN-1", dir, dbPath);
    runScrum('review-design --artifact-id DESIGN-1 --decision approved --reviewer "r"', dir, dbPath);
    runScrum("freeze-design --artifact-id DESIGN-1", dir, dbPath);
  });

  after(() => cleanup(dir));

  it("supersedes a frozen design and creates a new revision", () => {
    const result = runScrum(
      'supersede-design --artifact-id DESIGN-1 --file-path "v2.png" --notes "Revised layout"',
      dir, dbPath
    );
    assert.equal(result.superseded_id, "DESIGN-1");
    assert.equal(result.new_id, "DESIGN-2");
    assert.equal(result.revision, 2);
    assert.equal(result.state, "draft");
  });

  it("revision history remains visible", () => {
    const artifacts = runScrum("list-design-artifacts", dir, dbPath);
    assert.equal(artifacts.length, 2);

    const superseded = artifacts.find((a) => a.id === "DESIGN-1");
    const current = artifacts.find((a) => a.id === "DESIGN-2");

    assert.equal(superseded.state, "superseded");
    assert.equal(superseded.revision, 1);
    assert.equal(current.state, "draft");
    assert.equal(current.revision, 2);
    assert.equal(current.parent_artifact_id, "DESIGN-1");
  });
});

// --- Design Freeze Gate Blocks start-run ---

describe("Phase 2: Design freeze gate blocks start-run", () => {
  let dir, dbPath;

  before(() => {
    dir = tmpDir();
    dbPath = path.join(dir, "delivery", "scrum.db");
    copySkillFolders(dir);
    initWorkspace(dir, dbPath);
    runScrum('create-product --name "GateProd" --idea "test" --goal "test"', dir, dbPath);
    // Enable design review requirement
    runScrum("set-config --key design_review_required --value 1", dir, dbPath);
    // Create a design artifact that is NOT frozen
    runScrum('create-design-artifact --file-path "gate.png"', dir, dbPath);
  });

  after(() => cleanup(dir));

  it("start-run is blocked when design freeze is required but missing", () => {
    const result = runScrumFail(
      "start-run --agent test-agent",
      dir, dbPath
    );
    assert.ok(result.exitCode !== 0, "should fail");
    assert.ok(
      result.output.includes("Design freeze required"),
      `should mention design freeze: ${result.output}`
    );
  });

  it("start-run is allowed after all artifacts are frozen", () => {
    // Complete the design workflow
    runScrum("submit-design --artifact-id DESIGN-1", dir, dbPath);
    runScrum('review-design --artifact-id DESIGN-1 --decision approved --reviewer "r"', dir, dbPath);
    runScrum("freeze-design --artifact-id DESIGN-1", dir, dbPath);

    // Now start-run should pass the gate (may fail for other reasons like no sprint)
    const result = runScrumFail("start-run --agent test-agent", dir, dbPath);
    // It should NOT mention design freeze — it should fail for a different reason
    assert.ok(
      !result.output.includes("Design freeze required"),
      `should not mention design freeze after freezing: ${result.output}`
    );
  });
});

// --- Design Review Required Config ---

describe("Phase 2: Design review not required by default", () => {
  let dir, dbPath;

  before(() => {
    dir = tmpDir();
    dbPath = path.join(dir, "delivery", "scrum.db");
    copySkillFolders(dir);
    initWorkspace(dir, dbPath);
    runScrum('create-product --name "OptProd" --idea "test" --goal "test"', dir, dbPath);
    // Create unfrozen artifact but do NOT enable design_review_required
    runScrum('create-design-artifact --file-path "opt.png"', dir, dbPath);
  });

  after(() => cleanup(dir));

  it("start-run is not blocked when design_review_required is off", () => {
    const result = runScrumFail("start-run --agent test-agent", dir, dbPath);
    // Should not mention design freeze
    assert.ok(
      !result.output.includes("Design freeze required"),
      "design gate should not block when config is off"
    );
  });
});

// --- State Transition Guards ---

describe("Phase 2: Design state transition guards", () => {
  let dir, dbPath;

  before(() => {
    dir = tmpDir();
    dbPath = path.join(dir, "delivery", "scrum.db");
    copySkillFolders(dir);
    initWorkspace(dir, dbPath);
    runScrum('create-product --name "GuardProd" --idea "test" --goal "test"', dir, dbPath);
    runScrum('create-design-artifact --file-path "guard.png"', dir, dbPath);
  });

  after(() => cleanup(dir));

  it("cannot review a draft artifact (must submit first)", () => {
    const result = runScrumFail(
      'review-design --artifact-id DESIGN-1 --decision approved --reviewer "r"',
      dir, dbPath
    );
    assert.ok(result.exitCode !== 0);
    assert.ok(result.output.includes("pending_review"));
  });

  it("cannot freeze a non-approved artifact", () => {
    runScrum("submit-design --artifact-id DESIGN-1", dir, dbPath);
    const result = runScrumFail("freeze-design --artifact-id DESIGN-1", dir, dbPath);
    assert.ok(result.exitCode !== 0);
    assert.ok(result.output.includes("approved"));
  });

  it("cannot supersede a non-frozen artifact", () => {
    const result = runScrumFail("supersede-design --artifact-id DESIGN-1", dir, dbPath);
    assert.ok(result.exitCode !== 0);
    assert.ok(result.output.includes("frozen"));
  });
});
