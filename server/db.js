/* ============================================================
 * db.js — 数据库驱动工厂(零第三方依赖)
 * ------------------------------------------------------------
 * 统一驱动接口(两个方法):
 *   query(sql, params)  -> 行数组(对象)
 *   run(sql, params)    -> { changes, lastInsertRowid }
 *
 * 通过环境变量选择驱动:
 *   DB_DRIVER=sqlite (默认)  本地 SQLite(node:sqlite 内置,路径 SQLITE_PATH,默认 sqlite.db)
 *   DB_DRIVER=turso          远程 Turso/libSQL HTTP API(DATABASE_URL + DATABASE_AUTH_TOKEN)
 *   DB_DRIVER=d1             Cloudflare D1(Worker 内用原生 binding;本地走 D1 REST API,
 *                            需要 D1_ACCOUNT_ID / D1_DATABASE_ID / D1_API_TOKEN,见 docs/deploy/cloudflare.md)
 *
 * 适配器各自负责参数绑定与行数据形状的统一,业务代码只依赖本接口。
 * ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const DRIVERS = { sqlite: 'db-sqlite', turso: 'db-turso', d1: 'db-d1' };

function loadAdapter() {
  const driver = (process.env.DB_DRIVER || 'sqlite').toLowerCase();
  const file = DRIVERS[driver];
  if (!file) {
    throw new Error(
      '[db] 未知 DB_DRIVER: ' + driver + '(可选: ' + Object.keys(DRIVERS).join(' / ') + ')'
    );
  }
  const mod = require('./' + file);
  if (!mod || typeof mod.init !== 'function') {
    throw new Error('[db] 驱动 ' + file + ' 未导出 init()');
  }
  return mod;
}

/** 建表(与驱动无关的通用 schema;驱动可在 init 中先建库) */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash TEXT PRIMARY KEY,  -- 会话令牌的 SHA-256 哈希,绝不存明文令牌
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT,
  note       TEXT
);
`;

let db = null;

/** 初始化并返回驱动实例(单例) */
function getDb() {
  if (db) return db;
  const adapter = loadAdapter();
  db = adapter.init({ schema: SCHEMA, dbPath: process.env.SQLITE_PATH || path.join(process.cwd(), 'sqlite.db') });
  return db;
}

/** 数据库文件路径(sqlite 驱动用;远程驱动返回 null) */
function localDbPath() {
  return (process.env.DB_DRIVER || 'sqlite').toLowerCase() === 'sqlite'
    ? process.env.SQLITE_PATH || path.join(process.cwd(), 'sqlite.db')
    : null;
}

/** 是否使用本地 sqlite(用于首启密码落盘提示) */
function isLocalSqlite() {
  return (process.env.DB_DRIVER || 'sqlite').toLowerCase() === 'sqlite';
}

module.exports = { getDb, SCHEMA, localDbPath, isLocalSqlite };
