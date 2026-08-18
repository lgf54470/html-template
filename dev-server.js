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
 * API 逻辑在 server/api.js(与 Vercel 函数 api/index.js 共用),
 * 密码哈希与初始化在 server/auth.js。
 *
 * ⚠ 文件名不能是 server.js:Vercel 会把根目录的 server.{js,cjs,mjs,ts}
 *   自动捕获为 Node.js 自定义服务器入口,接管全部请求(见 docs/deploy/vercel.md)。
 *   Cloudflare 部署用 worker.js,Vercel 部署用 api/index.js,本文件只供本地/自托管。
 *
 * 数据库表与命名规范见 README「数据库设计」。
 * ============================================================ */
'use strict';

require('./server/env'); // 零依赖 .env 加载(须在任何 env 读取之前)

const http = require('http');
const fs = require('fs');
const path = require('path');
const { getDb, isLocalSqlite, localDbPath, SCHEMA } = require('./server/db');
const { encrypt, decrypt } = require('./server/crypto');
const { verifyPassword } = require('./server/auth');
const { createApiHandler, sendJson } = require('./server/api');
const log = require('./server/logger');

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

/* ---------- 静态资源 ---------- */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  let filePath = path.resolve(ROOT, '.' + rel);
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.stat(filePath, (err, st) => {
    if (!err && st.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
    fs.readFile(filePath, (err2, data) => {
      if (err2) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Not Found');
      }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(data);
    });
  });
}

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
        sendJson(res, 500, { error: 'internal', message: String((e && e.message) || e) });
        done(500);
      });
    return;
  }
  const origEnd = res.end;
  res.end = function () {
    done(res.statusCode || 200);
    return origEnd.apply(this, arguments);
  };
  serveStatic(req, res, url.pathname);
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
