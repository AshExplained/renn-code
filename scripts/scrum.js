#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const { initDatabase, openDatabase } = require("./lib/scrum-db");
const {
  collectSyncIssues,
  determineNextCommand,
  determinePostCloseNextCommand,
  determineProductStatus,
  evaluateCommandPolicy,
  evaluatePathPolicy,
  evaluateReviewGate,
  evaluateTransitionPolicy,
  getReadyTasks,
  logPolicyEvent,
  selectExecutionMode
} = require("./lib/policy");
const { fullHealthCheck } = require("./lib/health");

const WORKSPACE_ROOT = process.env.SCRUM_WORKSPACE_ROOT || process.cwd();

const GUARDRAIL_RULES = [
  {
    code: "query_select_only",
    description: "Ad hoc queries must be read-only SELECT or WITH statements."
  },
  {
    code: "single_active_sprint",
    description: "Only one sprint can be active at a time."
  },
  {
    code: "task_done_requires_evidence",
    description: "Tasks cannot be marked done without evidence."
  },
  {
    code: "review_requires_in_review_task",
    description: "Only tasks already in_review can be approved or sent back with changes."
  },
  {
    code: "approved_review_requires_support",
    description:
      "Approved reviews require evidence and either an artifact or an explicit acceptance note."
  },
  {
    code: "one_open_fix_per_source_task",
    description: "The system reuses an existing open fix task instead of spawning duplicates."
  },
  {
    code: "destructive_command_blocklist",
    description: "High-risk shell commands such as sudo, rm -rf, and force pushes are denied."
  },
  {
    code: "protected_path_policy",
    description: "Protected paths such as .git, .env, and non-approved external locations are denied."
  },
  {
    code: "blocked_tasks_need_reason",
    description: "Blocked tasks should have an unresolved blocker record."
  },
  {
    code: "in_progress_tasks_need_agent",
    description: "In-progress tasks must have an assigned agent."
  },
  {
    code: "lease_reservation_required",
    description: "Task leases prevent concurrent runs from claiming the same task."
  }
];

const COMMAND_HELP = {
  general: [
    "Usage: ai-scrum <command> [options]",
    "",
    "Common commands:",
    "  create-product      Create the top-level product record",
    "  add-roadmap-theme   Add a roadmap theme to the latest or selected product",
    "  add-mvp-item        Add an MVP bucket item",
    "  create-epic         Create an epic",
    "  create-sprint       Create a sprint",
    "  create-story        Create a story",
    "  create-task         Create a task",
    "  add-sprint-criterion Add a sprint entry/exit criterion",
    "  set-sprint-criterion Mark a sprint criterion met or unmet",
    "  start-run           Lease tasks for execution",
    "  accept-story        Record human acceptance for a story",
    "  approve-task        Approve a task review with a simpler command",
    "  request-task-changes Request changes with a simpler review command",
    "  review-task         Approve or request changes for a submitted task",
    "  close-sprint        Close the active sprint and write a report",
    "  sync-state          Inspect or repair drift",
    "  init-workspace      Bootstrap or verify the workspace runtime",
    "  show-workspace-health  Show workspace health report",
    "  get-config          Read workspace configuration",
    "  set-config          Update workspace configuration",
    "  get-phase           Read workflow phase for a product",
    "  set-phase           Transition workflow phase for a product",
    "",
    "Run `ai-scrum help <command>` or `ai-scrum <command> --help` for command-specific help."
  ].join("\n"),
  "add-roadmap-theme": [
    "Usage: ai-scrum add-roadmap-theme --theme <text> [--product-id <id>]",
    "",
    "Aliases:",
    "  --title <text>      Accepted as an alias for --theme"
  ].join("\n"),
  "add-mvp-item": [
    "Usage: ai-scrum add-mvp-item --bucket <bucket> --item <text> [--product-id <id>]",
    "",
    "Allowed bucket values:",
    "  must_have",
    "  should_have_later",
    "  future",
    "",
    "Friendly aliases accepted:",
    "  must-have, must, should-have, should-have-later, later, future"
  ].join("\n"),
  "create-product": [
    "Usage: ai-scrum create-product --name <name> --idea <plain english idea> --goal <product goal>"
  ].join("\n"),
  "create-epic": [
    "Usage: ai-scrum create-epic --product-id <id> --title <title> [--summary <text>] [--priority high|medium|low] [--mvp-bucket <bucket>]",
    "",
    "Aliases:",
    "  --productId <id>    Accepted as an alias for --product-id",
    "  --mvpBucket <text>  Accepted as an alias for --mvp-bucket",
    "",
    "If --summary is omitted, the title is reused as the summary."
  ].join("\n"),
  "update-epic": [
    "Usage: ai-scrum update-epic --id <id> [--title <title>] [--summary <text>] [--status <status>] [--priority <priority>] [--mvp-bucket <bucket>] [--notes <text>]"
  ].join("\n"),
  "add-epic-dependency": [
    "Usage: ai-scrum add-epic-dependency --epic-id <id> --depends-on <id>",
    "",
    "Aliases:",
    "  --epicId <id>       Accepted as an alias for --epic-id",
    "  --dependsOn <id>    Accepted as an alias for --depends-on"
  ].join("\n"),
  "create-sprint": [
    "Usage: ai-scrum create-sprint --name <name> [--goal <text>] [--activate] [--epic <id> ...]",
    "",
    "If --goal is omitted, the sprint name is reused as the goal."
  ].join("\n"),
  "create-story": [
    "Usage: ai-scrum create-story --sprint-id <id> --epic-id <id> --title <title> [--summary <text>] [--criterion <text> ...] [--requires-human-acceptance]",
    "",
    "Aliases:",
    "  --sprintId <id>     Accepted as an alias for --sprint-id",
    "  --epicId <id>       Accepted as an alias for --epic-id",
    "  --desc <text>       Accepted as an alias for --summary",
    "",
    "If --summary is omitted, the title is reused as the summary."
  ].join("\n"),
  "create-task": [
    "Usage: ai-scrum create-task --story-id <id> --title <title> [--summary <text>] [--priority <priority>] [--parallel-safe] [--agent-hint <text>] [--file <path> ...] [--test <text> ...]",
    "",
    "Aliases:",
    "  --storyId <id>      Accepted as an alias for --story-id",
    "  --agentHint <text>  Accepted as an alias for --agent-hint",
    "  --desc <text>       Accepted as an alias for --summary",
    "",
    "If --summary is omitted, the title is reused as the summary."
  ].join("\n"),
  "start-run": [
    "Usage: ai-scrum start-run --agent <name> [--mode auto|solo|parallel|coordinated] [--limit <n>] [--product-id <id>]"
  ].join("\n"),
  "review-task": [
    "Usage: ai-scrum review-task --task-id <id> --decision approved|changes_requested [--reviewer <name>] [--summary <text>] [--acceptance-note <text>] [--finding severity:text]"
  ].join("\n"),
  "approve-task": [
    "Usage: ai-scrum approve-task --task-id <id> [--reviewer <name>] [--acceptance-note <text>]"
  ].join("\n"),
  "request-task-changes": [
    "Usage: ai-scrum request-task-changes --task-id <id> --summary <text> [--reviewer <name>] [--finding severity:text]"
  ].join("\n"),
  "accept-story": [
    "Usage: ai-scrum accept-story --story-id <id> --accepted-by <name> --acceptance-note <text>"
  ].join("\n"),
  "add-sprint-criterion": [
    "Usage: ai-scrum add-sprint-criterion --sprint-id <id> --kind entry|exit --criterion <text>"
  ].join("\n"),
  "set-sprint-criterion": [
    "Usage: ai-scrum set-sprint-criterion --criterion-id <id> --met true|false"
  ].join("\n"),
  "close-sprint": [
    "Usage: ai-scrum close-sprint --sprint-id <id> --closed-by <name> [--summary <text>]"
  ].join("\n"),
  "init-workspace": [
    "Usage: ai-scrum init-workspace [--product-id <id>]",
    "",
    "Bootstrap or verify the workspace runtime. Idempotent.",
    "Creates the database, seeds workspace_config defaults, and returns a health report."
  ].join("\n"),
  "show-workspace-health": [
    "Usage: ai-scrum show-workspace-health",
    "",
    "Returns a read-only health report for the workspace."
  ].join("\n"),
  "get-config": [
    "Usage: ai-scrum get-config [--key <key>]",
    "",
    "Read workspace configuration. If --key is provided, returns only that value."
  ].join("\n"),
  "set-config": [
    "Usage: ai-scrum set-config --key <key> --value <value>",
    "",
    "Update a workspace configuration value.",
    "Keys: project_type, planning_horizon, governance_mode, review_granularity, cli_path, model_preferences, execution_defaults"
  ].join("\n"),
  "get-phase": [
    "Usage: ai-scrum get-phase [--product-id <id>]",
    "",
    "Read the current workflow phase for a product."
  ].join("\n"),
  "set-phase": [
    "Usage: ai-scrum set-phase --phase <phase> [--product-id <id>]",
    "",
    "Transition the workflow phase for a product.",
    "Phases: init, research, spec, design, planning, building, review, closeout, feedback, resume, complete"
  ].join("\n"),
  "create-design-artifact": [
    "Usage: ai-scrum create-design-artifact --file-path <path> [--product-id <id>] [--artifact-type <type>] [--content-hash <hash>] [--notes <text>] [--linked-story-id <id>] [--linked-sprint-id <id>]",
    "",
    "Create a design artifact in draft state."
  ].join("\n"),
  "submit-design": [
    "Usage: ai-scrum submit-design --artifact-id <id> [--content-hash <hash>]",
    "",
    "Submit a draft or changes_requested design artifact for review (moves to pending_review)."
  ].join("\n"),
  "review-design": [
    "Usage: ai-scrum review-design --artifact-id <id> --decision approved|changes_requested|skip_design [--reviewer <name>] [--reviewer-session-id <id>] [--summary <text>]",
    "",
    "Review a pending design artifact. The reviewer should be different from the designer."
  ].join("\n"),
  "freeze-design": [
    "Usage: ai-scrum freeze-design --artifact-id <id> [--freeze-note <text>]",
    "",
    "Freeze an approved design artifact, locking it as the implementation reference."
  ].join("\n"),
  "supersede-design": [
    "Usage: ai-scrum supersede-design --artifact-id <id> [--file-path <path>] [--content-hash <hash>] [--notes <text>]",
    "",
    "Supersede a frozen design with a new draft revision. The old design moves to superseded."
  ].join("\n"),
  "list-design-artifacts": [
    "Usage: ai-scrum list-design-artifacts [--product-id <id>] [--state <state>]",
    "",
    "List design artifacts, optionally filtered by state."
  ].join("\n"),
  "list-design-reviews": [
    "Usage: ai-scrum list-design-reviews --artifact-id <id>",
    "",
    "List all reviews for a design artifact."
  ].join("\n")
};

function die(message) {
  throw new Error(message);
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function printHelp(command = "general") {
  const text = COMMAND_HELP[command] || COMMAND_HELP.general;
  process.stdout.write(`${text}\n`);
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeBucket(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  const aliases = {
    must: "must_have",
    must_have: "must_have",
    should: "should_have_later",
    should_have: "should_have_later",
    should_have_later: "should_have_later",
    later: "should_have_later",
    future: "future"
  };

  return aliases[normalized] || value;
}

function parseOptions(argv, definitions = {}) {
  const options = {};
  const positionals = [];
  const normalizedDefinitions = { ...definitions };

  for (const [token, definition] of Object.entries(definitions)) {
    for (const alias of definition.aliases || []) {
      normalizedDefinitions[alias] = definition;
    }
  }

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      if (token === "-h") {
        options.help = true;
        continue;
      }
      positionals.push(token);
      continue;
    }

    if (token === "--help") {
      options.help = true;
      continue;
    }

    const definition = normalizedDefinitions[token];
    if (!definition) {
      die(`Unknown option: ${token}`);
    }

    if (definition.type === "flag") {
      options[definition.key] = true;
      continue;
    }

    const value = argv[index + 1];
    if (value === undefined) {
      die(`${token} requires a value`);
    }

    index += 1;
    if (definition.multiple) {
      if (!options[definition.key]) {
        options[definition.key] = [];
      }
      options[definition.key].push(value);
    } else {
      options[definition.key] = value;
    }
  }

  return { options, positionals };
}

function requireFields(options, ...fields) {
  for (const field of fields) {
    if (!options[field]) {
      die(`${field} is required`);
    }
  }
}

function getTableName(table) {
  const allowed = new Set([
    "assumptions",
    "audit_log",
    "bugs",
    "decisions",
    "design_artifacts",
    "design_reviews",
    "epic_dependencies",
    "epics",
    "extension_install_metadata",
    "feedback",
    "master_board",
    "mvp_buckets",
    "open_questions",
    "policy_events",
    "roadmap_themes",
    "session_log",
    "sprints",
    "sprint_closures",
    "stories",
    "task_leases",
    "task_failures",
    "task_reviews",
    "tasks",
    "workflow_phase",
    "workspace_config"
  ]);

  if (!allowed.has(table)) {
    die(`Unsupported table: ${table}`);
  }

  return table;
}

function latestProductId(db) {
  const row = db
    .prepare("SELECT id FROM master_board ORDER BY created_at DESC LIMIT 1")
    .get();
  return row ? row.id : "";
}

function resolveProductId(db, value) {
  const productId = value || latestProductId(db);
  if (!productId) {
    die("No product found");
  }
  return productId;
}

