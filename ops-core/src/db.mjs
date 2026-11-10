import { DatabaseSync } from 'node:sqlite';

/**
 * SQLite 封装（node:sqlite）：迁移列表 → 版本化应用；upsert/setting 辅助。
 * 迁移按数组顺序执行，PRAGMA user_version 记账，可重复调用。
 */
export function openDatabase({ filePath = ':memory:', migrations = [] } = {}) {
  const db = new DatabaseSync(filePath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  function migrate() {
    const current = Number(db.prepare('PRAGMA user_version').get().user_version ?? 0);
    let applied = 0;
    for (const migration of migrations) {
      if (migration.version <= current) continue;
      db.exec('BEGIN');
      try {
        db.exec(migration.sql);
        db.exec(`PRAGMA user_version = ${Number(migration.version)}`);
        db.exec('COMMIT');
        applied += 1;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    }
    return { version: Number(db.prepare('PRAGMA user_version').get().user_version ?? 0), applied };
  }

  function upsert(table, row, conflictKeys) {
    const columns = Object.keys(row);
    const placeholders = columns.map(() => '?').join(', ');
    const updates = columns.filter((column) => !conflictKeys.includes(column)).map((column) => `${column} = excluded.${column}`);
    const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) ON CONFLICT (${conflictKeys.join(', ')}) DO UPDATE SET ${updates.join(', ')}`;
    return db.prepare(sql).run(...columns.map((column) => row[column]));
  }

  return { db, migrate, upsert, close: () => db.close() };
}

export function createSettingsStore(handle) {
  handle.db.exec('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)');
  return {
    get(key, fallback = null) {
      const row = handle.db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
      return row ? row.value : fallback;
    },
    set(key, value) {
      handle.db
        .prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
        .run(key, String(value), new Date().toISOString());
    },
  };
}
