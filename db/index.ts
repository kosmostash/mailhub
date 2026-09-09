import { dirname } from "node:path";
import { mkdirSync } from "node:fs";

import Database from "better-sqlite3";

import { config } from "@/domain/config";

import { schema } from "./schema";

export type Db = Database.Database;

/**
 * Numbered migrations. Append, never edit: `user_version` records how far a
 * database has come, and each entry runs exactly once.
 *
 * The first migration is the whole schema; there is no separate bootstrap path,
 * so a fresh file and an upgraded one converge on the same shape.
 */
const migrations: Array<{ name: string; up: (db: Db) => void }> = [
  { name: "001-initial", up: (db) => db.exec(schema) },
];

const migrate = (db: Db): void => {
  const applied = Number(db.pragma("user_version", { simple: true }));

  for (const [index, migration] of migrations.entries()) {
    const version = index + 1;
    if (version <= applied) continue;

    db.transaction(() => {
      migration.up(db);
      // PRAGMA takes no bindings, hence the interpolation - `version` is a
      // loop index over a literal array, never external input.
      db.pragma(`user_version = ${version}`);
    })();
  }
};

let instance: Db | undefined;

/**
 * The process-wide connection, opened lazily so that importing a repository
 * never touches the filesystem on its own - which is what lets the test suite
 * point at `:memory:` before anything else runs.
 */
export const db = (): Db => {
  if (instance) return instance;

  const file = config.databaseFile;
  if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });

  const connection = new Database(file);
  connection.pragma("journal_mode = WAL");
  connection.pragma("busy_timeout = 5000");
  connection.pragma("foreign_keys = ON");

  migrate(connection);
  instance = connection;
  return instance;
};

/** Close and forget the connection - dev-server teardown and tests. */
export const closeDb = (): void => {
  instance?.close();
  instance = undefined;
};

/** Run `fn` in a transaction. */
export const transaction = <T>(fn: () => T): T => db().transaction(fn)();