function recordExists(db, table, id) {
  const tableName = getTableName(table);
  const row = db.prepare(`SELECT 1 AS found FROM ${tableName} WHERE id = ?`).get(id);
  return Boolean(row);
}

function nextId(db, prefix, table) {
  const tableName = getTableName(table);
  const row = db
    .prepare(
      `SELECT IFNULL(MAX(CAST(SUBSTR(id, INSTR(id, '-') + 1) AS INTEGER)), 0) + 1 AS next_id
       FROM ${tableName}
       WHERE id GLOB ?`
    )
    .get(`${prefix}-*`);
  return `${prefix}-${row.next_id}`;
}

function validateLink(db, spec) {
  const [type, linkedId] = spec.split(":");
  const tableMap = {
    bug: "bugs",
    epic: "epics",
    feedback: "feedback",
    sprint: "sprints",
    story: "stories",
    task: "tasks"
  };

  if (!type || !linkedId) {
    die(`Invalid link spec: ${spec}`);
  }

  const table = tableMap[type];
  if (!table) {
    die(`Unsupported link type: ${type}`);
  }

  if (!recordExists(db, table, linkedId)) {
    die(`Linked ${type} ${linkedId} does not exist`);
  }

  return { type, linkedId };
}

function insertAudit(db, tableName, recordId, fieldChanged, oldValue, newValue, changedBy) {
  db.prepare(
    `INSERT INTO audit_log (table_name, record_id, field_changed, old_value, new_value, changed_by)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(tableName, recordId, fieldChanged, oldValue, newValue, changedBy);
}

function enforcePolicy(db, policyEvent) {
  const logged = logPolicyEvent(db, policyEvent);
  if (logged.decision === "deny") {
    die(logged.reason);
  }
  return logged;
}

function allowedGlobalSkillPaths() {
  const home = process.env.HOME || process.env.USERPROFILE || "";
  if (!home) {
    return [];
  }

  return [
    path.join(home, ".claude", "skills"),
    path.join(home, ".codex", "skills"),
    path.join(home, ".gemini", "skills")
  ];
}

function sessionRecord(db, sessionId) {
  return db
    .prepare(
      `SELECT id, skill_used, mode, started_at, ended_at, status, summary, next_steps
       FROM session_log
       WHERE id = ?`
    )
    .get(sessionId);
}

function startSessionInternal(db, skillUsed, mode = "") {
  const result = db
    .prepare(
      `INSERT INTO session_log (skill_used, mode, status)
       VALUES (?, ?, 'open')`
    )
    .run(skillUsed, mode || null);
  return Number(result.lastInsertRowid);
}

function normalizeSessionItem(spec) {
  const [itemType, itemId] = String(spec || "").split(":");
  const allowedTypes = new Set([
    "product",
    "epic",
    "sprint",
    "story",
    "task",
    "bug",
    "feedback",
    "decision",
    "failure",
    "review"
  ]);

  if (!itemType || !itemId) {
    die(`Invalid --item value: ${spec}`);
  }
  if (!allowedTypes.has(itemType)) {
    die(`Unsupported session item type: ${itemType}`);
  }

  return { itemType, itemId };
}

function finishSessionInternal(db, sessionId, summary, nextSteps, items = [], status = "completed") {
  const session = sessionRecord(db, sessionId);
  if (!session) {
    die(`Session ${sessionId} does not exist`);
  }

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE session_log
       SET summary = ?, next_steps = ?, status = ?, ended_at = CASE WHEN ? = 'open' THEN NULL ELSE datetime('now') END
       WHERE id = ?`
    ).run(summary, nextSteps, status, status, sessionId);

    db.prepare("DELETE FROM session_log_items WHERE session_id = ?").run(sessionId);
    for (const spec of items) {
      const item = normalizeSessionItem(spec);
      db.prepare(
        `INSERT INTO session_log_items (session_id, item_type, item_id)
         VALUES (?, ?, ?)`
      ).run(sessionId, item.itemType, item.itemId);
    }
  });
  tx();

  return sessionRecord(db, sessionId);
}

function resumeSessionInternal(db, filters = {}) {
  const { skill = "", latest = false } = filters;
  let query = `
    SELECT id, skill_used, mode, started_at, ended_at, status, summary, next_steps
    FROM session_log
  `;
  const params = [];
  if (skill) {
    query += " WHERE skill_used = ? ";
    params.push(skill);
  }
  query += latest
    ? " ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END, started_at DESC LIMIT 1"
    : " ORDER BY started_at DESC LIMIT 10";

  const rows = db.prepare(query).all(...params);
  if (latest) {
    if (!rows[0]) {
      return null;
    }
    const items = db
      .prepare(
        `SELECT item_type, item_id
         FROM session_log_items
         WHERE session_id = ?
         ORDER BY id`
      )
      .all(rows[0].id);
    return { ...rows[0], items };
  }

  return rows.map((row) => ({
    ...row,
    items: db
      .prepare(
        `SELECT item_type, item_id
         FROM session_log_items
         WHERE session_id = ?
         ORDER BY id`
      )
      .all(row.id)
  }));
}

function releaseLeasesInternal(db, sessionId) {
  return db.prepare("DELETE FROM task_leases WHERE session_id = ?").run(sessionId).changes;
}

function activeLeaseForTask(db, taskId) {
  return db
    .prepare(
      `SELECT task_id, session_id, lease_owner, mode, leased_at, expires_at
       FROM task_leases
       WHERE task_id = ?
         AND datetime(expires_at) > datetime('now')`
    )
    .get(taskId);
}

