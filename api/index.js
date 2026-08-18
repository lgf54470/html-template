/* ============================================================
 * api/index.js — Vercel 无服务器函数入口(全部 /api/* 请求)
 * ------------------------------------------------------------
 * 复用 server/api.js 的处理器(与本地 dev-server.js 完全一致),
 * 数据库走 Turso:DB_DRIVER=turso(未显式设置时默认 turso)+ DATABASE_URL + DATABASE_AUTH_TOKEN。
 *
 * 路由方式:Vercel 的 api/ 目录不支持括号 catch-all(实测 [[...path]].js /
 * [...path].js 都会被编译成单段匹配 ^/api/([^/]+)$,双段路径 404),
 * 因此用 vercel.json 的 rewrites 把 /api/:path* 全部转发到本函数:
 *   { "source": "/api/:path*", "destination": "/api/index" }
 * Vercel 转发时会自动把原始路径放进 ?path= 查询参数(如 /api/index?path=auth/login),
 * 见下方 resolveApiPath();若请求直接命中(无 rewrite)也能按原 URL 工作。
 *
 * Vercel 项目配置(见 docs/deploy/vercel.md):
 *   - vercel.json 已内置 framework=null / buildCommand / outputDirectory / rewrites,
 *     控制台无需额外配置,三种部署方式(控制台 Git 导入 / vercel CLI / GitHub Actions)行为一致。
 *   - 环境变量:DATABASE_URL / DATABASE_AUTH_TOKEN / AUTH_PASSWORD / ENCRYPTION_KEY
 * ============================================================ */
'use strict';

// Vercel 函数默认使用 Turso;未显式设置 DB_DRIVER 时避免回退到 sqlite
//(serverless 只读文件系统无法打开本地库文件)。
if (!process.env.DB_DRIVER) process.env.DB_DRIVER = 'turso';

const { getDb, SCHEMA } = require('../server/db');
const { encrypt, decrypt } = require('../server/crypto');
const { verifyPassword } = require('../server/auth');
const { createApiHandler, sendJson } = require('../server/api');
const log = require('../server/logger');

/* 数据库单例:每个 Lambda 实例一份(DB_DRIVER 必须是 turso,否则启动报错) */
const db = getDb();

/* 首次请求:建表(幂等,每实例一次);密码由 AUTH_PASSWORD 环境变量直接校验 */
let booted = false;
async function boot() {
  if (booted) return;
  await db.initSchema(SCHEMA);
  booted = true;
}

/**
 * 还原 API 路径。Vercel rewrite 会把原始路径放到 ?path= 查询参数
 *(如 /api/index?path=auth/login);直接命中时 req.url 即为原始路径。
 */
function resolveApiPath(req) {
  const u = new URL(req.url, 'http://localhost');
  let p = u.pathname;
  if (p === '/api/index' || p === '/api' || p === '/api/') {
    const q = (u.searchParams.get('path') || '').replace(/^\/+/, '');
    if (q) p = '/api/' + q;
  }
  return p;
}

const handleApi = createApiHandler({ db, encrypt, decrypt, verifyPassword });

module.exports = async function handler(req, res) {
  const pathname = resolveApiPath(req);
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
