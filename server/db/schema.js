/* ============================================================
 * schema.js — 数据库建表语句(单一事实来源)
 * ------------------------------------------------------------
 * 所有运行时的建表 SQL 都以本文件为准:
 *   - Node(dev-server.js / api/index.js)经 server/db/index.js 引用
 *   - Deno(deno/main.js)经 createRequire 引用
 *   - Cloudflare Worker(worker.js)直接 import(避免重复维护 SCHEMA)
 * ============================================================ */
'use strict';

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

module.exports = { SCHEMA };