function writeCloseoutReport(sprint, closure, carriedStories, carriedTasks) {
  const reportsDir = path.join(WORKSPACE_ROOT, "planning", "reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, `sprint-${sprint.id}-closeout.md`);

  const lines = [
    `# Sprint Closeout: ${sprint.name}`,
    "",
    `- Sprint ID: \`${sprint.id}\``,
    `- Goal: ${sprint.goal || "Not recorded"}`,
    `- Closed by: ${closure.closed_by}`,
    `- Closed at: ${closure.created_at}`,
    `- Completed stories: ${closure.completed_story_count}`,
    `- Completed tasks: ${closure.completed_task_count}`,
    `- Carry-forward stories: ${closure.carry_forward_story_count}`,
    `- Carry-forward tasks: ${closure.carry_forward_task_count}`,
    ""
  ];

  if (closure.summary) {
    lines.push("## Summary", "", closure.summary, "");
  }

  lines.push("## Carry Forward");
  if (carriedStories.length === 0 && carriedTasks.length === 0) {
    lines.push("", "No unfinished work was carried forward.", "");
  } else {
    lines.push("");
    for (const story of carriedStories) {
      lines.push(`- Story ${story.id}: ${story.reason}`);
    }
    for (const task of carriedTasks) {
      lines.push(`- Task ${task.id}: ${task.reason}`);
    }
    lines.push("");
  }

  fs.writeFileSync(reportPath, `${lines.join("\n")}\n`, "utf8");
  return reportPath;
}

function leaseTasksForRun(db, productId, sessionId, agent, mode, limit) {
  const readyTasks = getReadyTasks(db, productId, Math.max(limit, 10));
  const recommendation = mode === "auto" ? selectExecutionMode(readyTasks) : null;
  const selectedMode = mode === "auto" ? recommendation.mode : mode;

  if (selectedMode === "idle") {
    return { mode: "idle", leasedTasks: [], reason: recommendation.reason };
  }

  let targetLimit = limit;
  if (!targetLimit) {
    if (selectedMode === "solo") {
      targetLimit = 1;
    } else {
      targetLimit = 3;
    }
  }

  let candidates = readyTasks;
  if (selectedMode === "solo") {
    candidates = readyTasks.slice(0, 1);
  } else if (selectedMode === "parallel") {
    candidates = readyTasks.filter((task) => task.parallel_safe === 1).slice(0, targetLimit);
  } else {
    candidates = readyTasks.slice(0, targetLimit);
  }

  if (candidates.length === 0) {
    return {
      mode: "idle",
      leasedTasks: [],
      reason: `No tasks matched the requested ${selectedMode} execution mode.`
    };
  }

  const leasedTasks = [];
  for (const task of candidates) {
    db.prepare(
      `INSERT OR REPLACE INTO task_leases (
          task_id, session_id, lease_owner, mode, leased_at, expires_at
       ) VALUES (?, ?, ?, ?, datetime('now'), datetime('now', '+30 minutes'))`
    ).run(task.id, sessionId, agent, selectedMode);
    leasedTasks.push(task);
  }

  return {
    mode: selectedMode,
    leasedTasks,
    reason: recommendation ? recommendation.reason : `Mode ${selectedMode} was requested explicitly.`
  };
}

function validateTransition(entity, oldStatus, newStatus) {
  if (oldStatus === newStatus) {
    return true;
  }

  const allowed = new Set([
    "epic:candidate:planned",
    "epic:planned:in_progress",
    "epic:in_progress:done",
    "story:ready:in_progress",
    "story:in_progress:blocked",
    "story:in_progress:in_review",
    "story:blocked:in_progress",
    "story:in_review:in_progress",
    "story:in_review:accepted",
    "story:accepted:done",
    "bug:backlog:planned",
    "bug:planned:in_progress",
    "bug:in_progress:in_review",
    "bug:in_review:done",
    "bug:in_review:wont_fix"
  ]);

  return allowed.has(`${entity}:${oldStatus}:${newStatus}`);
}

function addSingleValue(db, table, column, productId, value) {
  if (!recordExists(db, "master_board", productId)) {
    die(`Product ${productId} does not exist`);
  }

  db.prepare(`INSERT INTO ${table} (product_id, ${column}) VALUES (?, ?)`).run(productId, value);
  insertAudit(db, table, productId, "create", "", value, "orchestrator");
  printJson({
    table,
    product_id: productId,
    value,
    status: "created"
  });
}

function currentTask(db, taskId) {
  return db
    .prepare(
      `SELECT id, title, summary, parent_story_id, status, priority, parallel_safe, agent_hint,
              assigned_agent, evidence, kind, source_task_id, failure_id
       FROM tasks
       WHERE id = ?`
    )
    .get(taskId);
}

function maybeAdvanceStory(db, storyId) {
  const counts = db
    .prepare(
      `SELECT
          SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done_count,
          SUM(CASE WHEN status != 'done' THEN 1 ELSE 0 END) AS open_count
       FROM tasks
       WHERE parent_story_id = ?`
    )
    .get(storyId);

  if (counts && counts.open_count === 0 && counts.done_count > 0) {
    const story = db
      .prepare(
        `SELECT requires_human_acceptance, accepted_at
         FROM stories
         WHERE id = ?`
      )
      .get(storyId);
    const unmetCriteria = db
      .prepare(
        `SELECT COUNT(1) AS count
         FROM story_acceptance_criteria
         WHERE story_id = ? AND met = 0`
      )
      .get(storyId).count;
    const needsAcceptance =
      (story && story.requires_human_acceptance === 1 && !story.accepted_at) || unmetCriteria > 0;
    const nextStatus = needsAcceptance ? "in_review" : "accepted";
    db.prepare(
      `UPDATE stories
       SET status = ?, updated_at = datetime('now')
       WHERE id = ? AND status != ?`
    ).run(nextStatus, storyId, nextStatus);
  }
}

function syncEpicStatuses(db, productId) {
  const epicRows = db
    .prepare(
      `SELECT
          e.id,
          e.status,
          COUNT(s.id) AS story_count,
          SUM(CASE WHEN s.status IN ('in_progress','blocked','in_review') THEN 1 ELSE 0 END) AS active_count,
          SUM(CASE WHEN s.status IN ('accepted','done') THEN 1 ELSE 0 END) AS accepted_done_count
       FROM epics e
       LEFT JOIN stories s ON s.parent_epic_id = e.id
       WHERE e.product_id = ?
       GROUP BY e.id, e.status
       ORDER BY e.id`
    )
    .all(productId);

  const changes = [];
  for (const row of epicRows) {
    let derivedStatus = "candidate";
    if (row.story_count > 0) {
      if (row.accepted_done_count === row.story_count) {
        derivedStatus = "done";
      } else if (row.active_count > 0 || row.accepted_done_count > 0) {
        derivedStatus = "in_progress";
      } else {
        derivedStatus = "planned";
      }
    }

    if (row.status !== derivedStatus) {
      db.prepare(
        `UPDATE epics
         SET status = ?, updated_at = datetime('now')
         WHERE id = ?`
      ).run(derivedStatus, row.id);
      insertAudit(db, "epics", row.id, "status", row.status, derivedStatus, "orchestrator");
      changes.push({ id: row.id, from: row.status, to: derivedStatus });
    }
  }

  return changes;
}

function syncProductLifecycle(db, productId, overrides = {}) {
  const nextCommand = overrides.nextCommand || determineNextCommand(db, productId);
  const status = overrides.status || determineProductStatus(db, productId);
  db.prepare(
    `UPDATE master_board
     SET status = ?, next_command = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(status, nextCommand, productId);

  return { status, nextCommand };
}

function findOpenFixTask(db, sourceTaskId) {
  return db
    .prepare(
      `SELECT id
       FROM tasks
       WHERE source_task_id = ?
         AND kind = 'fix'
         AND status != 'done'
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .get(sourceTaskId);
}

function createFixTaskForFailure(db, sourceTask, failureId, summary, priorityOverride = "") {
  const existing = findOpenFixTask(db, sourceTask.id);
  if (existing) {
    return { fixTaskId: existing.id, reused: true };
  }

  const fixTaskId = nextId(db, "TASK", "tasks");
  const title = `Fix: ${sourceTask.title}`;
  const priority = priorityOverride || sourceTask.priority || "high";

  db.prepare(
    `INSERT INTO tasks (
        id, title, summary, parent_story_id, status, priority, parallel_safe,
        agent_hint, kind, source_task_id, failure_id
     ) VALUES (?, ?, ?, ?, 'ready', ?, 0, ?, 'fix', ?, ?)`
  ).run(
    fixTaskId,
    title,
    summary,
    sourceTask.parent_story_id,
    priority,
    sourceTask.agent_hint || "fix",
    sourceTask.id,
    failureId
  );

  insertAudit(db, "tasks", fixTaskId, "create", "", title, "orchestrator");
  return { fixTaskId, reused: false };
}

function recordTaskFailureInternal(
  db,
  {
    taskId,
    source,
    summary,
    evidence = "",
    priority = "",
    blockSourceTask = false,
    blockerDescription = "",
    changedBy = "orchestrator"
  }
) {
  const sourceTask = currentTask(db, taskId);
  if (!sourceTask) {
    die(`Task ${taskId} does not exist`);
  }

  const failureId = nextId(db, "FAIL", "task_failures");
  db.prepare(
    `INSERT INTO task_failures (id, task_id, source, summary, evidence)
     VALUES (?, ?, ?, ?, ?)`
  ).run(failureId, taskId, source, summary, evidence || null);

  const { fixTaskId, reused } = createFixTaskForFailure(db, sourceTask, failureId, summary, priority);

  db.prepare("UPDATE task_failures SET fix_task_id = ? WHERE id = ?").run(fixTaskId, failureId);
  if (!reused) {
    db.prepare("UPDATE tasks SET failure_id = ? WHERE id = ?").run(failureId, fixTaskId);
  }

  if (blockSourceTask && sourceTask.status !== "done") {
    db.prepare(
      `UPDATE tasks
       SET status = 'blocked', updated_at = datetime('now')
       WHERE id = ?`
    ).run(taskId);

    const description = blockerDescription || summary;
    db.prepare(
      `INSERT INTO task_blockers (task_id, description)
       VALUES (?, ?)`
    ).run(taskId, description);
    insertAudit(db, "tasks", taskId, "status", sourceTask.status, "blocked", changedBy);
  }

  insertAudit(db, "task_failures", failureId, "create", "", summary, changedBy);
  return { failureId, fixTaskId, reusedFixTask: reused };
}

function resolveLinkedFailureIfNeeded(db, taskId) {
  const task = currentTask(db, taskId);
  if (!task || !task.failure_id) {
    return;
  }

  db.prepare(
    `UPDATE task_failures
     SET status = 'resolved', resolved_at = datetime('now'), fix_task_id = ?
     WHERE id = ?`
  ).run(taskId, task.failure_id);
}

function resolveSourceTaskAfterFix(db, task) {
  if (!task || task.kind !== "fix" || !task.source_task_id) {
    return;
  }

  const sourceTask = currentTask(db, task.source_task_id);
  if (!sourceTask) {
    return;
  }

  db.prepare(
    `UPDATE tasks
     SET status = 'done', updated_at = datetime('now')
     WHERE id = ?`
  ).run(sourceTask.id);

  db.prepare(
    `UPDATE task_blockers
     SET resolved = 1
     WHERE task_id = ? AND resolved = 0`
  ).run(sourceTask.id);

  db.prepare(
    `UPDATE task_failures
     SET status = 'resolved', resolved_at = datetime('now')
     WHERE task_id = ? AND status = 'open'`
  ).run(sourceTask.id);

  insertAudit(db, "tasks", sourceTask.id, "status", sourceTask.status, "done", "reviewer");
}

function showProduct(db, argv) {
  const { options, positionals } = parseOptions(argv, {
    "--id": { key: "id", type: "value" }
  });
  const id = options.id || positionals[0] || latestProductId(db);
  if (!id) {
    die("No product found");
  }
  const rows = db.prepare("SELECT * FROM master_board WHERE id = ?").all(id);
  printJson(rows);
}

function policyCheck(db, argv) {
  const { options } = parseOptions(argv, {
    "--allow-path": { key: "allowPaths", multiple: true, type: "value" },
    "--decision": { key: "decision", type: "value" },
    "--entity": { key: "entity", type: "value" },
    "--kind": { key: "kind", type: "value" },
    "--source-task-id": { key: "sourceTaskId", type: "value" },
    "--sprint-id": { key: "sprintId", type: "value" },
    "--target": { key: "target", type: "value" },
    "--task-id": { key: "taskId", type: "value" },
    "--to-status": { key: "toStatus", type: "value" }
  });
  requireFields(options, "kind");

  let event;
  if (options.kind === "command") {
    requireFields(options, "target");
    event = evaluateCommandPolicy(options.target);
  } else if (options.kind === "path") {
    requireFields(options, "target");
    event = evaluatePathPolicy(options.target, {
      repoRoot: WORKSPACE_ROOT,
      allowedExternalPaths: [...allowedGlobalSkillPaths(), ...(options.allowPaths || [])]
    });
  } else if (options.kind === "transition") {
    event = evaluateTransitionPolicy(db, {
      entity: options.entity || "task",
      target: options.target,
      toStatus: options.toStatus || options.decision,
      taskId: options.taskId || "",
      sourceTaskId: options.sourceTaskId || "",
      sprintId: options.sprintId || ""
    });
  } else if (options.kind === "review_gate") {
    event = evaluateReviewGate(db, {
      taskId: options.taskId || options.target,
      decision: options.decision || "approved",
      acceptanceNote: options.target
    });
  } else {
    die(`Unsupported policy kind: ${options.kind}`);
  }

  logPolicyEvent(db, event);
  printJson(event);
}

function query(db, argv) {
  const { options } = parseOptions(argv, {
    "--sql": { key: "sql", type: "value" }
  });
  requireFields(options, "sql");
  if (!/^\s*(select|with)\b/i.test(options.sql)) {
    die("query only supports read-only SELECT or WITH statements");
  }
  const rows = db.prepare(options.sql).all();
  printJson(rows);
}

function listEpics(db, argv) {
  const { options, positionals } = parseOptions(argv, {
    "--product-id": { key: "productId", type: "value" }
  });
  const productId = resolveProductId(db, options.productId || positionals[0]);
  const rows = db
    .prepare(
      `SELECT * FROM epics
       WHERE product_id = ?
       ORDER BY CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
                created_at`
    )
    .all(productId);
  printJson(rows);
}

function showActiveSprint(db, argv) {
  const { options, positionals } = parseOptions(argv, {
    "--product-id": { key: "productId", type: "value" }
  });
  const productId = resolveProductId(db, options.productId || positionals[0]);
  const row = db
    .prepare("SELECT active_sprint_id FROM master_board WHERE id = ? LIMIT 1")
    .get(productId);
  if (!row || !row.active_sprint_id) {
    die("No active sprint set");
  }
  const sprintRows = db.prepare("SELECT * FROM sprints WHERE id = ?").all(row.active_sprint_id);
  printJson(sprintRows);
}

function listReadyTasks(db, argv) {
  const { options, positionals } = parseOptions(argv, {
    "--limit": { key: "limit", type: "value" },
    "--product-id": { key: "productId", type: "value" }
  });
  const productId = resolveProductId(db, options.productId || positionals[0]);
  const limit = Number(options.limit || 10);
  const rows = getReadyTasks(db, productId, limit);
  printJson(rows);
}

function listReviewTasks(db, argv) {
  const { options, positionals } = parseOptions(argv, {
    "--product-id": { key: "productId", type: "value" }
  });
  const productId = resolveProductId(db, options.productId || positionals[0]);
  const rows = db
    .prepare(
      `SELECT t.id, t.title, t.summary, t.priority, t.assigned_agent, t.evidence,
              s.id AS story_id, s.title AS story_title
       FROM tasks t
       JOIN stories s ON s.id = t.parent_story_id
       JOIN master_board mb ON mb.active_sprint_id = s.sprint_id
       WHERE mb.id = ? AND t.status = 'in_review'
       ORDER BY CASE t.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, t.id`
    )
    .all(productId);
  printJson(rows);
}

function listReviewStories(db, argv) {
  const { options, positionals } = parseOptions(argv, {
    "--product-id": { key: "productId", type: "value" }
  });
  const productId = resolveProductId(db, options.productId || positionals[0]);
  const rows = db
    .prepare(
      `SELECT s.id, s.title, s.summary, s.acceptance_note, s.accepted_by, s.accepted_at,
              s.requires_human_acceptance, e.id AS epic_id, e.title AS epic_title
       FROM stories s
       JOIN epics e ON e.id = s.parent_epic_id
       JOIN master_board mb ON mb.active_sprint_id = s.sprint_id
       WHERE mb.id = ?
         AND s.status = 'in_review'
       ORDER BY s.id`
    )
    .all(productId);
  printJson(rows);
}

function selectRunMode(db, argv) {
  const { options, positionals } = parseOptions(argv, {
    "--limit": { key: "limit", type: "value" },
    "--product-id": { key: "productId", type: "value" }
  });
  const productId = resolveProductId(db, options.productId || positionals[0]);
  const limit = Number(options.limit || 10);
  const readyTasks = getReadyTasks(db, productId, limit);
  const recommendation = selectExecutionMode(readyTasks);
  printJson({
    product_id: productId,
    ready_count: readyTasks.length,
    ...recommendation
  });
}

function startSession(db, argv) {
  const { options } = parseOptions(argv, {
    "--mode": { key: "mode", type: "value" },
    "--skill": { key: "skill", type: "value" }
  });
  requireFields(options, "skill");

  const sessionId = startSessionInternal(db, options.skill, options.mode || "");
  printJson({ session_id: sessionId, skill: options.skill, mode: options.mode || null, status: "open" });
}

function finishSession(db, argv) {
  const { options } = parseOptions(argv, {
    "--item": { key: "items", multiple: true, type: "value" },
    "--next-steps": { key: "nextSteps", type: "value" },
    "--session-id": { key: "sessionId", type: "value" },
    "--status": { key: "status", type: "value" },
    "--summary": { key: "summary", type: "value" }
  });
  requireFields(options, "sessionId", "summary", "nextSteps");

  const session = finishSessionInternal(
    db,
    Number(options.sessionId),
    options.summary,
    options.nextSteps,
    options.items || [],
    options.status || "completed"
  );
  printJson(session);
}

function resumeSession(db, argv) {
  const { options } = parseOptions(argv, {
    "--latest": { key: "latest", type: "flag" },
    "--skill": { key: "skill", type: "value" }
  });

  const result = resumeSessionInternal(db, {
    skill: options.skill || "",
    latest: Boolean(options.latest)
  });
  printJson(result || {});
}

function startRun(db, argv) {
  const { options } = parseOptions(argv, {
    "--agent": { key: "agent", type: "value" },
    "--limit": { key: "limit", type: "value" },
    "--mode": { key: "mode", type: "value" },
    "--product-id": { key: "productId", type: "value" }
  });
  if (options.help) {
    printHelp("start-run");
    return;
  }
  requireFields(options, "agent");

  const productId = resolveProductId(db, options.productId);

  // Design-freeze gate: block sprint execution when design review is required
  // but unfrozen artifacts exist.
  const designGate = checkDesignFreezeGate(db, productId);
  if (!designGate.passed) {
    die(designGate.reason);
  }

  const requestedMode = options.mode || "auto";
  if (!["auto", "solo", "parallel", "coordinated"].includes(requestedMode)) {
    die("start-run mode must be auto, solo, parallel, or coordinated");
  }
  const sessionId = startSessionInternal(db, "run-sprint", requestedMode === "auto" ? "" : requestedMode);

  const tx = db.transaction(() => {
    const result = leaseTasksForRun(
      db,
      productId,
      sessionId,
      options.agent,
      requestedMode,
      Number(options.limit || 0)
    );

    if (result.mode === "idle") {
      finishSessionInternal(
        db,
        sessionId,
        "No runnable tasks were leased.",
        "Run /plan-sprint, /review-sprint, or /close-sprint based on the next command.",
        [],
        "completed"
      );
      return {
        session_id: sessionId,
        mode: "idle",
        reason: result.reason,
        leased_tasks: []
      };
    }

    db.prepare("UPDATE session_log SET mode = ? WHERE id = ?").run(result.mode, sessionId);
    const items = result.leasedTasks.map((task) => `task:${task.id}`);
    finishSessionInternal(
      db,
      sessionId,
      `Leased ${result.leasedTasks.length} task(s) for ${result.mode} execution.`,
      "Execute the leased tasks, then finish the run.",
      items,
      "open"
    );

    return {
      session_id: sessionId,
      mode: result.mode,
      reason: result.reason,
      leased_tasks: result.leasedTasks
    };
  });

  printJson(tx());
}

function finishRun(db, argv) {
  const { options } = parseOptions(argv, {
    "--item": { key: "items", multiple: true, type: "value" },
    "--session-id": { key: "sessionId", type: "value" },
    "--summary": { key: "summary", type: "value" }
  });
  requireFields(options, "sessionId", "summary");

  const session = sessionRecord(db, Number(options.sessionId));
  if (!session) {
    die(`Session ${options.sessionId} does not exist`);
  }

  const leasedTasks = db
    .prepare(
      `SELECT task_id
       FROM task_leases
       WHERE session_id = ?
       ORDER BY task_id`
    )
    .all(Number(options.sessionId))
    .map((row) => `task:${row.task_id}`);

  const items = [...new Set([...(options.items || []), ...leasedTasks])];
  const tx = db.transaction(() => {
    const releasedCount = releaseLeasesInternal(db, Number(options.sessionId));
    const finished = finishSessionInternal(
      db,
      Number(options.sessionId),
      options.summary,
      "Review submitted work, continue the sprint, or sync state if interrupted.",
      items,
      "completed"
    );
    const productId = latestProductId(db);
    if (productId) {
      syncProductLifecycle(db, productId);
    }
    return { releasedCount, session: finished };
  });

  const result = tx();
  printJson({
    session_id: Number(options.sessionId),
    released_leases: result.releasedCount,
    status: result.session.status
  });
}

function releaseLeases(db, argv) {
  const { options } = parseOptions(argv, {
    "--session-id": { key: "sessionId", type: "value" }
  });
  requireFields(options, "sessionId");
  const released = releaseLeasesInternal(db, Number(options.sessionId));
  printJson({ session_id: Number(options.sessionId), released_leases: released });
}

function guardrailReport(db, argv) {
  const { options, positionals } = parseOptions(argv, {
    "--product-id": { key: "productId", type: "value" }
  });
  const productId = resolveProductId(db, options.productId || positionals[0]);
  const sync = collectSyncIssues(db, productId);
  const recentPolicyEvents = db
    .prepare(
      `SELECT id, kind, target, decision, reason, created_at
       FROM policy_events
       ORDER BY created_at DESC, id DESC
       LIMIT 20`
    )
    .all();
  printJson({
    product_id: productId,
    rules: GUARDRAIL_RULES,
    active_issues: sync.issues,
    latest_session: sync.latestSession,
    policy_events: recentPolicyEvents,
    recommended_next_command: sync.recommendedNextCommand
  });
}

function syncState(db, argv) {
  const { options, positionals } = parseOptions(argv, {
    "--product-id": { key: "productId", type: "value" },
    "--repair": { key: "repair", type: "flag" }
  });
  const productId = resolveProductId(db, options.productId || positionals[0]);
  const sync = collectSyncIssues(db, productId);
  const repairs = [];

  if (options.repair) {
    const tx = db.transaction(() => {
      const expiredLeases = db
        .prepare(
          `SELECT task_id, session_id, lease_owner
           FROM task_leases
           WHERE datetime(expires_at) <= datetime('now')`
        )
        .all();
      for (const row of expiredLeases) {
        db.prepare("DELETE FROM task_leases WHERE task_id = ?").run(row.task_id);
        const task = currentTask(db, row.task_id);
        if (
          task &&
          task.status === "in_progress" &&
          (!task.evidence || !String(task.evidence).trim()) &&
          (!task.assigned_agent || task.assigned_agent === row.lease_owner)
        ) {
          db.prepare(
            `UPDATE tasks
             SET status = 'ready', assigned_agent = NULL, updated_at = datetime('now')
             WHERE id = ?`
          ).run(row.task_id);
          repairs.push(
            `Released expired lease on ${row.task_id} and reset the task to ready.`
          );
        } else {
          repairs.push(`Released expired lease on ${row.task_id}.`);
        }
      }

      const orphanInProgress = db
        .prepare(
          `SELECT id
           FROM tasks
           WHERE status = 'in_progress' AND (assigned_agent IS NULL OR assigned_agent = '')`
        )
        .all();
      for (const row of orphanInProgress) {
        db.prepare(
          `UPDATE tasks
           SET status = 'ready', updated_at = datetime('now')
           WHERE id = ?`
        ).run(row.id);
        repairs.push(`Reset ${row.id} from in_progress to ready because it had no assigned agent.`);
      }

      const staleAssignments = db
        .prepare(
          `SELECT id
           FROM tasks
           WHERE status = 'ready' AND assigned_agent IS NOT NULL AND assigned_agent != ''`
        )
        .all();
      for (const row of staleAssignments) {
        db.prepare(
          `UPDATE tasks
           SET assigned_agent = NULL, updated_at = datetime('now')
           WHERE id = ?`
        ).run(row.id);
        repairs.push(`Cleared stale assignment on ${row.id}.`);
      }

      const blockedWithoutReason = db
        .prepare(
          `SELECT t.id
           FROM tasks t
           LEFT JOIN task_blockers b ON b.task_id = t.id AND b.resolved = 0
           WHERE t.status = 'blocked'
           GROUP BY t.id
           HAVING COUNT(b.id) = 0`
        )
        .all();
      for (const row of blockedWithoutReason) {
        db.prepare(
          `UPDATE tasks
           SET status = 'ready', updated_at = datetime('now')
           WHERE id = ?`
        ).run(row.id);
        repairs.push(`Reopened ${row.id} because it had no unresolved blocker record.`);
      }

      const failuresWithoutFix = db
        .prepare(
          `SELECT id, task_id, summary
           FROM task_failures
           WHERE status = 'open' AND (fix_task_id IS NULL OR fix_task_id = '')`
        )
        .all();
      for (const row of failuresWithoutFix) {
        const sourceTask = currentTask(db, row.task_id);
        if (!sourceTask) {
          continue;
        }
        const { fixTaskId, reused } = createFixTaskForFailure(db, sourceTask, row.id, row.summary);
        db.prepare("UPDATE task_failures SET fix_task_id = ? WHERE id = ?").run(fixTaskId, row.id);
        repairs.push(
          reused
            ? `Linked failure ${row.id} to existing fix task ${fixTaskId}.`
            : `Created fix task ${fixTaskId} for failure ${row.id}.`
        );
      }

      const nextCommand = determineNextCommand(db, productId);
      if (nextCommand) {
        syncEpicStatuses(db, productId);
        syncProductLifecycle(db, productId, { nextCommand });
        repairs.push(`Set next_command to ${nextCommand}.`);
      }

      const staleOpenSessions = db
        .prepare(
          `SELECT sl.id
           FROM session_log sl
           LEFT JOIN task_leases tl ON tl.session_id = sl.id AND datetime(tl.expires_at) > datetime('now')
           WHERE sl.status = 'open'
           GROUP BY sl.id
           HAVING COUNT(tl.task_id) = 0`
        )
        .all();
      for (const row of staleOpenSessions) {
        db.prepare(
          `UPDATE session_log
           SET status = 'abandoned', ended_at = COALESCE(ended_at, datetime('now'))
           WHERE id = ?`
        ).run(row.id);
        repairs.push(`Marked open session ${row.id} as abandoned because it had no live leases.`);
      }
    });
    tx();
  }

  const postSync = collectSyncIssues(db, productId);
  printJson({
    product_id: productId,
    repaired: Boolean(options.repair),
    repairs,
    issues: postSync.issues,
    latest_session: postSync.latestSession,
    recommended_next_command: postSync.recommendedNextCommand
  });
}

function createProduct(db, argv) {
  const { options } = parseOptions(argv, {
    "--goal": { key: "goal", type: "value" },
    "--idea": { key: "idea", type: "value" },
    "--name": { key: "name", type: "value" }
  });
  if (options.help) {
    printHelp("create-product");
    return;
  }
  requireFields(options, "name", "idea", "goal");

  const base = slugify(options.name) || "product";
  let id = `proj-${base}`;
  if (recordExists(db, "master_board", id)) {
    let index = 2;
    while (recordExists(db, "master_board", `${id}-${index}`)) {
      index += 1;
    }
    id = `${id}-${index}`;
  }

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO master_board (id, name, status, plain_english_idea, product_goal, next_command)
       VALUES (?, ?, 'draft', ?, ?, '/plan-epics')`
    ).run(id, options.name, options.idea, options.goal);
  });
  tx();
  insertAudit(db, "master_board", id, "create", "", "product created", "orchestrator");
  printJson({ id, status: "created" });
}

function updateProduct(db, argv) {
  const { options } = parseOptions(argv, {
    "--active-sprint": { key: "activeSprint", type: "value" },
    "--goal": { key: "goal", type: "value" },
    "--id": { key: "id", type: "value" },
    "--name": { key: "name", type: "value" },
    "--next-command": { key: "nextCommand", type: "value" },
    "--notes": { key: "notes", type: "value" },
    "--status": { key: "status", type: "value" }
  });

  const id = resolveProductId(db, options.id);
  if (!recordExists(db, "master_board", id)) {
    die(`Product ${id} does not exist`);
  }

  const sets = [];
  const params = { id };
  if (options.name) {
    sets.push("name = @name");
    params.name = options.name;
  }
  if (options.goal) {
    sets.push("product_goal = @goal");
    params.goal = options.goal;
  }
  if (options.status) {
    sets.push("status = @status");
    params.status = options.status;
  }
  if (options.activeSprint) {
    sets.push("active_sprint_id = @activeSprint");
    params.activeSprint = options.activeSprint;
  }
  if (options.nextCommand) {
    sets.push("next_command = @nextCommand");
    params.nextCommand = options.nextCommand;
  }
  if (options.notes) {
    sets.push("notes = @notes");
    params.notes = options.notes;
  }

  if (sets.length === 0) {
    die("No fields provided");
  }

  sets.push("updated_at = datetime('now')");
  db.prepare(`UPDATE master_board SET ${sets.join(", ")} WHERE id = @id`).run(params);
  insertAudit(db, "master_board", id, "update", "", "product updated", "orchestrator");
  printJson({ id, status: "updated" });
}

function addRoadmapTheme(db, argv) {
  const { options } = parseOptions(argv, {
    "--product-id": { key: "productId", type: "value" },
    "--theme": { key: "theme", type: "value", aliases: ["--title"] }
  });
  if (options.help) {
    printHelp("add-roadmap-theme");
    return;
  }
  const productId = resolveProductId(db, options.productId);
  if (!options.theme) {
    die("add-roadmap-theme requires --theme and a product");
  }
  addSingleValue(db, "roadmap_themes", "theme", productId, options.theme);
}

function addAssumption(db, argv) {
  const { options } = parseOptions(argv, {
    "--assumption": { key: "assumption", type: "value" },
    "--product-id": { key: "productId", type: "value" }
  });
  if (options.help) {
    printHelp("general");
    return;
  }
  const productId = resolveProductId(db, options.productId);
  if (!options.assumption) {
    die("add-assumption requires --assumption and a product");
  }
  addSingleValue(db, "assumptions", "assumption", productId, options.assumption);
}

function addOpenQuestion(db, argv) {
  const { options } = parseOptions(argv, {
    "--product-id": { key: "productId", type: "value" },
    "--question": { key: "question", type: "value" }
  });
  if (options.help) {
    printHelp("general");
    return;
  }
  const productId = resolveProductId(db, options.productId);
  if (!options.question) {
    die("add-open-question requires --question and a product");
  }
  addSingleValue(db, "open_questions", "question", productId, options.question);
}

function addMvpItem(db, argv) {
  const { options } = parseOptions(argv, {
    "--bucket": { key: "bucket", type: "value" },
    "--item": { key: "item", type: "value" },
    "--product-id": { key: "productId", type: "value" }
  });
  if (options.help) {
    printHelp("add-mvp-item");
    return;
  }
  requireFields(options, "bucket", "item");
  const productId = resolveProductId(db, options.productId);
  if (!recordExists(db, "master_board", productId)) {
    die(`Product ${productId} does not exist`);
  }
  const bucket = normalizeBucket(options.bucket);
  db.prepare("INSERT INTO mvp_buckets (product_id, bucket, item) VALUES (?, ?, ?)").run(
    productId,
    bucket,
    options.item
  );
  insertAudit(
    db,
    "mvp_buckets",
    productId,
    "create",
    "",
    `${bucket}:${options.item}`,
    "orchestrator"
  );
  printJson({ product_id: productId, bucket, item: options.item, status: "created" });
}

function createEpic(db, argv) {
  const { options } = parseOptions(argv, {
    "--mvp-bucket": { key: "mvpBucket", type: "value", aliases: ["--mvpBucket"] },
    "--priority": { key: "priority", type: "value" },
    "--product-id": { key: "productId", type: "value", aliases: ["--productId"] },
    "--summary": { key: "summary", type: "value" },
    "--title": { key: "title", type: "value" }
  });
  if (options.help) {
    printHelp("create-epic");
    return;
  }
  requireFields(options, "productId", "title");

  const id = nextId(db, "EPIC", "epics");
  const summary = options.summary || options.title;
  db.prepare(
    `INSERT INTO epics (id, product_id, title, summary, mvp_bucket, priority)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    options.productId,
    options.title,
    summary,
    options.mvpBucket || null,
    options.priority || "medium"
  );
  db.prepare(
    `UPDATE master_board
     SET status = CASE WHEN status = 'draft' THEN 'planning' ELSE status END,
         updated_at = datetime('now')
     WHERE id = ?`
  ).run(options.productId);
  insertAudit(db, "epics", id, "create", "", options.title, "orchestrator");
  printJson({ id, status: "created" });
}

function updateEpic(db, argv) {
  const { options } = parseOptions(argv, {
    "--id": { key: "id", type: "value" },
    "--mvp-bucket": { key: "mvpBucket", type: "value", aliases: ["--mvpBucket"] },
    "--notes": { key: "notes", type: "value" },
    "--priority": { key: "priority", type: "value" },
    "--status": { key: "status", type: "value" },
    "--summary": { key: "summary", type: "value" },
    "--title": { key: "title", type: "value" }
  });
  if (options.help) {
    printHelp("update-epic");
    return;
  }
  if (!options.id) {
    die("update-epic requires --id");
  }
  if (!recordExists(db, "epics", options.id)) {
    die(`Epic ${options.id} does not exist`);
  }

  const oldRow = db.prepare("SELECT status FROM epics WHERE id = ?").get(options.id);
  if (options.status && !validateTransition("epic", oldRow.status, options.status)) {
    die(`Invalid epic status transition: ${oldRow.status} -> ${options.status}`);
  }

  const sets = [];
  const params = { id: options.id };
  if (options.title) {
    sets.push("title = @title");
    params.title = options.title;
  }
  if (options.summary) {
    sets.push("summary = @summary");
    params.summary = options.summary;
  }
  if (options.status) {
    sets.push("status = @status");
    params.status = options.status;
  }
  if (options.priority) {
    sets.push("priority = @priority");
    params.priority = options.priority;
  }
  if (options.notes) {
    sets.push("notes = @notes");
    params.notes = options.notes;
  }
  if (options.mvpBucket) {
    sets.push("mvp_bucket = @mvpBucket");
    params.mvpBucket = options.mvpBucket;
  }

  if (sets.length === 0) {
    die("No fields provided");
  }

  sets.push("updated_at = datetime('now')");
  db.prepare(`UPDATE epics SET ${sets.join(", ")} WHERE id = @id`).run(params);
  insertAudit(
    db,
    "epics",
    options.id,
    "update",
    oldRow.status,
    options.status || "epic updated",
    "orchestrator"
  );
  printJson({ id: options.id, status: "updated" });
}

function addEpicDependency(db, argv) {
  const { options } = parseOptions(argv, {
    "--depends-on": { key: "dependsOn", type: "value", aliases: ["--dependsOn"] },
    "--epic-id": { key: "epicId", type: "value", aliases: ["--epicId"] }
  });
  if (options.help) {
    printHelp("add-epic-dependency");
    return;
  }
  requireFields(options, "epicId", "dependsOn");
  if (options.epicId === options.dependsOn) {
    die("Epic cannot depend on itself");
  }
  const reverse = db
    .prepare(
      `SELECT COUNT(1) AS count
       FROM epic_dependencies
       WHERE epic_id = ? AND depends_on_id = ?`
    )
    .get(options.dependsOn, options.epicId);
  if (reverse.count !== 0) {
    die("Single-hop circular dependency detected");
  }
  db.prepare(
    `INSERT OR IGNORE INTO epic_dependencies (epic_id, depends_on_id)
     VALUES (?, ?)`
  ).run(options.epicId, options.dependsOn);
  insertAudit(db, "epic_dependencies", options.epicId, "create", "", options.dependsOn, "orchestrator");
  printJson({ epic_id: options.epicId, depends_on_id: options.dependsOn, status: "created" });
}

function activateSprintInternal(db, sprintId) {
  const activeRow = db
    .prepare("SELECT COUNT(1) AS count FROM sprints WHERE status = 'active' AND id != ?")
    .get(sprintId);
  if (activeRow.count !== 0) {
    die("Another sprint is already active");
  }

  const productId = latestProductId(db);
  if (!productId) {
    die("No product found");
  }

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE sprints
       SET status = 'active', start_date = datetime('now'), updated_at = datetime('now')
       WHERE id = ?`
    ).run(sprintId);

    db.prepare(
      `UPDATE master_board
       SET active_sprint_id = ?, status = 'in_progress', next_command = '/run-sprint', updated_at = datetime('now')
       WHERE id = ?`
    ).run(sprintId, productId);
  });
  tx();
  insertAudit(db, "sprints", sprintId, "status", "planned", "active", "orchestrator");
}

function createSprint(db, argv) {
  const { options } = parseOptions(argv, {
    "--activate": { key: "activate", type: "flag" },
    "--epic": { key: "epics", multiple: true, type: "value" },
    "--goal": { key: "goal", type: "value" },
    "--name": { key: "name", type: "value" }
  });
  if (options.help) {
    printHelp("create-sprint");
    return;
  }
  requireFields(options, "name");

  const goal = options.goal || options.name;

  const id = nextId(db, "SPRINT", "sprints");
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO sprints (id, name, goal) VALUES (?, ?, ?)").run(
      id,
      options.name,
      goal
    );

    for (const epicId of options.epics || []) {
      db.prepare(
        "INSERT OR IGNORE INTO sprint_epics (sprint_id, epic_id) VALUES (?, ?)"
      ).run(id, epicId);
    }
  });
  tx();

  let finalStatus = "created";
  if (options.activate) {
    activateSprintInternal(db, id);
    finalStatus = "active";
  }
  insertAudit(db, "sprints", id, "create", "", options.name, "orchestrator");
  printJson({ id, status: finalStatus });
}

function activateSprint(db, argv) {
  const { options } = parseOptions(argv, {
    "--sprint-id": { key: "sprintId", type: "value" }
  });
  requireFields(options, "sprintId");
  activateSprintInternal(db, options.sprintId);
  printJson({ id: options.sprintId, status: "active" });
}

function completeSprint(db, argv) {
  const { options } = parseOptions(argv, {
    "--force": { key: "force", type: "flag" },
    "--reason": { key: "reason", type: "value" },
    "--sprint-id": { key: "sprintId", type: "value" }
  });
  requireFields(options, "sprintId");

  if (!options.force) {
    const pending = db
      .prepare(
        `SELECT COUNT(1) AS count
         FROM stories
         WHERE sprint_id = ? AND status NOT IN ('accepted', 'done')`
      )
      .get(options.sprintId);
    if (pending.count !== 0) {
      die("Stories remain open; use --force with --reason if needed");
    }
  }

  db.prepare(
    `UPDATE sprints
     SET status = 'completed', end_date = datetime('now'), updated_at = datetime('now')
     WHERE id = ?`
  ).run(options.sprintId);

  if (options.reason) {
    insertAudit(db, "sprints", options.sprintId, "force_complete", "", options.reason, "orchestrator");
  }
  printJson({ id: options.sprintId, status: "completed" });
}

function closeSprint(db, argv) {
  const { options } = parseOptions(argv, {
    "--closed-by": { key: "closedBy", type: "value" },
    "--sprint-id": { key: "sprintId", type: "value" },
    "--summary": { key: "summary", type: "value" }
  });
  if (options.help) {
    printHelp("close-sprint");
    return;
  }
  requireFields(options, "sprintId", "closedBy");

  const sprint = db.prepare("SELECT id, name, goal, status FROM sprints WHERE id = ?").get(options.sprintId);
  if (!sprint) {
    die(`Sprint ${options.sprintId} does not exist`);
  }

  enforcePolicy(
    db,
    evaluateTransitionPolicy(db, {
      entity: "sprint_close",
      target: options.sprintId,
      sprintId: options.sprintId
    })
  );

  const productId = latestProductId(db);
  if (!productId) {
    die("No product found");
  }

  const closureId = nextId(db, "CLOSE", "sprint_closures");
  let closure = null;
  const carriedStories = [];
  const carriedTasks = [];

  const tx = db.transaction(() => {
    const completedStoryCount = db
      .prepare(
        `SELECT COUNT(1) AS count
         FROM stories
         WHERE sprint_id = ? AND status IN ('accepted','done')`
      )
      .get(options.sprintId).count;

    const completedTaskCount = db
      .prepare(
        `SELECT COUNT(1) AS count
         FROM tasks t
         JOIN stories s ON s.id = t.parent_story_id
         WHERE s.sprint_id = ? AND t.status = 'done'`
      )
      .get(options.sprintId).count;

    const storyRows = db
      .prepare(
        `SELECT id, status
         FROM stories
         WHERE sprint_id = ? AND status NOT IN ('accepted','done')`
      )
      .all(options.sprintId);

    for (const story of storyRows) {
      const reason =
        story.status === "blocked"
          ? "Story remains blocked and is carried forward."
          : "Story is unfinished and is carried forward to the backlog.";
      carriedStories.push({ id: story.id, reason });

      db.prepare(
        `UPDATE stories
         SET sprint_id = NULL,
             status = CASE WHEN status = 'blocked' THEN 'blocked' ELSE 'ready' END,
             updated_at = datetime('now')
         WHERE id = ?`
      ).run(story.id);
    }

    const taskRows =
      storyRows.length === 0
        ? []
        : db
            .prepare(
              `SELECT t.id, t.status
               FROM tasks t
               WHERE t.parent_story_id IN (${storyRows.map(() => "?").join(",")})`
            )
            .all(...storyRows.map((story) => story.id));

    for (const task of taskRows) {
      if (task.status === "done") {
        continue;
      }

      const resetToReady = task.status === "in_progress";
      const reason =
        task.status === "blocked"
          ? "Task remains blocked and stays attached to the carried-forward story."
          : resetToReady
            ? "Task was in progress and was reset to ready for the next sprint."
            : "Task remains unfinished and stays attached to the carried-forward story.";

      carriedTasks.push({ id: task.id, reason });

      db.prepare(
        `UPDATE tasks
         SET status = CASE WHEN status = 'in_progress' THEN 'ready' ELSE status END,
             assigned_agent = CASE WHEN status = 'in_progress' THEN NULL ELSE assigned_agent END,
             updated_at = datetime('now')
         WHERE id = ?`
      ).run(task.id);
      db.prepare("DELETE FROM task_leases WHERE task_id = ?").run(task.id);
    }

    db.prepare(
      `UPDATE sprints
       SET status = 'completed', end_date = datetime('now'), updated_at = datetime('now')
       WHERE id = ?`
    ).run(options.sprintId);

    db.prepare(
      `INSERT INTO sprint_closures (
          id, sprint_id, closed_by, summary, report_path,
          completed_story_count, completed_task_count,
          carry_forward_story_count, carry_forward_task_count
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      closureId,
      options.sprintId,
      options.closedBy,
      options.summary || null,
      "",
      completedStoryCount,
      completedTaskCount,
      carriedStories.length,
      carriedTasks.length
    );

    for (const story of carriedStories) {
      db.prepare(
        `INSERT INTO sprint_carry_forward_items (closure_id, item_type, item_id, reason)
         VALUES (?, 'story', ?, ?)`
      ).run(closureId, story.id, story.reason);
    }

    for (const task of carriedTasks) {
      db.prepare(
        `INSERT INTO sprint_carry_forward_items (closure_id, item_type, item_id, reason)
         VALUES (?, 'task', ?, ?)`
      ).run(closureId, task.id, task.reason);
    }

    db.prepare(
      `UPDATE master_board
       SET active_sprint_id = NULL, updated_at = datetime('now')
       WHERE id = ?`
    ).run(productId);

    syncEpicStatuses(db, productId);
    syncProductLifecycle(db, productId, {
      nextCommand: determinePostCloseNextCommand(db, productId)
    });

    closure = {
      id: closureId,
      sprint_id: options.sprintId,
      closed_by: options.closedBy,
      summary: options.summary || "",
      completed_story_count: completedStoryCount,
      completed_task_count: completedTaskCount,
      carry_forward_story_count: carriedStories.length,
      carry_forward_task_count: carriedTasks.length,
      created_at: new Date().toISOString()
    };
  });
  tx();

  const repoRoot = WORKSPACE_ROOT;
  enforcePolicy(
    db,
    evaluatePathPolicy(path.join(repoRoot, "planning", "reports", `sprint-${sprint.id}-closeout.md`), {
      repoRoot,
      allowedExternalPaths: allowedGlobalSkillPaths(),
      allowedInternalPaths: [path.join(repoRoot, "planning", "reports")]
    })
  );
  const reportPath = writeCloseoutReport(sprint, closure, carriedStories, carriedTasks);
  db.prepare(
    `UPDATE sprint_closures
     SET report_path = ?
     WHERE id = ?`
  ).run(path.relative(repoRoot, reportPath), closureId);

  insertAudit(db, "sprints", options.sprintId, "status", sprint.status, "completed", options.closedBy);
  printJson({
    id: closureId,
    sprint_id: options.sprintId,
    status: "completed",
    report_path: path.relative(repoRoot, reportPath),
    carry_forward_story_count: carriedStories.length,
    carry_forward_task_count: carriedTasks.length,
    next_command: determinePostCloseNextCommand(db, productId)
  });
}

