import { createClient } from "@libsql/client";

const db = createClient({
  url: process.env.TURSO_URL,
  authToken: process.env.TURSO_TOKEN,
});

// ========================================
// テーブル作成
// ========================================
export async function initDb() {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS sessions (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      name      TEXT NOT NULL,
      joined_at INTEGER NOT NULL,
      left_at   INTEGER
    );
    CREATE TABLE IF NOT EXISTS block_logs (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      type      TEXT NOT NULL,
      player    TEXT,
      block     TEXT,
      entity    TEXT,
      killed_by TEXT,
      x         INTEGER NOT NULL,
      y         INTEGER NOT NULL,
      z         INTEGER NOT NULL,
      dimension TEXT NOT NULL DEFAULT 'minecraft:overworld',
      timestamp INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS message_queue (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      author     TEXT NOT NULL,
      content    TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);
}

// ========================================
// セッション系
// ========================================
export const Sessions = {
  async join(name, timestamp) {
    await db.execute({
      sql: `INSERT INTO sessions (name, joined_at) VALUES (?, ?)`,
      args: [name, timestamp],
    });
  },

  async leave(name, timestamp) {
    await db.execute({
      sql: `UPDATE sessions SET left_at = ?
            WHERE name = ? AND left_at IS NULL
            ORDER BY joined_at DESC LIMIT 1`,
      args: [timestamp, name],
    });
  },

  async getTotalPlaytime(name) {
    const now = Date.now();
    const res = await db.execute({
      sql: `SELECT joined_at, COALESCE(left_at, ?) as left_at FROM sessions WHERE name = ?`,
      args: [now, name],
    });
    return res.rows.reduce((sum, r) => sum + (Number(r.left_at) - Number(r.joined_at)), 0);
  },

  async getRanking() {
    const now = Date.now();
    const res = await db.execute({
      sql: `SELECT name, SUM(COALESCE(left_at, ?) - joined_at) AS total_ms
            FROM sessions GROUP BY name ORDER BY total_ms DESC LIMIT 20`,
      args: [now],
    });
    return res.rows;
  },

  async getOnline() {
    const res = await db.execute(`SELECT name, joined_at FROM sessions WHERE left_at IS NULL`);
    return res.rows;
  },
};

// ========================================
// ブロックログ系
// ========================================
export const BlockLogs = {
  async insert(data) {
    await db.execute({
      sql: `INSERT INTO block_logs (type, player, block, entity, killed_by, x, y, z, dimension, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        data.type, data.player ?? null, data.block ?? null,
        data.entity ?? null, data.killedBy ?? null,
        data.x, data.y, data.z,
        data.dimension ?? "minecraft:overworld", data.timestamp,
      ],
    });
  },

  async queryByCoord(x, y, z, radius = 0) {
    const res = await db.execute({
      sql: `SELECT * FROM block_logs
            WHERE x BETWEEN ? AND ? AND y BETWEEN ? AND ? AND z BETWEEN ? AND ?
            ORDER BY timestamp DESC LIMIT 50`,
      args: [x - radius, x + radius, y - radius, y + radius, z - radius, z + radius],
    });
    return res.rows;
  },

  async queryByPlayer(name, limit = 20) {
    const res = await db.execute({
      sql: `SELECT * FROM block_logs WHERE player = ? ORDER BY timestamp DESC LIMIT ?`,
      args: [name, limit],
    });
    return res.rows;
  },

  async getLastAction(x, y, z) {
    const res = await db.execute({
      sql: `SELECT * FROM block_logs WHERE x = ? AND y = ? AND z = ? ORDER BY timestamp DESC LIMIT 1`,
      args: [x, y, z],
    });
    return res.rows[0] ?? null;
  },
};

// ========================================
// メッセージキュー（Discord→MC）
// ========================================
export const MessageQueue = {
  async push(author, content) {
    await db.execute({
      sql: `INSERT INTO message_queue (author, content, created_at) VALUES (?, ?, ?)`,
      args: [author, content, Date.now()],
    });
  },

  async flush() {
    const res = await db.execute(`SELECT * FROM message_queue ORDER BY created_at ASC`);
    if (res.rows.length > 0) {
      await db.execute(`DELETE FROM message_queue`);
    }
    return res.rows;
  },
};
