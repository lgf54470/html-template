/* ============================================================
 * dev-server.js — 零依赖 Node 服务器(静态资源 + 鉴权 API + 数据库)
 * ------------------------------------------------------------
 * 运行:node dev-server.js [端口]
 * 环境变量:
 *   PORT              端口(默认 3000)
 *   AUTH_PASSWORD     登录密码(必设;与平台环境变量直接校验,无随机初始密码)
 *   SQLITE_PATH       本地 sqlite 文件路径(默认 sqlite.db)
 *   DB_DRIVER         sqlite(默认) / turso(DATABASE_URL + DATABASE_AUTH_TOKEN) / d1(见 docs/deploy/cloudflare.md)
 *
 * 各层职责已拆分到 server/ 下:
 *   server/config/env.js       .env 加载
 *   server/db/                 数据库驱动工厂 + schema + 各驱动
 *   server/auth/ + security/   鉴权与加密(与 worker.js 共用纯逻辑)
 *   server/api/                共享 API 处理器(路由按域拆分)
 *   server/http/               JSON / 静态资源服务
 *   server/logging/logger.js   终端日志
 *
 * ⚠ 文件名不能是 server.js:Vercel 会把根目录的 server.{js,cjs,mjs,ts}
 *   自动捕获为 Node.js 自定义服务器入口,接管全部请求(见 docs/deploy/vercel.md)。
 *   Cloudflare 部署用 worker.js,Vercel 部署用 api/index.js,本文件只供本地/自托管。
 *
 * 数据库表与命名规范见 README「数据库设计」。
 * ============================================================ */
'use strict';

require('./server/config/env'); // 零依赖 .env 加载(须在任何 env 读取之前)

const http = require('http');
const { getDb, isLocalSqlite, localDbPath, SCHEMA } = require('./server/db');
const { encrypt, decrypt } = require('./server/security');
const { verifyPassword } = require('./server/auth');
const { createApiHandler, sendJson } = require('./server/api');
const { serveStatic } = require('./server/http/static');
const log = require('./server/logging/logger');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = process.cwd();

/* ---------- 数据库初始化 ---------- */
const db = getDb();

async function bootstrap() {
  if (db.initSchema && typeof db.initSchema === 'function') {
    // 远程驱动:异步建表
    await db.initSchema(SCHEMA);
  }
  return db;
}

/* ---------- API 处理器(与 Vercel 函数共用同一实现) ---------- */
const handleApi = createApiHandler({ db, encrypt, decrypt, verifyPassword });

/* ---------- 启动 ---------- */
const server = http.createServer((req, res) => {
  const start = Date.now();
  const url = new URL(req.url, 'http://localhost');
  const isApi = url.pathname === '/api' || url.pathname.startsWith('/api/');
  const done = (status) => log.request(req.method, url.pathname, status, Date.now() - start, { api: isApi });
  if (isApi) {
    handleApi(req, res, url.pathname)
      .then(() => done(res.statusCode || 200))
      .catch((e) => {
        log.error('api', '接口处理异常: ' + url.pathname, e);
        sendJson(res, 500, { error: 'internal', message: '服务器内部错误' });
        done(500);
      });
    return;
  }
  const origEnd = res.end;
  res.end = function () {
    done(res.statusCode || 200);
    return origEnd.apply(this, arguments);
  };
  serveStatic(req, res, url.pathname, ROOT);
});

function start() {
  return bootstrap()
    .then(() => {
      server.listen(PORT, () => {
        const dbPath = isLocalSqlite() ? localDbPath() : 'DB_DRIVER=' + (process.env.DB_DRIVER || 'sqlite');
        log.divider();
        log.info('server', '服务已启动: http://127.0.0.1:' + PORT);
        log.info('db', '数据库: ' + dbPath);
        log.info('server', '静态目录: ' + ROOT);
        log.divider();
      });
    })
    .catch((e) => {
      log.error('db', '数据库初始化失败', e);
      process.exit(1);
    });
}

// 仅在直接运行时启动(require.main === module);被作为模块 require 时不监听端口,
// 避免被平台(如 Vercel 的 server.{js,..} 自动捕获)当作自定义服务器入口。
if (require.main === module) {
  start();
}