function createStory(db, argv) {
  const { options } = parseOptions(argv, {
    "--criterion": { key: "criteria", multiple: true, type: "value" },
    "--epic-id": { key: "epicId", type: "value", aliases: ["--epicId"] },
    "--requires-human-acceptance": { key: "requiresHumanAcceptance", type: "flag" },
    "--sprint-id": { key: "sprintId", type: "value", aliases: ["--sprintId"] },
    "--summary": { key: "summary", type: "value", aliases: ["--desc"] },
    "--title": { key: "title", type: "value" }
  });
  if (options.help) {
    printHelp("create-story");
    return;
  }
  requireFields(options, "sprintId", "epicId", "title");

  const summary = options.summary || options.title;

  const id = nextId(db, "STORY", "stories");
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO stories (
          id, title, summary, parent_epic_id, sprint_id, requires_human_acceptance
       ) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      options.title,
      summary,
      options.epicId,
      options.sprintId,
      options.requiresHumanAcceptance ? 1 : 0
    );

    for (const criterion of options.criteria || []) {
      db.prepare(
        "INSERT INTO story_acceptance_criteria (story_id, criterion) VALUES (?, ?)"
      ).run(id, criterion);
    }

    const productId = latestProductId(db);
    if (productId) {
      syncEpicStatuses(db, productId);
    }
  });
  tx();

  insertAudit(db, "stories", id, "create", "", options.title, "orchestrator");
  printJson({ id, status: "created" });
}

