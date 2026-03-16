const fs = require("node:fs");
const path = require("node:path");

const { tableExists } = require("./policy");

function checkDatabase(dbPath, migrationsDir) {
  const result = {
    exists: false,
    path: dbPath,
    canOpen: false,
    appliedCount: 0,
    expectedCount: 0,
    needsMigration: true
  };

  const expectedFiles = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  result.expectedCount = expectedFiles.length;

  if (!fs.existsSync(dbPath)) {
    return result;
  }
  result.exists = true;

  let Database;
  try {
    Database = require("better-sqlite3");
  } catch {
    return result;
  }

  let db;
  try {
    db = new Database(dbPath, { readonly: true });
    result.canOpen = true;

    const hasMigrations = db
      .prepare(
        "SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'"
      )
      .get();

    if (hasMigrations) {
      result.appliedCount = db
        .prepare("SELECT COUNT(1) AS count FROM schema_migrations")
        .get().count;
    }

    result.needsMigration = result.appliedCount < result.expectedCount;
  } catch {
    // DB exists but cannot be opened or queried
  } finally {
    if (db) {
      db.close();
    }
  }

  return result;
}

function checkSkillFolders(workspaceRoot, packageRoot) {
  const trees = [
    {
      source: path.join(packageRoot, ".agents", "skills"),
      target: path.join(workspaceRoot, ".agents", "skills")
    },
    {
      source: path.join(packageRoot, ".claude", "skills"),
      target: path.join(workspaceRoot, ".claude", "skills")
    }
  ];

  return trees.map((entry) => {
    const info = {
      folder: entry.target,
      source: entry.source,
      exists: false,
      isSymlink: false,
      symlinkValid: false,
      expectedSkills: [],
      missingSkills: [],
      incompleteSkills: []
    };

    // Enumerate expected skill subfolders from the source
    if (fs.existsSync(entry.source)) {
      info.expectedSkills = fs
        .readdirSync(entry.source, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
    }

    if (!fs.existsSync(entry.target)) {
      info.missingSkills = [...info.expectedSkills];
      return info;
    }
    info.exists = true;

    try {
      const stat = fs.lstatSync(entry.target);
      info.isSymlink = stat.isSymbolicLink();
      if (info.isSymlink) {
        const linkTarget = fs.readlinkSync(entry.target);
        info.symlinkValid = fs.existsSync(linkTarget);
        if (!info.symlinkValid) {
          info.missingSkills = [...info.expectedSkills];
          return info;
        }
      }
    } catch {
      // stat failed
    }

    // Check each expected skill subfolder and its contents
    for (const skillName of info.expectedSkills) {
      const targetSkillDir = path.join(entry.target, skillName);
      const sourceSkillDir = path.join(entry.source, skillName);

      if (!fs.existsSync(targetSkillDir)) {
        info.missingSkills.push(skillName);
        continue;
      }

      // Check that at least SKILL.md exists (the primary file for each skill)
      const sourceFiles = fs
        .readdirSync(sourceSkillDir)
        .filter((f) => fs.statSync(path.join(sourceSkillDir, f)).isFile());

      const missingFiles = sourceFiles.filter(
        (f) => !fs.existsSync(path.join(targetSkillDir, f))
      );

      if (missingFiles.length > 0) {
        info.incompleteSkills.push({ name: skillName, missingFiles });
      }
    }

    return info;
  });
}

function checkWorkspaceConfig(db) {
  if (!tableExists(db, "workspace_config")) {
    return { exists: false, config: null };
  }

  const row = db.prepare("SELECT * FROM workspace_config WHERE id = 1").get();
  return { exists: Boolean(row), config: row || null };
}

function checkWorkflowPhase(db, productId) {
  if (!tableExists(db, "workflow_phase")) {
    return { exists: false, phase: null };
  }

  if (!productId) {
    return { exists: false, phase: null };
  }

  const row = db
    .prepare("SELECT * FROM workflow_phase WHERE product_id = ?")
    .get(productId);
  return { exists: Boolean(row), phase: row || null };
}

function checkExtensionMetadata(db) {
  if (!tableExists(db, "extension_install_metadata")) {
    return { exists: false, metadata: null };
  }

  const row = db
    .prepare("SELECT * FROM extension_install_metadata WHERE id = 1")
    .get();
  return { exists: Boolean(row), metadata: row || null };
}

function fullHealthCheck(workspaceRoot, packageRoot, dbPath, migrationsDir) {
  const database = checkDatabase(dbPath, migrationsDir);
  const skills = checkSkillFolders(workspaceRoot, packageRoot);

  let config = { exists: false, config: null };
  let extension = { exists: false, metadata: null };

  if (database.exists && database.canOpen) {
    let Database;
    let db;
    try {
      Database = require("better-sqlite3");
      db = new Database(dbPath, { readonly: true });
      config = checkWorkspaceConfig(db);
      extension = checkExtensionMetadata(db);
    } catch {
      // cannot open for config/extension checks
    } finally {
      if (db) {
        db.close();
      }
    }
  }

  const issues = [];

  if (!database.exists) {
    issues.push("Database does not exist");
  } else if (!database.canOpen) {
    issues.push("Database exists but cannot be opened");
  } else if (database.needsMigration) {
    issues.push(
      `Database has ${database.appliedCount} of ${database.expectedCount} migrations applied`
    );
  }

  for (const skill of skills) {
    if (!skill.exists) {
      issues.push(`Skill folder missing: ${skill.folder}`);
    } else if (skill.isSymlink && !skill.symlinkValid) {
      issues.push(`Broken symlink: ${skill.folder}`);
    } else {
      for (const name of skill.missingSkills) {
        issues.push(`Skill missing: ${path.join(skill.folder, name)}`);
      }
      for (const entry of skill.incompleteSkills) {
        issues.push(
          `Skill incomplete: ${path.join(skill.folder, entry.name)} (missing: ${entry.missingFiles.join(", ")})`
        );
      }
    }
  }

  if (database.exists && database.canOpen && !config.exists) {
    issues.push("workspace_config row is missing");
  }

  let status = "healthy";
  if (!database.exists) {
    status = "not_initialized";
  } else if (issues.length > 0) {
    status = "needs_repair";
  }

  return {
    status,
    issues,
    database,
    skills,
    config,
    extension
  };
}

module.exports = {
  checkDatabase,
  checkExtensionMetadata,
  checkSkillFolders,
  checkWorkflowPhase,
  checkWorkspaceConfig,
  fullHealthCheck
};
