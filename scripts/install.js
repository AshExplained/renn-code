#!/usr/bin/env node

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline/promises");
const { spawnSync } = require("node:child_process");
const { openDatabase } = require("./lib/scrum-db");
const { evaluatePathPolicy, logPolicyEvent } = require("./lib/policy");

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