function updateStoryStatus(db, argv) {
  const { options } = parseOptions(argv, {
    "--status": { key: "status", type: "value" },
    "--story-id": { key: "storyId", type: "value" }
  });
  requireFields(options, "storyId", "status");

  const oldRow = db.prepare("SELECT status FROM stories WHERE id = ?").get(options.storyId);
  if (!oldRow) {
    die(`Story ${options.storyId} does not exist`);
  }
  if (!validateTransition("story", oldRow.status, options.status)) {
    die(`Invalid story status transition: ${oldRow.status} -> ${options.status}`);
  }

  db.prepare(
    "UPDATE stories SET status = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(options.status, options.storyId);
  insertAudit(db, "stories", options.storyId, "status", oldRow.status, options.status, "orchestrator");
  printJson({ id: options.storyId, status: options.status });
}

function acceptStory(db, argv) {
  const { options } = parseOptions(argv, {
    "--acceptance-note": { key: "acceptanceNote", type: "value" },
    "--accepted-by": { key: "acceptedBy", type: "value" },
    "--story-id": { key: "storyId", type: "value" }
  });
  requireFields(options, "storyId", "acceptedBy", "acceptanceNote");

  const story = db
    .prepare(
      `SELECT id, status
       FROM stories
       WHERE id = ?`
    )
    .get(options.storyId);
  if (!story) {
    die(`Story ${options.storyId} does not exist`);
  }
  if (!["in_review", "accepted"].includes(story.status)) {
    die(`Story ${options.storyId} must be in_review or accepted to record human acceptance`);
  }

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE stories
       SET status = 'accepted',
           acceptance_note = ?,
           accepted_by = ?,
           accepted_at = datetime('now'),
           updated_at = datetime('now')
       WHERE id = ?`
    ).run(options.acceptanceNote, options.acceptedBy, options.storyId);

    db.prepare(
      `UPDATE story_acceptance_criteria
       SET met = 1
       WHERE story_id = ?`
    ).run(options.storyId);

    const productId = latestProductId(db);
    if (productId) {
      syncEpicStatuses(db, productId);
      syncProductLifecycle(db, productId);
    }
  });
  tx();

  insertAudit(
    db,
    "stories",
    options.storyId,
    "acceptance",
    story.status,
    options.acceptanceNote,
    options.acceptedBy
  );
  printJson({ id: options.storyId, status: "accepted", accepted_by: options.acceptedBy });
}

function addSprintCriterion(db, argv) {
  const { options } = parseOptions(argv, {
    "--criterion": { key: "criterion", type: "value" },
    "--kind": { key: "kind", type: "value" },
    "--sprint-id": { key: "sprintId", type: "value" }
  });
  requireFields(options, "sprintId", "kind", "criterion");
  if (!["entry", "exit"].includes(options.kind)) {
    die("Sprint criterion kind must be entry or exit");
  }

  const sprint = db.prepare("SELECT id FROM sprints WHERE id = ?").get(options.sprintId);
  if (!sprint) {
    die(`Sprint ${options.sprintId} does not exist`);
  }

  const result = db
    .prepare(
      `INSERT INTO sprint_criteria (sprint_id, kind, criterion)
       VALUES (?, ?, ?)`
    )
    .run(options.sprintId, options.kind, options.criterion);
  printJson({
    id: Number(result.lastInsertRowid),
    sprint_id: options.sprintId,
    kind: options.kind,
    status: "created"
  });
}

function setSprintCriterion(db, argv) {
  const { options } = parseOptions(argv, {
    "--criterion-id": { key: "criterionId", type: "value" },
    "--met": { key: "met", type: "value" }
  });
  requireFields(options, "criterionId", "met");
  const met = ["true", "1", "yes"].includes(String(options.met).toLowerCase()) ? 1 : 0;
  const criterion = db
    .prepare("SELECT id FROM sprint_criteria WHERE id = ?")
    .get(Number(options.criterionId));
  if (!criterion) {
    die(`Sprint criterion ${options.criterionId} does not exist`);
  }

  db.prepare(
    `UPDATE sprint_criteria
     SET met = ?
     WHERE id = ?`
  ).run(met, Number(options.criterionId));
  printJson({ id: Number(options.criterionId), met: Boolean(met), status: "updated" });
}

function createTask(db, argv) {
  const { options } = parseOptions(argv, {
    "--agent-hint": { key: "agentHint", type: "value", aliases: ["--agentHint"] },
    "--file": { key: "files", multiple: true, type: "value" },
    "--parallel-safe": { key: "parallelSafe", type: "flag" },
    "--priority": { key: "priority", type: "value" },
    "--story-id": { key: "storyId", type: "value", aliases: ["--storyId"] },
    "--summary": { key: "summary", type: "value", aliases: ["--desc"] },
    "--test": { key: "tests", multiple: true, type: "value" },
    "--title": { key: "title", type: "value" }
  });
  if (options.help) {
    printHelp("create-task");
    return;
  }
  requireFields(options, "storyId", "title");

  const summary = options.summary || options.title;

  const id = nextId(db, "TASK", "tasks");
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO tasks (
          id, title, summary, parent_story_id, priority, parallel_safe, agent_hint, kind
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 'implementation')`
    ).run(
      id,
      options.title,
      summary,
      options.storyId,
      options.priority || "medium",
      options.parallelSafe ? 1 : 0,
      options.agentHint || ""
    );

    for (const filePath of options.files || []) {
      enforcePolicy(
        db,
        evaluatePathPolicy(path.resolve(WORKSPACE_ROOT, filePath), {
          repoRoot: WORKSPACE_ROOT,
          allowedExternalPaths: allowedGlobalSkillPaths()
        })
      );
      db.prepare("INSERT INTO task_files (task_id, file_path) VALUES (?, ?)").run(id, filePath);
    }

    for (const requirement of options.tests || []) {
      db.prepare(
        "INSERT INTO task_test_requirements (task_id, requirement) VALUES (?, ?)"
      ).run(id, requirement);
    }
  });
  tx();

  insertAudit(db, "tasks", id, "create", "", options.title, "orchestrator");
  printJson({ id, status: "created" });
}

