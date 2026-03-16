import * as path from "path";
import * as fs from "fs";
import { execSync } from "child_process";

export interface WorkspaceHealth {
  status: "healthy" | "needs_repair" | "not_initialized";
  issues: string[];
  database: {
    exists: boolean;
    path: string;
    canOpen: boolean;
    appliedCount: number;
    expectedCount: number;
    needsMigration: boolean;
  };
  skills: Array<{
    folder: string;
    exists: boolean;
    missingSkills: string[];
    incompleteSkills: Array<{ name: string; missingFiles: string[] }>;
  }>;
  config: {
    exists: boolean;
    config: Record<string, unknown> | null;
  };
  extension: {
    exists: boolean;
    metadata: Record<string, unknown> | null;
  };
}

export interface ProductStatus {
  id: string;
  name: string;
  status: string;
  next_command: string | null;
  active_sprint_id: string | null;
}

export interface WorkflowPhase {
  product_id: string;
  phase: string;
  previous_phase: string | null;
}

export interface SprintSummary {
  id: string;
  name: string;
  goal: string | null;
  status: string;
}

export interface DashboardData {
  product: ProductStatus | null;
  phase: WorkflowPhase | null;
  sprint: SprintSummary | null;
  taskCounts: {
    ready: number;
    in_progress: number;
    in_review: number;
    blocked: number;
    done: number;
  };
  health: WorkspaceHealth;
}

/**
 * Locate the harness package root containing scripts/scrum.js.
 *
 * Search order:
 * 1. Workspace-local (workspace IS the harness repo)
 * 2. node_modules dependency inside the workspace
 * 3. Extension install location (extension/ is a sibling of scripts/)
 *
 * The third fallback is the key Phase 1 enabler: it lets the globally
 * installed extension initialize arbitrary workspaces without requiring
 * the package to already be present in the workspace.
 */
export function findPackageRoot(
  workspaceRoot: string,
  extensionPath?: string
): string | null {
  // 1. Workspace IS the harness repo
  const localScrum = path.join(workspaceRoot, "scripts", "scrum.js");
  if (fs.existsSync(localScrum)) {
    return workspaceRoot;
  }

  // 2. Installed as a workspace dependency
  const nmScrum = path.join(
    workspaceRoot,
    "node_modules",
    "ai-scrum-workflow",
    "scripts",
    "scrum.js"
  );
  if (fs.existsSync(nmScrum)) {
    return path.join(workspaceRoot, "node_modules", "ai-scrum-workflow");
  }

  // 3. Resolve from the extension's own install location.
  //    The extension lives at <packageRoot>/extension/out/extension.js,
  //    so the package root is two levels up from __dirname at runtime.
  //    When extensionPath is provided (e.g. context.extensionPath), use it.
  if (extensionPath) {
    const fromExtension = path.resolve(extensionPath, "..");
    const candidate = path.join(fromExtension, "scripts", "scrum.js");
    if (fs.existsSync(candidate)) {
      return fromExtension;
    }
  }

  // 4. Fallback: resolve relative to this compiled file's location
  //    (out/workspace.js → extension/ → packageRoot/)
  const selfResolved = path.resolve(__dirname, "..", "..");
  const selfCandidate = path.join(selfResolved, "scripts", "scrum.js");
  if (fs.existsSync(selfCandidate)) {
    return selfResolved;
  }

  return null;
}

function runScrum(
  command: string,
  workspaceRoot: string,
  packageRoot: string
): string {
  const scrumJs = path.join(packageRoot, "scripts", "scrum.js");
  return execSync(`node "${scrumJs}" ${command}`, {
    cwd: workspaceRoot,
    env: { ...process.env, SCRUM_WORKSPACE_ROOT: workspaceRoot },
    encoding: "utf8",
    timeout: 10000,
  }).trim();
}

export function detectWorkspace(
  workspaceRoot: string,
  extensionPath?: string
): {
  initialized: boolean;
  packageRoot: string | null;
  dbExists: boolean;
} {
  const dbPath = path.join(workspaceRoot, "delivery", "scrum.db");
  const dbExists = fs.existsSync(dbPath);
  const packageRoot = findPackageRoot(workspaceRoot, extensionPath);

  return {
    initialized: dbExists,
    packageRoot,
    dbExists,
  };
}

