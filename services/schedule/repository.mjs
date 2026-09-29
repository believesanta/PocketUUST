import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export class Repository {
  constructor(filename, namespace) {
    mkdirSync(dirname(filename), { recursive: true })
    this.namespace = namespace
    this.db = new DatabaseSync(filename)
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS resources (
        namespace TEXT NOT NULL, resource_key TEXT NOT NULL,
        payload TEXT NOT NULL, expires_at INTEGER NOT NULL,
        accessed_at INTEGER NOT NULL,
        PRIMARY KEY (namespace, resource_key)
      );
      CREATE TABLE IF NOT EXISTS failures (
        namespace TEXT NOT NULL, resource_key TEXT NOT NULL,
        message TEXT NOT NULL, retry_at INTEGER NOT NULL,
        PRIMARY KEY (namespace, resource_key)
      );
      CREATE TABLE IF NOT EXISTS room_links (
        namespace TEXT NOT NULL, upstream_room_id INTEGER NOT NULL,
        map_room_id TEXT NOT NULL,
        PRIMARY KEY (namespace, upstream_room_id)
      );
      CREATE TABLE IF NOT EXISTS watched_groups (
        namespace TEXT NOT NULL, group_id INTEGER NOT NULL,
        period_id INTEGER NOT NULL, last_requested_at INTEGER NOT NULL,
        PRIMARY KEY (namespace, group_id, period_id)
      );
      CREATE TABLE IF NOT EXISTS group_import (
        namespace TEXT NOT NULL, period_id INTEGER NOT NULL, group_id INTEGER NOT NULL,
        generation TEXT NOT NULL, synced_at INTEGER NOT NULL DEFAULT 0,
        retry_at INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (namespace, period_id, group_id)
      );
      CREATE INDEX IF NOT EXISTS group_import_due
        ON group_import(namespace, period_id, retry_at, synced_at);
    `)
  }

  get(key) {
    const row = this.db.prepare('SELECT payload, expires_at FROM resources WHERE namespace=? AND resource_key=?').get(this.namespace, key)
    return row ? { payload: JSON.parse(row.payload), expiresAt: row.expires_at } : null
  }

  save(key, payload, expiresAt, now) {
    const json = JSON.stringify(payload)
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db.prepare(`INSERT INTO resources VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(namespace, resource_key) DO UPDATE SET
        payload=excluded.payload, expires_at=excluded.expires_at`).run(this.namespace, key, json, expiresAt, now)
      this.db.prepare('DELETE FROM failures WHERE namespace=? AND resource_key=?').run(this.namespace, key)
      this.db.exec('COMMIT')
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }

  touch(key, now) {
    this.db.prepare('UPDATE resources SET accessed_at=? WHERE namespace=? AND resource_key=? AND accessed_at<?')
      .run(now, this.namespace, key, now - 60000)
  }

  failure(key) {
    return this.db.prepare('SELECT message, retry_at FROM failures WHERE namespace=? AND resource_key=?').get(this.namespace, key) ?? null
  }

  recordFailure(key, message, retryAt) {
    this.db.prepare(`INSERT INTO failures VALUES (?, ?, ?, ?)
      ON CONFLICT(namespace, resource_key) DO UPDATE SET message=excluded.message, retry_at=excluded.retry_at`)
      .run(this.namespace, key, message, retryAt)
  }

  due(now) {
    return this.db.prepare(`SELECT r.resource_key FROM resources r
      LEFT JOIN failures f ON f.namespace=r.namespace AND f.resource_key=r.resource_key
      WHERE r.namespace=? AND r.expires_at<=? AND r.accessed_at>=?
      AND COALESCE(f.retry_at,0)<=? ORDER BY r.expires_at LIMIT 100`)
      .all(this.namespace, now, now - 7 * 86400000, now).map((row) => row.resource_key)
  }

  watchGroup(groupId, periodId, now) {
    this.db.prepare(`INSERT INTO watched_groups VALUES (?, ?, ?, ?)
      ON CONFLICT(namespace, group_id, period_id) DO UPDATE SET
      last_requested_at=excluded.last_requested_at`)
      .run(this.namespace, groupId, periodId, now)
  }

  watchedGroups(now, periodId) {
    return this.db.prepare(`SELECT group_id FROM watched_groups
      WHERE namespace=? AND period_id=? AND last_requested_at>=?
      ORDER BY last_requested_at DESC LIMIT 100`)
      .all(this.namespace, periodId, now - 30 * 86400000)
      .map((row) => row.group_id)
  }

  knownGroups(periodId) {
    return this.db.prepare(`SELECT group_id FROM watched_groups
      WHERE namespace=? AND period_id=? ORDER BY group_id`)
      .all(this.namespace, periodId).map((row) => row.group_id)
  }

  prepareImport(records, periodId, generation, scheduleTtl) {
    const insert = this.db.prepare(`INSERT INTO group_import
      (namespace, period_id, group_id, generation, synced_at, retry_at)
      VALUES (?, ?, ?, ?, ?, 0)
      ON CONFLICT(namespace, period_id, group_id) DO UPDATE SET generation=excluded.generation`)
    const cached = this.db.prepare('SELECT expires_at FROM resources WHERE namespace=? AND resource_key=?')
    this.db.exec('BEGIN IMMEDIATE')
    try {
      for (const row of records) {
        const id = Number(row.group_id)
        const key = JSON.stringify({ kind: 'group', id, period: periodId })
        const snapshot = cached.get(this.namespace, key)
        insert.run(this.namespace, periodId, id, generation,
          snapshot ? Math.max(1, snapshot.expires_at - scheduleTtl * 1000) : 0)
      }
      this.db.prepare('DELETE FROM group_import WHERE namespace=? AND period_id=? AND generation<>?')
        .run(this.namespace, periodId, generation)
      this.db.exec('COMMIT')
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }

  nextImport(periodId, now, excluded = new Set()) {
    const rows = this.db.prepare(`SELECT group_id FROM group_import
      WHERE namespace=? AND period_id=? AND retry_at<=?
      AND (synced_at=0 OR synced_at<=?)
      ORDER BY CASE WHEN synced_at=0 AND retry_at=0 THEN 0
        WHEN synced_at=0 THEN 1 ELSE 2 END, synced_at, group_id
      LIMIT 20`).all(this.namespace, periodId, now, now - 86400000)
    return rows.find((row) => !excluded.has(row.group_id))?.group_id ?? null
  }

  importSuccess(id, periodId, now) {
    this.db.prepare('UPDATE group_import SET synced_at=?, retry_at=0 WHERE namespace=? AND period_id=? AND group_id=?')
      .run(now, this.namespace, periodId, id)
  }

  importFailure(id, periodId, retryAt) {
    this.db.prepare('UPDATE group_import SET retry_at=? WHERE namespace=? AND period_id=? AND group_id=?')
      .run(retryAt, this.namespace, periodId, id)
  }

  importProgress(periodId, now) {
    const row = this.db.prepare(`SELECT COUNT(*) AS total,
      SUM(CASE WHEN synced_at>0 THEN 1 ELSE 0 END) AS downloaded,
      SUM(CASE WHEN synced_at>=? THEN 1 ELSE 0 END) AS fresh,
      SUM(CASE WHEN retry_at>? THEN 1 ELSE 0 END) AS waiting_retry
      FROM group_import WHERE namespace=? AND period_id=?`)
      .get(now - 86400000, now, this.namespace, periodId)
    return { total: row.total, downloaded: row.downloaded ?? 0,
      fresh: row.fresh ?? 0, waiting_retry: row.waiting_retry ?? 0 }
  }

  seedWatchedGroups(now, periodId) {
    // Older versions had snapshots and failures but no watched_groups table.
    const recent = this.db.prepare(`
      SELECT resource_key FROM resources WHERE namespace=? AND accessed_at>=?
      UNION SELECT resource_key FROM failures WHERE namespace=? AND retry_at>=?
    `).all(this.namespace, now - 30 * 86400000, this.namespace, now - 30 * 86400000)
    for (const row of recent) {
      try {
        const resource = JSON.parse(row.resource_key)
        if (resource.kind === 'group' && resource.period === periodId
            && Number.isSafeInteger(resource.id) && resource.id > 0) {
          const imported = this.db.prepare(`SELECT 1 FROM group_import
            WHERE namespace=? AND period_id=? AND group_id=?`)
            .get(this.namespace, periodId, resource.id)
          if (imported) continue // Bulk imports are not user-selected groups.
          this.db.prepare(`INSERT OR IGNORE INTO watched_groups VALUES (?, ?, ?, ?)`)
            .run(this.namespace, resource.id, periodId, now)
        }
      } catch { /* Ignore a corrupt legacy key. */ }
    }
  }

  links() {
    return new Map(this.db.prepare('SELECT upstream_room_id, map_room_id FROM room_links WHERE namespace=?')
      .all(this.namespace).map((row) => [row.upstream_room_id, row.map_room_id]))
  }

  linkRoom(id, mapId) {
    this.db.prepare(`INSERT INTO room_links VALUES (?, ?, ?)
      ON CONFLICT(namespace, upstream_room_id) DO UPDATE SET map_room_id=excluded.map_room_id`)
      .run(this.namespace, id, mapId)
  }

  count() { return this.db.prepare('SELECT COUNT(*) AS n FROM resources WHERE namespace=?').get(this.namespace).n }
  backup(path) { this.db.prepare('VACUUM INTO ?').run(path) }
  close() { this.db.close() }
}