function claimTask(db, argv) {
  const { options } = parseOptions(argv, {
    "--agent": { key: "agent", type: "value" },
    "--task-id": { key: "taskId", type: "value" }
  });
  requireFields(options, "taskId", "agent");

  const row = db
    .prepare("SELECT status, IFNULL(assigned_agent, '') AS assigned_agent FROM tasks WHERE id = ?")
    .get(options.taskId);
  if (!row) {
    die(`Task ${options.taskId} does not exist`);
  }
  const claimable =
    row.status === "ready" || (row.status === "in_progress" && row.assigned_agent === options.agent);
  if (!claimable) {
    die(`Task ${options.taskId} is not claimable from status ${row.status}`);
  }
  if (row.assigned_agent && row.assigned_agent !== options.agent) {
    die(`Task ${options.taskId} is already claimed by ${row.assigned_agent}`);
  }

  const lease = activeLeaseForTask(db, options.taskId);
  if (lease && lease.lease_owner !== options.agent) {
    die(`Task ${options.taskId} is reserved by ${lease.lease_owner} until ${lease.expires_at}`);
  }

  db.prepare(
    `UPDATE tasks
     SET status = 'in_progress', assigned_agent = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(options.agent, options.taskId);
  insertAudit(db, "tasks", options.taskId, "status", row.status, "in_progress", options.agent);
  printJson({ id: options.taskId, status: "in_progress", agent: options.agent });
}

function blockTask(db, argv) {
  const { options } = parseOptions(argv, {
    "--description": { key: "description", type: "value" },
    "--task-id": { key: "taskId", type: "value" }
  });
  requireFields(options, "taskId", "description");

  const row = db.prepare("SELECT status FROM tasks WHERE id = ?").get(options.taskId);
  if (!row) {
    die(`Task ${options.taskId} does not exist`);
  }

  const tx = db.transaction(() => {
    db.prepare(
      "UPDATE tasks SET status = 'blocked', updated_at = datetime('now') WHERE id = ?"
    ).run(options.taskId);
    db.prepare("INSERT INTO task_blockers (task_id, description) VALUES (?, ?)").run(
      options.taskId,
      options.description
    );
  });
  tx();

  insertAudit(db, "tasks", options.taskId, "status", row.status, "blocked", "orchestrator");
  printJson({ id: options.taskId, status: "blocked" });
}

function submitTask(db, argv) {
  const { options } = parseOptions(argv, {
    "--evidence": { key: "evidence", type: "value" },
    "--task-id": { key: "taskId", type: "value" }
  });
  requireFields(options, "taskId", "evidence");

  const row = db.prepare("SELECT status FROM tasks WHERE id = ?").get(options.taskId);
  if (!row) {
    die(`Task ${options.taskId} does not exist`);
  }
  if (!["in_progress", "blocked"].includes(row.status)) {
    die(`Task ${options.taskId} must be in_progress or blocked to submit`);
  }

  enforcePolicy(
    db,
    evaluateCommandPolicy(`submit-task ${options.taskId}`)
  );

  db.prepare(
    `UPDATE tasks
     SET status = 'in_review', evidence = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(options.evidence, options.taskId);
  insertAudit(db, "tasks", options.taskId, "status", row.status, "in_review", "orchestrator");

  const productId = latestProductId(db);
  if (productId) {
    syncProductLifecycle(db, productId, { nextCommand: "/review-sprint" });
  }

  printJson({ id: options.taskId, status: "in_review" });
}

function completeTask(db, argv) {
  const { options } = parseOptions(argv, {
    "--task-id": { key: "taskId", type: "value" }
  });
  requireFields(options, "taskId");

  const task = currentTask(db, options.taskId);
  if (!task) {
    die(`Task ${options.taskId} does not exist`);
  }
  if (task.status !== "in_review") {
    die(`Task ${options.taskId} must be in_review to complete`);
  }

  enforcePolicy(
    db,
    evaluateTransitionPolicy(db, {
      entity: "task",
      target: options.taskId,
      toStatus: "done",
      taskId: options.taskId,
      evidence: task.evidence || ""
    })
  );

  db.prepare("UPDATE tasks SET status = 'done', updated_at = datetime('now') WHERE id = ?").run(
    options.taskId
  );
  resolveLinkedFailureIfNeeded(db, options.taskId);
  resolveSourceTaskAfterFix(db, task);
  maybeAdvanceStory(db, task.parent_story_id);
  const productId = latestProductId(db);
  if (productId) {
    syncEpicStatuses(db, productId);
  }
  insertAudit(db, "tasks", options.taskId, "status", task.status, "done", "orchestrator");
  printJson({ id: options.taskId, status: "done" });
}

function addTaskArtifact(db, argv) {
  const { options } = parseOptions(argv, {
    "--artifact": { key: "artifact", type: "value" },
    "--task-id": { key: "taskId", type: "value" }
  });
  requireFields(options, "taskId", "artifact");
  db.prepare("INSERT INTO task_artifacts (task_id, artifact) VALUES (?, ?)").run(
    options.taskId,
    options.artifact
  );
  printJson({ id: options.taskId, artifact: "added" });
}

function normalizeFinding(spec) {
  if (!spec.includes(":")) {
    return { severity: "medium", finding: spec };
  }
  const [severity, ...rest] = spec.split(":");
  return {
    severity: severity || "medium",
    finding: rest.join(":").trim()
  };
}

function reviewTask(db, argv) {
  const { options } = parseOptions(argv, {
    "--acceptance-note": { key: "acceptanceNote", type: "value" },
    "--decision": { key: "decision", type: "value" },
    "--finding": { key: "findings", multiple: true, type: "value" },
    "--reviewer": { key: "reviewer", type: "value" },
    "--summary": { key: "summary", type: "value" },
    "--task-id": { key: "taskId", type: "value" }
  });
  if (options.help) {
    printHelp("review-task");
    return;
  }
  requireFields(options, "taskId", "decision");

  const task = currentTask(db, options.taskId);
  if (!task) {
    die(`Task ${options.taskId} does not exist`);
  }
  if (task.status !== "in_review") {
    die(`Task ${options.taskId} must already be in_review to be reviewed`);
  }
  if (!["approved", "changes_requested"].includes(options.decision)) {
    die("review-task decision must be approved or changes_requested");
  }
  if (options.decision === "changes_requested" && !options.summary) {
    die("review-task changes_requested requires --summary");
  }

  enforcePolicy(
    db,
    evaluateTransitionPolicy(db, {
      entity: "review",
      target: options.taskId,
      toStatus: options.decision,
      taskId: options.taskId
    })
  );

  enforcePolicy(
    db,
    evaluateReviewGate(db, {
      taskId: options.taskId,
      decision: options.decision,
      acceptanceNote: options.acceptanceNote || options.summary || ""
    })
  );

  const reviewId = nextId(db, "REV", "task_reviews");
  let failureId = null;
  let fixTaskId = null;

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO task_reviews (id, task_id, reviewer, decision, summary)
       VALUES (?, ?, ?, ?, ?)`
    ).run(
      reviewId,
      options.taskId,
      options.reviewer || null,
      options.decision,
      options.summary || options.acceptanceNote || null
    );

    for (const spec of options.findings || []) {
      const finding = normalizeFinding(spec);
      db.prepare(
        `INSERT INTO task_review_findings (review_id, severity, finding)
         VALUES (?, ?, ?)`
      ).run(reviewId, finding.severity, finding.finding);
    }

    if (options.decision === "approved") {
      db.prepare(
        "UPDATE tasks SET status = 'done', updated_at = datetime('now') WHERE id = ?"
      ).run(options.taskId);
      resolveLinkedFailureIfNeeded(db, options.taskId);
      resolveSourceTaskAfterFix(db, task);
      maybeAdvanceStory(db, task.parent_story_id);
      const productId = latestProductId(db);
      if (productId) {
        syncEpicStatuses(db, productId);
      }
      insertAudit(
        db,
        "tasks",
        options.taskId,
        "status",
        task.status,
        "done",
        options.reviewer || "reviewer"
      );
    } else {
      const failure = recordTaskFailureInternal(db, {
        taskId: options.taskId,
        source: "review",
        summary: options.summary,
        evidence: task.evidence || "",
        blockSourceTask: true,
        blockerDescription: `Review requested changes: ${options.summary}`,
        changedBy: options.reviewer || "reviewer"
      });
      failureId = failure.failureId;
      fixTaskId = failure.fixTaskId;
    }
  });
  tx();

  const productId = latestProductId(db);
  if (productId) {
    const nextCommand =
      options.decision === "approved" ? determineNextCommand(db, productId) : "/run-sprint";
    syncProductLifecycle(db, productId, { nextCommand });
  }

  printJson({
    id: reviewId,
    task_id: options.taskId,
    decision: options.decision,
    failure_id: failureId,
    fix_task_id: fixTaskId,
    status: options.decision === "approved" ? "approved" : "changes_requested"
  });
}

function approveTask(db, argv) {
  const { options } = parseOptions(argv, {
    "--acceptance-note": { key: "acceptanceNote", type: "value" },
    "--reviewer": { key: "reviewer", type: "value" },
    "--task-id": { key: "taskId", type: "value" }
  });
  requireFields(options, "taskId");

  reviewTask(db, [
    "--task-id",
    options.taskId,
    "--decision",
    "approved",
    ...(options.reviewer ? ["--reviewer", options.reviewer] : []),
    ...(options.acceptanceNote ? ["--acceptance-note", options.acceptanceNote] : [])
  ]);
}

function requestTaskChanges(db, argv) {
  const { options } = parseOptions(argv, {
    "--finding": { key: "findings", multiple: true, type: "value" },
    "--reviewer": { key: "reviewer", type: "value" },
    "--summary": { key: "summary", type: "value" },
    "--task-id": { key: "taskId", type: "value" }
  });
  requireFields(options, "taskId", "summary");

  reviewTask(db, [
    "--task-id",
    options.taskId,
    "--decision",
    "changes_requested",
    "--summary",
    options.summary,
    ...(options.reviewer ? ["--reviewer", options.reviewer] : []),
    ...((options.findings || []).flatMap((finding) => ["--finding", finding]))
  ]);
}

function recordTaskFailure(db, argv) {
  const { options } = parseOptions(argv, {
    "--block-source": { key: "blockSource", type: "flag" },
    "--evidence": { key: "evidence", type: "value" },
    "--priority": { key: "priority", type: "value" },
    "--source": { key: "source", type: "value" },
    "--summary": { key: "summary", type: "value" },
    "--task-id": { key: "taskId", type: "value" }
  });
  requireFields(options, "taskId", "source", "summary");

  const existingFix = findOpenFixTask(db, options.taskId);
  if (existingFix) {
    logPolicyEvent(
      db,
      evaluateTransitionPolicy(db, {
        entity: "fix_task",
        target: options.taskId,
        sourceTaskId: options.taskId
      })
    );
  }

  const tx = db.transaction(() =>
    recordTaskFailureInternal(db, {
      taskId: options.taskId,
      source: options.source,
      summary: options.summary,
      evidence: options.evidence || "",
      priority: options.priority || "",
      blockSourceTask: Boolean(options.blockSource),
      blockerDescription: options.summary
    })
  );

  const result = tx();
  const productId = latestProductId(db);
  if (productId) {
    syncProductLifecycle(db, productId, { nextCommand: "/run-sprint" });
  }
  printJson({
    task_id: options.taskId,
    failure_id: result.failureId,
    fix_task_id: result.fixTaskId,
    reused_fix_task: result.reusedFixTask
  });
}

function addFeedback(db, argv) {
  const { options } = parseOptions(argv, {
    "--action": { key: "action", type: "value" },
    "--impact": { key: "impact", type: "value" },
    "--link": { key: "links", multiple: true, type: "value" },
    "--source": { key: "source", type: "value" },
    "--summary": { key: "summary", type: "value" }
  });
  requireFields(options, "source", "summary");

  const id = nextId(db, "FDBK", "feedback");
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO feedback (id, source, summary, impact, recommended_action)
       VALUES (?, ?, ?, ?, ?)`
    ).run(id, options.source, options.summary, options.impact || null, options.action || null);

    for (const spec of options.links || []) {
      const { type, linkedId } = validateLink(db, spec);
      db.prepare(
        `INSERT INTO feedback_links (feedback_id, linked_id, linked_type)
         VALUES (?, ?, ?)`
      ).run(id, linkedId, type);
    }
  });
  tx();

  insertAudit(db, "feedback", id, "create", "", options.summary, "orchestrator");
  printJson({ id, status: "open" });
}