export function getWorkspaceHealth(
  workspaceRoot: string,
  packageRoot: string
): WorkspaceHealth | null {
  try {
    const output = runScrum("show-workspace-health", workspaceRoot, packageRoot);
    return JSON.parse(output) as WorkspaceHealth;
  } catch {
    return null;
  }
}

export function initializeWorkspace(
  workspaceRoot: string,
  packageRoot: string
): { success: boolean; output: string } {
  try {
    const initDbJs = path.join(packageRoot, "scripts", "init-db.js");
    execSync(`node "${initDbJs}"`, {
      cwd: workspaceRoot,
      env: { ...process.env, SCRUM_WORKSPACE_ROOT: workspaceRoot },
      encoding: "utf8",
      timeout: 15000,
    });

    const installJs = path.join(packageRoot, "scripts", "install.js");
    execSync(`node "${installJs}" --repair`, {
      cwd: workspaceRoot,
      env: { ...process.env, SCRUM_WORKSPACE_ROOT: workspaceRoot },
      encoding: "utf8",
      timeout: 15000,
    });

    const output = runScrum("init-workspace", workspaceRoot, packageRoot);
    return { success: true, output };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error during init";
    return { success: false, output: message };
  }
}

export function repairWorkspace(
  workspaceRoot: string,
  packageRoot: string
): { success: boolean; output: string } {
  try {
    const installJs = path.join(packageRoot, "scripts", "install.js");
    const output = execSync(`node "${installJs}" --repair`, {
      cwd: workspaceRoot,
      env: { ...process.env, SCRUM_WORKSPACE_ROOT: workspaceRoot },
      encoding: "utf8",
      timeout: 15000,
    });
    return { success: true, output: output.trim() };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error during repair";
    return { success: false, output: message };
  }
}

export function getDashboardData(
  workspaceRoot: string,
  packageRoot: string
): DashboardData {
  const health = getWorkspaceHealth(workspaceRoot, packageRoot);
  const emptyResult: DashboardData = {
    product: null,
    phase: null,
    sprint: null,
    taskCounts: { ready: 0, in_progress: 0, in_review: 0, blocked: 0, done: 0 },
    health: health || {
      status: "not_initialized",
      issues: ["Could not read workspace health"],
      database: {
        exists: false,
        path: "",
        canOpen: false,
        appliedCount: 0,
        expectedCount: 0,
        needsMigration: true,
      },
      skills: [],
      config: { exists: false, config: null },
      extension: { exists: false, metadata: null },
    },
  };

  if (!health || health.status === "not_initialized") {
    return emptyResult;
  }

  try {
    const productRaw = runScrum("show-product", workspaceRoot, packageRoot);
    const products = JSON.parse(productRaw);
    if (!Array.isArray(products) || products.length === 0) {
      return { ...emptyResult, health };
    }
    const product = products[0] as ProductStatus;

    let phase: WorkflowPhase | null = null;
    try {
      const phaseRaw = runScrum("get-phase", workspaceRoot, packageRoot);
      phase = JSON.parse(phaseRaw) as WorkflowPhase;
    } catch {
      // no phase set yet
    }

    let sprint: SprintSummary | null = null;
    try {
      const sprintRaw = runScrum(
        "show-active-sprint",
        workspaceRoot,
        packageRoot
      );
      const sprints = JSON.parse(sprintRaw);
      if (Array.isArray(sprints) && sprints.length > 0) {
        sprint = sprints[0] as SprintSummary;
      }
    } catch {
      // no active sprint
    }

    let taskCounts = { ready: 0, in_progress: 0, in_review: 0, blocked: 0, done: 0 };
    if (product.active_sprint_id) {
      try {
        const countsRaw = runScrum(
          `query --sql "SELECT status, COUNT(1) AS count FROM tasks t JOIN stories s ON s.id = t.parent_story_id WHERE s.sprint_id = '${product.active_sprint_id}' GROUP BY status"`,
          workspaceRoot,
          packageRoot
        );
        const rows = JSON.parse(countsRaw) as Array<{
          status: string;
          count: number;
        }>;
        for (const row of rows) {
          if (row.status in taskCounts) {
            (taskCounts as Record<string, number>)[row.status] = row.count;
          }
        }
      } catch {
        // query failed
      }
    }

    return { product, phase, sprint, taskCounts, health };
  } catch {
    return { ...emptyResult, health };
  }
}
