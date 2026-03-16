#!/usr/bin/env node

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline/promises");
const { spawnSync } = require("node:child_process");
const { initDatabase, openDatabase, dbPath, migrationsDir } = require("./lib/scrum-db");
const { evaluatePathPolicy, logPolicyEvent, tableExists } = require("./lib/policy");
const { fullHealthCheck } = require("./lib/health");

const packageRoot = path.resolve(__dirname, "..");
const workspaceRoot = process.env.SCRUM_WORKSPACE_ROOT || process.cwd();

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function run(command, args, cwd = packageRoot) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit"
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function linkOrCopySkill(sourceDir, targetDir) {
  try {
    if (fs.existsSync(targetDir)) {
      const stat = fs.lstatSync(targetDir);
      if (stat.isSymbolicLink() && fs.readlinkSync(targetDir) === sourceDir) {
        return "existing";
      }
      fs.rmSync(targetDir, { force: true, recursive: true });
    }

    fs.symlinkSync(sourceDir, targetDir, "junction");
    return "linked";
  } catch (error) {
    fs.cpSync(sourceDir, targetDir, { force: true, recursive: true });
    return "copied";
  }
}

function installGlobalSkills(sourceRoot, targetRoot) {
  ensureDir(targetRoot);
  const entries = fs
    .readdirSync(sourceRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory());

  for (const entry of entries) {
    const sourceDir = path.join(sourceRoot, entry.name);
    const targetDir = path.join(targetRoot, entry.name);
    const result = linkOrCopySkill(sourceDir, targetDir);
    console.log(`${result}: ${targetDir}`);
  }
}

function installWorkspaceSkills(sourceRoot, targetRoot) {
  installGlobalSkills(sourceRoot, targetRoot);
}

function assertAllowedPath(db, targetPath, allowedExternalPaths = [], allowedInternalPaths = []) {
  const event = evaluatePathPolicy(targetPath, {
    repoRoot: workspaceRoot,
    allowedExternalPaths,
    allowedInternalPaths
  });
  logPolicyEvent(db, event);
  if (event.decision === "deny") {
    throw new Error(event.reason);
  }
}

function repairSkillFolders(healthReport) {
  const repairs = [];

  for (const skill of healthReport.skills) {
    if (!fs.existsSync(skill.source)) {
      continue;
    }

    if (!skill.exists || (skill.isSymlink && !skill.symlinkValid)) {
      // Entire tree missing or broken — reinstall all subfolders
      ensureDir(skill.folder);
      const entries = fs
        .readdirSync(skill.source, { withFileTypes: true })
        .filter((entry) => entry.isDirectory());

      for (const entry of entries) {
        const sourceDir = path.join(skill.source, entry.name);
        const targetDir = path.join(skill.folder, entry.name);
        const result = linkOrCopySkill(sourceDir, targetDir);
        repairs.push(`${result}: ${targetDir}`);
      }
      continue;
    }

    // Tree exists — repair individual missing skill subfolders
    for (const name of skill.missingSkills) {
      const sourceDir = path.join(skill.source, name);
      const targetDir = path.join(skill.folder, name);
      const result = linkOrCopySkill(sourceDir, targetDir);
      repairs.push(`${result}: ${targetDir} (was missing)`);
    }

    // Repair incomplete skill subfolders (missing files within them)
    for (const entry of skill.incompleteSkills) {
      const sourceDir = path.join(skill.source, entry.name);
      const targetDir = path.join(skill.folder, entry.name);
      for (const file of entry.missingFiles) {
        fs.cpSync(path.join(sourceDir, file), path.join(targetDir, file));
        repairs.push(`restored: ${path.join(targetDir, file)}`);
      }
    }
  }

  return repairs;
}

function runCheck() {
  const health = fullHealthCheck(workspaceRoot, packageRoot, dbPath, migrationsDir);
  process.stdout.write(`${JSON.stringify(health, null, 2)}\n`);
  process.exit(health.status === "healthy" ? 0 : 1);
}

