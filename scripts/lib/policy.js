const path = require("node:path");

const BLOCKED_COMMAND_PATTERNS = [
  {
    pattern: /\bsudo\b/i,
    reason: "Commands requiring sudo are blocked by project policy."
  },
  {
    pattern: /\brm\s+-rf\b/i,
    reason: "Recursive force deletion is blocked by project policy."
  },
  {
    pattern: /\bgit\s+reset\s+--hard\b/i,
    reason: "Destructive git reset is blocked by project policy."
  },
  {
    pattern: /\bgit\s+push\s+--force(?:-with-lease)?\b/i,
    reason: "Force pushes are blocked by project policy."
  }
];

const PROTECTED_WORKSPACE_DIRS = new Set([
  "delivery",
  "planning",
  ".agents",
  ".claude",
  "node_modules"
]);

function tableExists(db, tableName) {
  const row = db
    .prepare(
      `SELECT 1 AS found
       FROM sqlite_master
       WHERE type = 'table' AND name = ?`
    )
    .get(tableName);
  return Boolean(row);
}

function logPolicyEvent(db, event) {
  if (!tableExists(db, "policy_events")) {
    return event;
  }

  db.prepare(
    `INSERT INTO policy_events (kind, target, decision, reason)
     VALUES (?, ?, ?, ?)`
  ).run(event.kind, event.target, event.decision, event.reason);

  return event;
}

function allow(kind, target, reason) {
  return { kind, target, decision: "allow", reason };
}

function deny(kind, target, reason) {
  return { kind, target, decision: "deny", reason };
}

function normalizeAbsolute(targetPath) {
  return path.resolve(targetPath);
}

