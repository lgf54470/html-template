/* ============================================================
 * db/index.js — 数据库驱动工厂(零第三方依赖)
 * ------------------------------------------------------------
 * 统一驱动接口:
 *   query(sql, params)  -> 行数组(对象)
 *   run(sql, params)    -> { changes, lastInsertRowid }
 *
 * 通过环境变量 DB_DRIVER 选择驱动(适配器位于本目录):
 *   sqlite  ./sqlite.js  本地 SQLite(node:sqlite 内置,路径 SQLITE_PATH,默认 sqlite.db)
 *   turso   ./turso.js   远程 Turso/libSQL HTTP API(DATABASE_URL + DATABASE_AUTH_TOKEN)
 *   d1      ./d1.js      Cloudflare D1(Worker 内原生 binding;本地走 D1 REST API,
 *                         需要 D1_ACCOUNT_ID / D1_DATABASE_ID / D1_API_TOKEN)
 *
 * 建表语句统一来自 ./schema.js;适配器各自负责参数绑定与行数据形状,
 * 业务代码只依赖本接口。
 * ============================================================ */
'use strict';

const path = require('path');
const { SCHEMA } = require('./schema');

const DRIVERS = { sqlite: 'sqlite', turso: 'turso', d1: 'd1' };

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

/** 是否使用本地 sqlite(用于首启提示) */
function isLocalSqlite() {
  return (process.env.DB_DRIVER || 'sqlite').toLowerCase() === 'sqlite';
}

module.exports = { getDb, SCHEMA, localDbPath, isLocalSqlite };
