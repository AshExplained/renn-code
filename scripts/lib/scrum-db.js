const fs = require("node:fs");
const path = require("node:path");

let Database;
try {
  Database = require("better-sqlite3");
} catch (error) {
  const wrapped = new Error(
    "Missing dependency better-sqlite3. Run `npm install` before using the Node CLI."
  );
  wrapped.cause = error;
  throw wrapped;
}

const packageRoot = path.resolve(__dirname, "..", "..");
const workspaceRoot = process.env.SCRUM_WORKSPACE_ROOT || process.cwd();
const dbPath = process.env.SCRUM_DB_PATH || path.join(workspaceRoot, "delivery", "scrum.db");
const migrationsDir = path.join(packageRoot, "delivery", "migrations");

function ensureDbDirectory() {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

function openDatabase(options = {}) {
  ensureDbDirectory();

  if (!options.allowCreate && !fs.existsSync(dbPath)) {
    throw new Error(`Database not found at ${dbPath}. Run node scripts/init-db.js first.`);
  }

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return { db, dbPath, repoRoot: workspaceRoot, packageRoot, migrationsDir, workspaceRoot };
}

function initDatabase() {
  const { db } = openDatabase({ allowCreate: true });

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const appliedStmt = db.prepare(
    "SELECT COUNT(1) AS count FROM schema_migrations WHERE filename = ?"
  );
  const insertMigrationStmt = db.prepare(
    "INSERT INTO schema_migrations (filename) VALUES (?)"
  );

  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((filename) => filename.endsWith(".sql"))
    .sort();

  for (const filename of migrationFiles) {
    const applied = appliedStmt.get(filename);
    if (applied && applied.count > 0) {
      continue;
    }

    console.log(`Applying ${filename}`);
    const fullPath = path.join(migrationsDir, filename);
    const sql = fs.readFileSync(fullPath, "utf8");
    db.exec(sql);
    insertMigrationStmt.run(filename);
  }

  return { db, dbPath, repoRoot: workspaceRoot, packageRoot, migrationsDir, workspaceRoot };
}

module.exports = {
  dbPath,
  initDatabase,
  migrationsDir,
  openDatabase,
  packageRoot,
  repoRoot: workspaceRoot,
  workspaceRoot
};
