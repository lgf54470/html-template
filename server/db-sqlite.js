/* ============================================================
 * db-sqlite.js — 本地 SQLite 驱动(node:sqlite 内置,零第三方依赖)
 * ------------------------------------------------------------
 * 使用 Node.js 内置 node:sqlite(需 Node >= 22.5;推荐 >= 23.4 免 flag)。
 * 数据库文件默认 sqlite.db(可用 SQLITE_PATH 覆盖)。
 * ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

/** 参数绑定兼容 node:sqlite:仅接受 null/string/number/BigInt */
function normalizeParams(params) {
  return (params || []).map(function (p) {
    if (p === null || p === undefined) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    if (typeof p === 'number' || typeof p === 'bigint') return p;
    return String(p);
  });
}

function init(opts) {
  let DatabaseSync;
  try {
    ({ DatabaseSync } = require('node:sqlite'));
  } catch (e) {
    throw new Error(
      '[db-sqlite] 当前 Node 版本不支持 node:sqlite(需要 >= 22.5,推荐 >= 23.4)。' +
        '请升级 Node,或设置 DB_DRIVER=turso 使用远程数据库。'
    );
  }

  const dbPath = opts.dbPath || 'sqlite.db';
  const dir = path.dirname(path.resolve(dbPath));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  if (opts.schema) db.exec(opts.schema);

  return {
    name: 'sqlite',
    path: dbPath,

    /** 查询 → 行数组(对象) */
    query(sql, params) {
      return db.prepare(sql).all(...normalizeParams(params));
    },

    /** 单行查询 → 对象或 null */
    get(sql, params) {
      return db.prepare(sql).get(...normalizeParams(params)) || null;
    },

    /** 写操作 → { changes, lastInsertRowid } */
    run(sql, params) {
      const r = db.prepare(sql).run(...normalizeParams(params));
      return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
    },

    close() {
      db.close();
    },
  };
}

module.exports = { init };