function resolveFeedback(db, argv) {
  const { options } = parseOptions(argv, {
    "--feedback-id": { key: "feedbackId", type: "value" }
  });
  requireFields(options, "feedbackId");
  db.prepare("UPDATE feedback SET status = 'resolved' WHERE id = ?").run(options.feedbackId);
  printJson({ id: options.feedbackId, status: "resolved" });
}

function createBug(db, argv) {
  const { options } = parseOptions(argv, {
    "--acceptance": { key: "acceptance", type: "value" },
    "--link": { key: "links", multiple: true, type: "value" },
    "--notes": { key: "notes", type: "value" },
    "--related-sprint": { key: "relatedSprint", type: "value" },
    "--severity": { key: "severity", type: "value" },
    "--source": { key: "source", type: "value" },
    "--summary": { key: "summary", type: "value" },
    "--title": { key: "title", type: "value" }
  });
  requireFields(options, "title");

  const id = nextId(db, "BUG", "bugs");
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO bugs (id, title, summary, severity, source, related_sprint_id, acceptance_criteria, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      options.title,
      options.summary || null,
      options.severity || "medium",
      options.source || null,
      options.relatedSprint || null,
      options.acceptance || null,
      options.notes || null
    );

    for (const spec of options.links || []) {
      const { type, linkedId } = validateLink(db, spec);
      db.prepare(
        `INSERT INTO bug_links (bug_id, linked_id, linked_type)
         VALUES (?, ?, ?)`
      ).run(id, linkedId, type);
    }
  });
  tx();

  insertAudit(db, "bugs", id, "create", "", options.title, "orchestrator");
  printJson({ id, status: "backlog" });
}

function updateBugStatus(db, argv) {
  const { options } = parseOptions(argv, {
    "--bug-id": { key: "bugId", type: "value" },
    "--status": { key: "status", type: "value" }
  });
  requireFields(options, "bugId", "status");

  const row = db.prepare("SELECT status FROM bugs WHERE id = ?").get(options.bugId);
  if (!row) {
    die(`Bug ${options.bugId} does not exist`);
  }
  if (!validateTransition("bug", row.status, options.status)) {
    die(`Invalid bug status transition: ${row.status} -> ${options.status}`);
  }

  db.prepare("UPDATE bugs SET status = ?, updated_at = datetime('now') WHERE id = ?").run(
    options.status,
    options.bugId
  );
  insertAudit(db, "bugs", options.bugId, "status", row.status, options.status, "orchestrator");
  printJson({ id: options.bugId, status: options.status });
}

function addDecision(db, argv) {
  const { options } = parseOptions(argv, {
    "--decision": { key: "decision", type: "value" },
    "--impact": { key: "impact", type: "value" },
    "--owner": { key: "owner", type: "value" },
    "--rationale": { key: "rationale", type: "value" }
  });
  requireFields(options, "decision");

  const id = nextId(db, "DEC", "decisions");
  db.prepare(
    `INSERT INTO decisions (id, owner, decision, rationale, impact)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    id,
    options.owner || null,
    options.decision,
    options.rationale || null,
    options.impact || null
  );
  insertAudit(db, "decisions", id, "create", "", options.decision, "orchestrator");
  printJson({ id, status: "created" });
}

const WORKSPACE_CONFIG_KEYS = new Set([
  "project_type",
  "planning_horizon",
  "governance_mode",
  "review_granularity",
  "cli_path",
  "model_preferences",
  "execution_defaults",
  "design_review_required"
]);

const WORKFLOW_PHASES = new Set([
  "init",
  "research",
  "spec",
  "design",
  "planning",
  "building",
  "review",
  "closeout",
  "feedback",
  "resume",
  "complete"
]);

function initWorkspace(db, argv) {
  const { options } = parseOptions(argv, {
    "--product-id": { key: "productId", type: "value" }
  });

  const { tableExists: hasTable } = require("./lib/policy");

  if (hasTable(db, "workspace_config")) {
    db.prepare("INSERT OR IGNORE INTO workspace_config (id) VALUES (1)").run();
  }

  if (hasTable(db, "extension_install_metadata")) {
    db.prepare(
      `INSERT OR IGNORE INTO extension_install_metadata (id, workspace_root)
       VALUES (1, ?)`
    ).run(WORKSPACE_ROOT);
  }

  const productId = options.productId || latestProductId(db);
  if (productId && hasTable(db, "workflow_phase")) {
    db.prepare(
      `INSERT OR IGNORE INTO workflow_phase (product_id, phase)
       VALUES (?, 'init')`
    ).run(productId);
  }

  const { dbPath, migrationsDir, packageRoot } = require("./lib/scrum-db");
  const health = fullHealthCheck(WORKSPACE_ROOT, packageRoot, dbPath, migrationsDir);
  printJson({
    status: "initialized",
    workspace_root: WORKSPACE_ROOT,
    health
  });
}

function showWorkspaceHealth(db, argv) {
  const { dbPath, migrationsDir, packageRoot } = require("./lib/scrum-db");
  const health = fullHealthCheck(WORKSPACE_ROOT, packageRoot, dbPath, migrationsDir);
  printJson(health);
}

function getConfig(db, argv) {
  const { options } = parseOptions(argv, {
    "--key": { key: "key", type: "value" }
  });

  const row = db.prepare("SELECT * FROM workspace_config WHERE id = 1").get();
  if (!row) {
    die("workspace_config not initialized. Run init-workspace first.");
  }

  if (options.key) {
    if (!WORKSPACE_CONFIG_KEYS.has(options.key)) {
      die(`Unknown config key: ${options.key}`);
    }
    printJson({ key: options.key, value: row[options.key] });
  } else {
    printJson(row);
  }
}

function setConfig(db, argv) {
  const { options } = parseOptions(argv, {
    "--key": { key: "key", type: "value" },
    "--value": { key: "value", type: "value" }
  });
  requireFields(options, "key", "value");

  if (!WORKSPACE_CONFIG_KEYS.has(options.key)) {
    die(`Unknown config key: ${options.key}`);
  }

  const row = db.prepare("SELECT * FROM workspace_config WHERE id = 1").get();
  if (!row) {
    die("workspace_config not initialized. Run init-workspace first.");
  }

  const oldValue = row[options.key];
  db.prepare(
    `UPDATE workspace_config SET ${options.key} = ?, updated_at = datetime('now') WHERE id = 1`
  ).run(options.value);
  insertAudit(db, "workspace_config", "1", options.key, String(oldValue), options.value, "orchestrator");
  printJson({ key: options.key, value: options.value, status: "updated" });
}

function getPhase(db, argv) {
  const { options, positionals } = parseOptions(argv, {
    "--product-id": { key: "productId", type: "value" }
  });
  const productId = resolveProductId(db, options.productId || positionals[0]);

  const row = db
    .prepare("SELECT * FROM workflow_phase WHERE product_id = ?")
    .get(productId);
  if (!row) {
    die(`No workflow phase set for product ${productId}. Run init-workspace first.`);
  }
  printJson(row);
}

function setPhase(db, argv) {
  const { options } = parseOptions(argv, {
    "--phase": { key: "phase", type: "value" },
    "--product-id": { key: "productId", type: "value" }
  });
  requireFields(options, "phase");

  if (!WORKFLOW_PHASES.has(options.phase)) {
    die(`Invalid phase: ${options.phase}. Must be one of: ${[...WORKFLOW_PHASES].join(", ")}`);
  }

  const productId = resolveProductId(db, options.productId);
  const existing = db
    .prepare("SELECT phase FROM workflow_phase WHERE product_id = ?")
    .get(productId);

  if (existing) {
    const oldPhase = existing.phase;
    db.prepare(
      `UPDATE workflow_phase
       SET phase = ?, previous_phase = ?, entered_at = datetime('now'), updated_at = datetime('now')
       WHERE product_id = ?`
    ).run(options.phase, oldPhase, productId);
    insertAudit(db, "workflow_phase", productId, "phase", oldPhase, options.phase, "orchestrator");
  } else {
    db.prepare(
      `INSERT INTO workflow_phase (product_id, phase)
       VALUES (?, ?)`
    ).run(productId, options.phase);
    insertAudit(db, "workflow_phase", productId, "phase", "", options.phase, "orchestrator");
  }

  printJson({ product_id: productId, phase: options.phase, status: "updated" });
}

// --- Design Workflow Commands (Phase 2) ---

const DESIGN_STATES = new Set([
  "draft", "pending_review", "changes_requested",
  "approved", "frozen", "superseded"
]);

function createDesignArtifact(db, argv) {
  const { options } = parseOptions(argv, {
    "--artifact-type": { key: "artifactType", type: "value" },
    "--content-hash": { key: "contentHash", type: "value" },
    "--file-path": { key: "filePath", type: "value" },
    "--linked-sprint-id": { key: "linkedSprintId", type: "value" },
    "--linked-story-id": { key: "linkedStoryId", type: "value" },
    "--notes": { key: "notes", type: "value" },
    "--product-id": { key: "productId", type: "value" }
  });
  requireFields(options, "filePath");

  const productId = resolveProductId(db, options.productId);
  const id = nextId(db, "DESIGN", "design_artifacts");

  db.prepare(
    `INSERT INTO design_artifacts (
        id, product_id, file_path, artifact_type, state, content_hash,
        notes, linked_story_id, linked_sprint_id
     ) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?)`
  ).run(
    id,
    productId,
    options.filePath,
    options.artifactType || "design",
    options.contentHash || null,
    options.notes || null,
    options.linkedStoryId || null,
    options.linkedSprintId || null
  );

  insertAudit(db, "design_artifacts", id, "create", "", options.filePath, "orchestrator");
  printJson({ id, product_id: productId, state: "draft", status: "created" });
}

function submitDesign(db, argv) {
  const { options } = parseOptions(argv, {
    "--artifact-id": { key: "artifactId", type: "value" },
    "--content-hash": { key: "contentHash", type: "value" }
  });
  requireFields(options, "artifactId");

  const artifact = db
    .prepare("SELECT id, state, revision FROM design_artifacts WHERE id = ?")
    .get(options.artifactId);
  if (!artifact) {
    die(`Design artifact ${options.artifactId} does not exist`);
  }
  if (!["draft", "changes_requested"].includes(artifact.state)) {
    die(`Design artifact ${options.artifactId} must be in draft or changes_requested to submit (current: ${artifact.state})`);
  }

  const sets = ["state = 'pending_review'", "updated_at = datetime('now')"];
  const params = [];
  if (options.contentHash) {
    sets.push("content_hash = ?");
    params.push(options.contentHash);
  }
  params.push(options.artifactId);

  db.prepare(
    `UPDATE design_artifacts SET ${sets.join(", ")} WHERE id = ?`
  ).run(...params);

  insertAudit(db, "design_artifacts", options.artifactId, "state", artifact.state, "pending_review", "orchestrator");
  printJson({ id: options.artifactId, state: "pending_review", status: "submitted" });
}

function reviewDesign(db, argv) {
  const { options } = parseOptions(argv, {
    "--artifact-id": { key: "artifactId", type: "value" },
    "--decision": { key: "decision", type: "value" },
    "--reviewer": { key: "reviewer", type: "value" },
    "--reviewer-session-id": { key: "reviewerSessionId", type: "value" },
    "--summary": { key: "summary", type: "value" }
  });
  requireFields(options, "artifactId", "decision");

  if (!["approved", "changes_requested", "skip_design"].includes(options.decision)) {
    die("review-design decision must be approved, changes_requested, or skip_design");
  }

  const artifact = db
    .prepare("SELECT id, state, revision, product_id FROM design_artifacts WHERE id = ?")
    .get(options.artifactId);
  if (!artifact) {
    die(`Design artifact ${options.artifactId} does not exist`);
  }
  if (artifact.state !== "pending_review") {
    die(`Design artifact ${options.artifactId} must be in pending_review to review (current: ${artifact.state})`);
  }

  if (options.decision === "changes_requested" && !options.summary) {
    die("review-design changes_requested requires --summary");
  }

  const reviewId = nextId(db, "DREV", "design_reviews");
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO design_reviews (id, artifact_id, reviewer, decision, summary, reviewer_session_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      reviewId,
      options.artifactId,
      options.reviewer || null,
      options.decision,
      options.summary || null,
      options.reviewerSessionId ? Number(options.reviewerSessionId) : null
    );

    let newState;
    if (options.decision === "approved") {
      newState = "approved";
    } else if (options.decision === "changes_requested") {
      newState = "changes_requested";
    } else {
      newState = "approved";
    }

    db.prepare(
      `UPDATE design_artifacts
       SET state = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(newState, options.artifactId);

    insertAudit(db, "design_artifacts", options.artifactId, "state", artifact.state, newState, options.reviewer || "reviewer");
  });
  tx();

  printJson({
    review_id: reviewId,
    artifact_id: options.artifactId,
    decision: options.decision,
    state: options.decision === "changes_requested" ? "changes_requested" : "approved",
    status: "reviewed"
  });
}

