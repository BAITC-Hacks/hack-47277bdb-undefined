import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../config/env.js";
import { PostgresDatabase } from "./postgres.js";

interface AppliedMigrationRow {
  readonly migration_name: string;
}

function migrationsDirectory(): string {
  const sourceDirectory = dirname(fileURLToPath(import.meta.url));
  return resolve(sourceDirectory, "../../migrations");
}

async function migrationFiles(directory: string): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /^\d+_[a-z0-9_]+\.sql$/iu.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

async function applyMigrations(database: PostgresDatabase, directory: string): Promise<void> {
  await database.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      migration_name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  );

  for (const filename of await migrationFiles(directory)) {
    await database.transaction(async (transaction) => {
      const previous = await transaction.query<AppliedMigrationRow>(
        "SELECT migration_name FROM schema_migrations WHERE migration_name = $1",
        [filename]
      );
      if (previous.rows[0] !== undefined) {
        return;
      }

      const sql = await readFile(join(directory, filename), "utf8");
      await transaction.query(sql);
      await transaction.query("INSERT INTO schema_migrations (migration_name) VALUES ($1)", [
        filename
      ]);
      process.stdout.write(`Applied migration ${filename}\n`);
    });
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  if (config.DATABASE_URL === undefined) {
    throw new Error("DATABASE_URL is required to run database migrations.");
  }

  const database = new PostgresDatabase({ connectionString: config.DATABASE_URL, max: 1 });
  try {
    await applyMigrations(database, migrationsDirectory());
  } finally {
    await database.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