function isInside(basePath, targetPath) {
  const relative = path.relative(basePath, targetPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function evaluateCommandPolicy(command) {
  const target = command.trim();
  for (const rule of BLOCKED_COMMAND_PATTERNS) {
    if (rule.pattern.test(target)) {
      return deny("command", target, rule.reason);
    }
  }

  return allow("command", target, "Command does not match any blocked pattern.");
}

function evaluatePathPolicy(targetPath, context = {}) {
  const { repoRoot, allowedExternalPaths = [], allowedInternalPaths = [] } = context;
  const resolved = normalizeAbsolute(targetPath);
  const protectedNames = new Set([".env"]);

  if (resolved.split(path.sep).includes(".git")) {
    return deny("path", resolved, "Paths inside .git are protected.");
  }

  if (protectedNames.has(path.basename(resolved))) {
    return deny("path", resolved, "Environment files are protected.");
  }

  if (repoRoot && isInside(repoRoot, resolved)) {
    const approvedInternal = allowedInternalPaths.some((basePath) =>
      isInside(normalizeAbsolute(basePath), resolved)
    );
    if (approvedInternal) {
      return allow("path", resolved, "Path is inside an approved internal workspace target.");
    }

    const relative = path.relative(repoRoot, resolved);
    const topLevel = relative.split(path.sep)[0];
    if (PROTECTED_WORKSPACE_DIRS.has(topLevel)) {
      return deny(
        "path",
        resolved,
        `Paths inside ${topLevel} are reserved for infrastructure and are protected.`
      );
    }
    return allow("path", resolved, "Path is inside the workspace.");
  }

  const approvedExternal = allowedExternalPaths.some((basePath) =>
    isInside(normalizeAbsolute(basePath), resolved)
  );
  if (approvedExternal) {
    return allow("path", resolved, "Path is inside an approved external install target.");
  }

  return deny(
    "path",
    resolved,
    "Path is outside the workspace and not inside an approved install target."
  );
}

function getReadyTasks(db, productId, limit = 10) {
  return db
    .prepare(
      `SELECT t.id, t.title, t.summary, t.priority, t.parallel_safe, t.agent_hint, t.status,
              t.kind, t.source_task_id, s.id AS story_id, s.title AS story_title
       FROM tasks t
       JOIN stories s ON s.id = t.parent_story_id
       JOIN master_board mb ON mb.active_sprint_id = s.sprint_id
       WHERE mb.id = ?
         AND t.status = 'ready'
         AND NOT EXISTS (
           SELECT 1
           FROM task_dependencies td
           JOIN tasks dep ON dep.id = td.depends_on_id
           WHERE td.task_id = t.id
             AND dep.status != 'done'
         )
         AND NOT EXISTS (
           SELECT 1
           FROM task_leases tl
           WHERE tl.task_id = t.id
             AND datetime(tl.expires_at) > datetime('now')
         )
       ORDER BY CASE t.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, t.id
       LIMIT ?`
    )
    .all(productId, limit);
}

function selectExecutionMode(readyTasks) {
  const tasks = readyTasks || [];
  const count = tasks.length;
  const allParallelSafe = tasks.every((task) => task.parallel_safe === 1);

  if (count === 0) {
    return {
      mode: "idle",
      reason: "No dependency-safe ready tasks are available in the active sprint.",
      recommended_task_ids: []
    };
  }

  if (count === 1) {
    return {
      mode: "solo",
      reason: "Exactly one dependency-safe ready task is available.",
      recommended_task_ids: tasks.slice(0, 1).map((task) => task.id)
    };
  }

  if (count <= 3 && allParallelSafe) {
    return {
      mode: "parallel",
      reason: "A small set of dependency-safe tasks is marked parallel_safe.",
      recommended_task_ids: tasks.slice(0, 3).map((task) => task.id)
    };
  }

  return {
    mode: "coordinated",
    reason:
      count >= 4
        ? "Four or more dependency-safe tasks suggest coordinated execution and review."
        : "Some ready tasks are not parallel_safe and need tighter coordination.",
    recommended_task_ids: tasks.slice(0, Math.min(count, 3)).map((task) => task.id)
  };
}

function determineNextCommand(db, productId) {
  const reviewCount = db
    .prepare(
      `SELECT COUNT(1) AS count
       FROM tasks t
       JOIN stories s ON s.id = t.parent_story_id
       JOIN master_board mb ON mb.active_sprint_id = s.sprint_id
       WHERE mb.id = ? AND t.status = 'in_review'`
    )
    .get(productId).count;

  if (reviewCount > 0) {
    return "/review-sprint";
  }

  const storyAcceptanceCount = db
    .prepare(
      `SELECT COUNT(1) AS count
       FROM stories s
       JOIN master_board mb ON mb.active_sprint_id = s.sprint_id
       WHERE mb.id = ?
         AND s.status = 'in_review'`
    )
    .get(productId).count;

  if (storyAcceptanceCount > 0) {
    return "/review-sprint";
  }

  const activeWorkCount = db
    .prepare(
      `SELECT COUNT(1) AS count
       FROM tasks t
       JOIN stories s ON s.id = t.parent_story_id
       JOIN master_board mb ON mb.active_sprint_id = s.sprint_id
       WHERE mb.id = ? AND t.status IN ('ready','in_progress','blocked')`
    )
    .get(productId).count;

  if (activeWorkCount > 0) {
    return "/run-sprint";
  }

  const hasActiveSprint = db
    .prepare("SELECT active_sprint_id FROM master_board WHERE id = ?")
    .get(productId)?.active_sprint_id;

  if (hasActiveSprint) {
    return "/close-sprint";
  }

  return determinePostCloseNextCommand(db, productId);
}

function determinePostCloseNextCommand(db, productId) {
  const openFeedbackCount = db
    .prepare("SELECT COUNT(1) AS count FROM feedback WHERE status IN ('open','in_progress')")
    .get().count;
  const openBugCount = db
    .prepare(
      "SELECT COUNT(1) AS count FROM bugs WHERE status IN ('backlog','planned','in_progress','in_review')"
    )
    .get().count;
  const remainingEpicCount = db
    .prepare(
      `SELECT COUNT(1) AS count
       FROM epics
       WHERE product_id = ? AND status != 'done'`
    )
    .get(productId).count;

  if (openFeedbackCount > 0 || openBugCount > 0 || remainingEpicCount > 0) {
    return "/plan-sprint";
  }

  return "/add-feedback";
}

function determineProductStatus(db, productId) {
  const product = db
    .prepare("SELECT active_sprint_id FROM master_board WHERE id = ?")
    .get(productId);
  if (!product) {
    return "draft";
  }

  if (product.active_sprint_id) {
    return "in_progress";
  }

  const epicStats = db
    .prepare(
      `SELECT
          COUNT(1) AS total_count,
          SUM(CASE WHEN status != 'done' THEN 1 ELSE 0 END) AS remaining_count
       FROM epics
       WHERE product_id = ?`
    )
    .get(productId);

  if (!epicStats || epicStats.total_count === 0) {
    return "draft";
  }

  const openFeedbackCount = db
    .prepare("SELECT COUNT(1) AS count FROM feedback WHERE status IN ('open','in_progress')")
    .get().count;
  const openBugCount = db
    .prepare(
      "SELECT COUNT(1) AS count FROM bugs WHERE status IN ('backlog','planned','in_progress','in_review')"
    )
    .get().count;
  const openReviewCount = db
    .prepare("SELECT COUNT(1) AS count FROM tasks WHERE status = 'in_review'")
    .get().count;

  if (
    epicStats.remaining_count === 0 &&
    openFeedbackCount === 0 &&
    openBugCount === 0 &&
    openReviewCount === 0
  ) {
    return "delivered";
  }

  return "planning";
}

function evaluateTransitionPolicy(db, payload) {
  const { entity, target = "", toStatus, evidence = "", taskId, sourceTaskId, sprintId } = payload;

  if (entity === "task" && toStatus === "done") {
    if (!evidence || !String(evidence).trim()) {
      return deny("transition", target || taskId || "", "Tasks cannot move to done without evidence.");
    }
  }

  if (entity === "review") {
    const task = db.prepare("SELECT status FROM tasks WHERE id = ?").get(taskId);
    if (!task || task.status !== "in_review") {
      return deny(
        "transition",
        target || taskId || "",
        "Only tasks already in_review can be approved or sent back with changes."
      );
    }
  }

  if (entity === "fix_task" && sourceTaskId) {
    const existing = db
      .prepare(
        `SELECT id
         FROM tasks
         WHERE source_task_id = ?
           AND kind = 'fix'
           AND status != 'done'
         LIMIT 1`
      )
      .get(sourceTaskId);
    if (existing) {
      return deny(
        "transition",
        target || sourceTaskId,
        `Task ${sourceTaskId} already has an open fix task (${existing.id}).`
      );
    }
  }

  if (entity === "sprint_close" && sprintId) {
    const inReviewCount = db
      .prepare(
        `SELECT COUNT(1) AS count
         FROM tasks t
         JOIN stories s ON s.id = t.parent_story_id
         WHERE s.sprint_id = ? AND t.status = 'in_review'`
      )
      .get(sprintId).count;
    if (inReviewCount > 0) {
      return deny(
        "transition",
        target || sprintId,
        "A sprint cannot be closed while review tasks remain in_review."
      );
    }

    const inReviewStories = db
      .prepare(
        `SELECT COUNT(1) AS count
         FROM stories
         WHERE sprint_id = ?
           AND status = 'in_review'`
      )
      .get(sprintId).count;
    if (inReviewStories > 0) {
      return deny(
        "transition",
        target || sprintId,
        "A sprint cannot be closed while stories still require human acceptance."
      );
    }

    const unmetExitCriteria = db
      .prepare(
        `SELECT COUNT(1) AS count
         FROM sprint_criteria
         WHERE sprint_id = ?
           AND kind = 'exit'
           AND met = 0`
      )
      .get(sprintId).count;
    if (unmetExitCriteria > 0) {
      return deny(
        "transition",
        target || sprintId,
        "A sprint cannot be closed while exit criteria remain unmet."
      );
    }
  }

  return allow("transition", target || entity, "State transition passed policy checks.");
}

function evaluateReviewGate(db, payload) {
  const { taskId, decision, acceptanceNote = "" } = payload;
  if (decision !== "approved") {
    return allow("review_gate", taskId, "Review gate only tightens approved reviews.");
  }

  const task = db.prepare("SELECT evidence, status FROM tasks WHERE id = ?").get(taskId);
  if (!task) {
    return deny("review_gate", taskId, "Task does not exist.");
  }
  if (task.status !== "in_review") {
    return deny("review_gate", taskId, "Only in_review tasks can be approved.");
  }
  if (!task.evidence || !String(task.evidence).trim()) {
    return deny("review_gate", taskId, "Approved reviews require task evidence.");
  }

  const artifactCount = db
    .prepare("SELECT COUNT(1) AS count FROM task_artifacts WHERE task_id = ?")
    .get(taskId).count;
  if (artifactCount === 0 && !String(acceptanceNote).trim()) {
    return deny(
      "review_gate",
      taskId,
      "Approved reviews require at least one artifact or an explicit human acceptance note."
    );
  }

  return allow("review_gate", taskId, "Review approval has evidence and supporting artifact or note.");
}

function collectSyncIssues(db, productId) {
  const issues = [];

  const activeSprintCount = db
    .prepare("SELECT COUNT(1) AS count FROM sprints WHERE status = 'active'")
    .get().count;
  if (activeSprintCount > 1) {
    issues.push({
      code: "multiple_active_sprints",
      severity: "high",
      message: "More than one sprint is marked active."
    });
  }

  const orphanInProgress = db
    .prepare(
      `SELECT id
       FROM tasks
       WHERE status = 'in_progress' AND (assigned_agent IS NULL OR assigned_agent = '')`
    )
    .all();
  for (const row of orphanInProgress) {
    issues.push({
      code: "in_progress_without_agent",
      severity: "medium",
      record_id: row.id,
      message: `Task ${row.id} is in_progress without an assigned agent.`
    });
  }

  const staleReadyAssignments = db
    .prepare(
      `SELECT id
       FROM tasks
       WHERE status = 'ready' AND assigned_agent IS NOT NULL AND assigned_agent != ''`
    )
    .all();
  for (const row of staleReadyAssignments) {
    issues.push({
      code: "ready_with_assignment",
      severity: "low",
      record_id: row.id,
      message: `Task ${row.id} is ready but still has an assigned agent.`
    });
  }

  const reviewWithoutEvidence = db
    .prepare(
      `SELECT id
       FROM tasks
       WHERE status = 'in_review' AND (evidence IS NULL OR evidence = '')`
    )
    .all();
  for (const row of reviewWithoutEvidence) {
    issues.push({
      code: "review_without_evidence",
      severity: "high",
      record_id: row.id,
      message: `Task ${row.id} is in_review without evidence.`
    });
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
    issues.push({
      code: "blocked_without_reason",
      severity: "medium",
      record_id: row.id,
      message: `Task ${row.id} is blocked without an unresolved blocker record.`
    });
  }

  const openFailuresNoFix = db
    .prepare(
      `SELECT id, task_id
       FROM task_failures
       WHERE status = 'open' AND (fix_task_id IS NULL OR fix_task_id = '')`
    )
    .all();
  for (const row of openFailuresNoFix) {
    issues.push({
      code: "open_failure_without_fix",
      severity: "high",
      record_id: row.id,
      message: `Failure ${row.id} for task ${row.task_id} has no linked fix task.`
    });
  }

  if (tableExists(db, "task_leases")) {
    const expiredLeases = db
      .prepare(
        `SELECT task_id, session_id
         FROM task_leases
         WHERE datetime(expires_at) <= datetime('now')`
      )
      .all();
    for (const row of expiredLeases) {
      issues.push({
        code: "expired_task_lease",
        severity: "medium",
        record_id: row.task_id,
        message: `Task ${row.task_id} still has an expired lease from session ${row.session_id}.`
      });
    }

    const staleLeasedTasks = db
      .prepare(
        `SELECT tl.task_id, tl.lease_owner
         FROM task_leases tl
         JOIN tasks t ON t.id = tl.task_id
         WHERE datetime(tl.expires_at) > datetime('now')
           AND t.status = 'ready'`
      )
      .all();
    for (const row of staleLeasedTasks) {
      issues.push({
        code: "ready_task_with_live_lease",
        severity: "low",
        record_id: row.task_id,
        message: `Task ${row.task_id} is still ready while leased by ${row.lease_owner}.`
      });
    }
  }

  let latestSession = null;
  if (tableExists(db, "session_log")) {
    latestSession = db
      .prepare(
        `SELECT id, skill_used, mode, started_at, ended_at, status, summary, next_steps
         FROM session_log
         ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END, started_at DESC
         LIMIT 1`
      )
      .get();

    const abandonedOpenSessions = db
      .prepare(
        `SELECT sl.id
         FROM session_log sl
         LEFT JOIN task_leases tl ON tl.session_id = sl.id AND datetime(tl.expires_at) > datetime('now')
         WHERE sl.status = 'open'
         GROUP BY sl.id
         HAVING COUNT(tl.task_id) = 0`
      )
      .all();
    for (const row of abandonedOpenSessions) {
      issues.push({
        code: "open_session_without_live_leases",
        severity: "low",
        record_id: String(row.id),
        message: `Session ${row.id} is still open but has no live task leases.`
      });
    }
  }

  const product = db
    .prepare("SELECT next_command, status FROM master_board WHERE id = ?")
    .get(productId);
  const recommendedNextCommand = determineNextCommand(db, productId);
  if (product && product.next_command !== recommendedNextCommand) {
    issues.push({
      code: "next_command_out_of_sync",
      severity: "low",
      record_id: productId,
      message: `Product next_command is ${product.next_command || "unset"} but should be ${recommendedNextCommand}.`
    });
  }

  const recommendedStatus = determineProductStatus(db, productId);
  if (product && product.status !== recommendedStatus) {
    issues.push({
      code: "product_status_out_of_sync",
      severity: "medium",
      record_id: productId,
      message: `Product status is ${product.status || "unset"} but should be ${recommendedStatus}.`
    });
  }

  return {
    issues,
    latestSession,
    recommendedNextCommand
  };
}

module.exports = {
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
  selectExecutionMode,
  tableExists
};
