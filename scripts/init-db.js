#!/usr/bin/env node

const { initDatabase, dbPath } = require("./lib/scrum-db");

let db;

try {
  ({ db } = initDatabase());
  console.log(`Database ready at ${dbPath}`);
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (db) {
    db.close();
  }
}