function runRepair() {
  const repairs = [];

  // 1. Ensure DB exists and migrations are current
  let db;
  try {
    ({ db } = initDatabase());
    repairs.push("Database initialized and migrations applied.");
  } catch (error) {
    console.error(`Error initializing database: ${error.message}`);
    process.exit(1);
  }

  // 2. Seed workspace_config if missing
  try {
    if (tableExists(db, "workspace_config")) {
      const inserted = db
        .prepare("INSERT OR IGNORE INTO workspace_config (id) VALUES (1)")
        .run();
      if (inserted.changes > 0) {
        repairs.push("Seeded default workspace_config.");
      }
    }
  } catch (error) {
    repairs.push(`Warning: could not seed workspace_config: ${error.message}`);
  }

  // 3. Seed extension_install_metadata if missing
  try {
    if (tableExists(db, "extension_install_metadata")) {
      const inserted = db
        .prepare(
          "INSERT OR IGNORE INTO extension_install_metadata (id, workspace_root) VALUES (1, ?)"
        )
        .run(workspaceRoot);
      if (inserted.changes > 0) {
        repairs.push("Seeded extension_install_metadata.");
      }
    }
  } catch (error) {
    repairs.push(`Warning: could not seed extension_install_metadata: ${error.message}`);
  }

  db.close();

  // 4. Repair skill folders
  const health = fullHealthCheck(workspaceRoot, packageRoot, dbPath, migrationsDir);
  const skillRepairs = repairSkillFolders(health);
  repairs.push(...skillRepairs);

  // 5. Final health check
  const postRepair = fullHealthCheck(workspaceRoot, packageRoot, dbPath, migrationsDir);

  const result = {
    repaired: true,
    repairs,
    health: postRepair
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(postRepair.status === "healthy" ? 0 : 1);
}

async function promptScope() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    const answer = await rl.question(
      "Install scope? [project/global] (default: project): "
    );
    const normalized = answer.trim().toLowerCase();
    if (!normalized) {
      return "project";
    }
    if (normalized === "project" || normalized === "global") {
      return normalized;
    }
    console.log("Unknown choice, defaulting to project.");
    return "project";
  } finally {
    rl.close();
  }
}

async function main() {
  // Handle --check and --repair flags before interactive prompt
  const args = process.argv.slice(2);
  if (args.includes("--check")) {
    runCheck();
    return;
  }
  if (args.includes("--repair")) {
    runRepair();
    return;
  }

  const scope = await promptScope();
  let db;

  try {
    if (workspaceRoot === packageRoot) {
      console.log(`\nInstalling npm dependencies for ${scope} scope...\n`);
      run(npmCommand(), ["install"], packageRoot);
    } else {
      console.log("\nPackage already installed in this workspace. Skipping dependency install.\n");
    }

    console.log("\nInitializing the local SQLite database...\n");
    run(process.execPath, [path.join(packageRoot, "scripts", "init-db.js")], workspaceRoot);
    ({ db } = openDatabase());

    assertAllowedPath(db, workspaceRoot);

    if (scope === "global") {
      console.log("\nInstalling skills into user-global locations...\n");
      const home = os.homedir();
      const approvedTargets = [
        path.join(home, ".codex", "skills"),
        path.join(home, ".gemini", "skills"),
        path.join(home, ".claude", "skills")
      ];
      for (const target of approvedTargets) {
        assertAllowedPath(db, target, approvedTargets);
      }
      installGlobalSkills(
        path.join(packageRoot, ".agents", "skills"),
        approvedTargets[0]
      );
      installGlobalSkills(
        path.join(packageRoot, ".agents", "skills"),
        approvedTargets[1]
      );
      installGlobalSkills(
        path.join(packageRoot, ".claude", "skills"),
        approvedTargets[2]
      );
    } else {
      if (workspaceRoot !== packageRoot) {
        console.log("\nInstalling project-local skills into the current workspace...\n");
        const workspaceTargets = [
          path.join(workspaceRoot, ".agents", "skills"),
          path.join(workspaceRoot, ".claude", "skills")
        ];
        for (const target of workspaceTargets) {
          assertAllowedPath(db, target, [], workspaceTargets);
        }
        installWorkspaceSkills(
          path.join(packageRoot, ".agents", "skills"),
          workspaceTargets[0]
        );
        installWorkspaceSkills(
          path.join(packageRoot, ".claude", "skills"),
          workspaceTargets[1]
        );
      } else {
        console.log("Project scope selected. Using repo-local skills only.");
      }
    }

    console.log("\nInstall complete.");
  } finally {
    if (db) {
      db.close();
    }
  }
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