function freezeDesign(db, argv) {
  const { options } = parseOptions(argv, {
    "--artifact-id": { key: "artifactId", type: "value" },
    "--freeze-note": { key: "freezeNote", type: "value" }
  });
  requireFields(options, "artifactId");

  const artifact = db
    .prepare("SELECT id, state, revision FROM design_artifacts WHERE id = ?")
    .get(options.artifactId);
  if (!artifact) {
    die(`Design artifact ${options.artifactId} does not exist`);
  }
  if (artifact.state !== "approved") {
    die(`Design artifact ${options.artifactId} must be approved before freezing (current: ${artifact.state})`);
  }

  db.prepare(
    `UPDATE design_artifacts
     SET state = 'frozen', updated_at = datetime('now')
     WHERE id = ?`
  ).run(options.artifactId);

  // Record freeze metadata on the latest approval review
  const latestReview = db
    .prepare(
      `SELECT id FROM design_reviews
       WHERE artifact_id = ? AND decision = 'approved'
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(options.artifactId);
  if (latestReview) {
    db.prepare(
      `UPDATE design_reviews
       SET frozen_at = datetime('now'), frozen_revision = ?, summary = COALESCE(summary, '') || CASE WHEN ? IS NOT NULL AND ? != '' THEN ' | Freeze note: ' || ? ELSE '' END
       WHERE id = ?`
    ).run(artifact.revision, options.freezeNote, options.freezeNote, options.freezeNote, latestReview.id);
  }

  insertAudit(db, "design_artifacts", options.artifactId, "state", "approved", "frozen", "orchestrator");
  printJson({ id: options.artifactId, state: "frozen", revision: artifact.revision, status: "frozen" });
}

function supersedeDesign(db, argv) {
  const { options } = parseOptions(argv, {
    "--artifact-id": { key: "artifactId", type: "value" },
    "--content-hash": { key: "contentHash", type: "value" },
    "--file-path": { key: "filePath", type: "value" },
    "--notes": { key: "notes", type: "value" }
  });
  requireFields(options, "artifactId");

  const old = db
    .prepare("SELECT id, state, revision, product_id, file_path, artifact_type, linked_story_id, linked_sprint_id FROM design_artifacts WHERE id = ?")
    .get(options.artifactId);
  if (!old) {
    die(`Design artifact ${options.artifactId} does not exist`);
  }
  if (old.state !== "frozen") {
    die(`Only frozen designs can be superseded (current: ${old.state})`);
  }

  const newId = nextId(db, "DESIGN", "design_artifacts");
  const tx = db.transaction(() => {
    // Mark old as superseded
    db.prepare(
      `UPDATE design_artifacts SET state = 'superseded', updated_at = datetime('now') WHERE id = ?`
    ).run(options.artifactId);

    // Create new revision
    db.prepare(
      `INSERT INTO design_artifacts (
          id, product_id, file_path, artifact_type, state, revision,
          parent_artifact_id, content_hash, notes, linked_story_id, linked_sprint_id
       ) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?)`
    ).run(
      newId,
      old.product_id,
      options.filePath || old.file_path,
      old.artifact_type,
      old.revision + 1,
      old.id,
      options.contentHash || null,
      options.notes || null,
      old.linked_story_id,
      old.linked_sprint_id
    );

    insertAudit(db, "design_artifacts", options.artifactId, "state", "frozen", "superseded", "orchestrator");
    insertAudit(db, "design_artifacts", newId, "create", "", `revision ${old.revision + 1}`, "orchestrator");
  });
  tx();

  printJson({
    superseded_id: options.artifactId,
    new_id: newId,
    revision: old.revision + 1,
    state: "draft",
    status: "superseded"
  });
}

function listDesignArtifacts(db, argv) {
  const { options, positionals } = parseOptions(argv, {
    "--product-id": { key: "productId", type: "value" },
    "--state": { key: "state", type: "value" }
  });
  const productId = resolveProductId(db, options.productId || positionals[0]);

  let query = `SELECT da.*, dr_latest.reviewer AS latest_reviewer, dr_latest.decision AS latest_decision
     FROM design_artifacts da
     LEFT JOIN (
       SELECT artifact_id, reviewer, decision,
              ROW_NUMBER() OVER (PARTITION BY artifact_id ORDER BY created_at DESC) AS rn
       FROM design_reviews
     ) dr_latest ON dr_latest.artifact_id = da.id AND dr_latest.rn = 1
     WHERE da.product_id = ?`;
  const params = [productId];

  if (options.state) {
    if (!DESIGN_STATES.has(options.state)) {
      die(`Invalid state filter: ${options.state}`);
    }
    query += " AND da.state = ?";
    params.push(options.state);
  }

  query += " ORDER BY da.revision DESC, da.created_at DESC";

  const rows = db.prepare(query).all(...params);
  printJson(rows);
}

function listDesignReviews(db, argv) {
  const { options } = parseOptions(argv, {
    "--artifact-id": { key: "artifactId", type: "value" }
  });
  requireFields(options, "artifactId");

  const rows = db
    .prepare(
      `SELECT * FROM design_reviews WHERE artifact_id = ? ORDER BY created_at DESC, id DESC`
    )
    .all(options.artifactId);
  printJson(rows);
}

function checkDesignFreezeGate(db, productId) {
  const config = db.prepare("SELECT design_review_required FROM workspace_config WHERE id = 1").get();
  if (!config || config.design_review_required !== 1) {
    return { passed: true, reason: "Design review is not required by workspace config." };
  }

  const unfrozen = db
    .prepare(
      `SELECT id, state, file_path FROM design_artifacts
       WHERE product_id = ? AND state NOT IN ('frozen', 'superseded')
       ORDER BY id`
    )
    .all(productId);

  if (unfrozen.length > 0) {
    return {
      passed: false,
      reason: `Design freeze required but ${unfrozen.length} artifact(s) are not frozen: ${unfrozen.map(a => `${a.id} (${a.state})`).join(", ")}`,
      blocking_artifacts: unfrozen
    };
  }

  return { passed: true, reason: "All design artifacts are frozen or superseded." };
}

const commands = {
  "activate-sprint": activateSprint,
  "add-assumption": addAssumption,
  "add-decision": addDecision,
  "add-epic-dependency": addEpicDependency,
  "add-feedback": addFeedback,
  "add-mvp-item": addMvpItem,
  "add-open-question": addOpenQuestion,
  "add-roadmap-theme": addRoadmapTheme,
  "add-sprint-criterion": addSprintCriterion,
  "add-task-artifact": addTaskArtifact,
  "accept-story": acceptStory,
  "approve-task": approveTask,
  "block-task": blockTask,
  "claim-task": claimTask,
  "close-sprint": closeSprint,
  "complete-sprint": completeSprint,
  "complete-task": completeTask,
  "create-bug": createBug,
  "create-design-artifact": createDesignArtifact,
  "create-epic": createEpic,
  "create-product": createProduct,
  "create-sprint": createSprint,
  "create-story": createStory,
  "create-task": createTask,
  "finish-run": finishRun,
  "finish-session": finishSession,
  "freeze-design": freezeDesign,
  "get-config": getConfig,
  "get-phase": getPhase,
  "guardrail-report": guardrailReport,
  "init-workspace": initWorkspace,
  "list-design-artifacts": listDesignArtifacts,
  "list-design-reviews": listDesignReviews,
  "list-epics": listEpics,
  "list-ready-tasks": listReadyTasks,
  "list-review-stories": listReviewStories,
  "list-review-tasks": listReviewTasks,
  "policy-check": policyCheck,
  query,
  "record-task-failure": recordTaskFailure,
  "release-leases": releaseLeases,
  "resolve-feedback": resolveFeedback,
  "resume-session": resumeSession,
  "request-task-changes": requestTaskChanges,
  "review-design": reviewDesign,
  "review-task": reviewTask,
  "select-run-mode": selectRunMode,
  "set-config": setConfig,
  "set-phase": setPhase,
  "set-sprint-criterion": setSprintCriterion,
  "show-active-sprint": showActiveSprint,
  "show-product": showProduct,
  "show-workspace-health": showWorkspaceHealth,
  "start-run": startRun,
  "start-session": startSession,
  "submit-design": submitDesign,
  "submit-task": submitTask,
  "supersede-design": supersedeDesign,
  "sync-state": syncState,
  "update-bug-status": updateBugStatus,
  "update-epic": updateEpic,
  "update-product": updateProduct,
  "update-story-status": updateStoryStatus
};

let db;

try {
  const command = process.argv[2];
  if (!command || command === "--help" || command === "-h") {
    printHelp("general");
    process.exitCode = 0;
  } else if (command === "help") {
    printHelp(process.argv[3] || "general");
    process.exitCode = 0;
  } else {
    const handler = commands[command];
    if (!handler) {
      die(`Unknown command: ${command}`);
    }

    if (command === "init-workspace") {
      ({ db } = initDatabase());
    } else {
      ({ db } = openDatabase());
    }
    handler(db, process.argv.slice(3));
  }
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (db) {
    db.close();
  }
}
