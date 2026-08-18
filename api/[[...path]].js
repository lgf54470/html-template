/* ============================================================
 * api/[[...path]].js — Vercel 无服务器函数入口(全部 /api/* 请求)
 * ------------------------------------------------------------
 * 复用 server/api.js 的处理器(与本地 dev-server.js 完全一致),
 * 数据库走 Turso:DB_DRIVER=turso(未显式设置时默认 turso)+ DATABASE_URL + DATABASE_AUTH_TOKEN。
 *
 * Vercel 项目配置(见 DEPLOY-VERCEL.md):
 *   - Framework Preset:Other
 *   - Build Command:npm run build(生成 dist/ 静态目录)
 *   - Output Directory:dist
 *   - 环境变量:DATABASE_URL / DATABASE_AUTH_TOKEN / AUTH_PASSWORD / ENCRYPTION_KEY
 *
 * 部署方式:Vercel 控制台 Git 导入 / vercel CLI / GitHub Actions,任选其一。
 * ============================================================ */
'use strict';

// Vercel 函数默认使用 Turso;未显式设置 DB_DRIVER 时避免回退到 sqlite
//(serverless 只读文件系统无法打开本地库文件)。
if (!process.env.DB_DRIVER) process.env.DB_DRIVER = 'turso';

const { getDb, SCHEMA } = require('../server/db');
const { encrypt, decrypt } = require('../server/crypto');
const { AUTH_KEY, hashPassword, verifyPassword, ensureAuthPassword } = require('../server/auth');
const { createApiHandler, sendJson } = require('../server/api');
const log = require('../server/logger');

/* 数据库单例:每个 Lambda 实例一份(DB_DRIVER 必须是 turso,否则启动报错) */
const db = getDb();

/* 首次请求:建表 + 初始化管理员密码(幂等,每实例一次) */
let booted = false;
async function boot() {
  if (booted) return;
  await db.initSchema(SCHEMA);
  await ensureAuthPassword(db);
  booted = true;
}

const handleApi = createApiHandler({ db, authKey: AUTH_KEY, encrypt, decrypt, hashPassword, verifyPassword });

module.exports = async function handler(req, res) {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  try {
    await boot();
    await handleApi(req, res, pathname);
  } catch (e) {
    log.error('api', 'Vercel 函数处理异常: ' + pathname, e);
    if (!res.headersSent) {
      sendJson(res, 500, { error: 'internal', message: String((e && e.message) || e) });
    } else {
      res.end();
    }
  }
};
