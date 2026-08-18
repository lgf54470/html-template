/* ============================================================
 * deno/main.js — Deno Deploy 入口(dynamic 模式:静态资源 + 鉴权 API + Turso)
 * ------------------------------------------------------------
 * 与根目录 dev-server.js 职责一一对应,按 Deno Deploy 运行时适配:
 *   - 静态资源:Deno Deploy 的 dynamic 模式没有独立的静态层,全部请求
 *     都进入本入口,由本文件直接读取部署包内的 index.html / js / assets 返回
 *   - API:登录 / 校验 / 登出 / 设置 KV,逻辑复用 server/api.js —— 经
 *     node:module 的 createRequire 加载 CommonJS(与 dev-server.js /
 *     api/index.js 完全同一份实现,不重复第三处逻辑)
 *   - 数据库:Turso(HTTP v2 pipeline),驱动 server/db-turso.js
 *   - 密码校验:登录密码与 secret AUTH_PASSWORD 常量时间比较(server/auth.js)
 *   - 敏感键加密:AES-256-GCM,存储格式与 server/crypto.js 一致(enc:v1:...)
 *
 * 环境变量(在 Deno Deploy 控制台 App → Environment variables 配置,
 * 或用 `deno deploy env add <名称> <值> [--secret]` 设置,见 docs/deploy/deno.md):
 *   DB_DRIVER=turso   驱动(未设置时本文件默认 turso —— Deno 运行时无 node:sqlite)
 *   DATABASE_URL / DATABASE_AUTH_TOKEN  Turso 连接信息
 *   AUTH_PASSWORD      登录密码(必设;缺失时登录直接报错,绝不生成随机密码)
 *   ENCRYPTION_KEY     敏感数据加密密钥,64 位 hex(生产必设;缺失时报错)
 *
 * 注意:修改本文件的鉴权 / 设置逻辑时,请同步 server/api.js(或反之)。
 * 完整部署说明见 docs/deploy/deno.md。
 * ============================================================ */

import { createRequire } from 'node:module';
import { extname, join, resolve, sep } from 'node:path';

/* ---------- 数据库驱动:Deno 无 node:sqlite,DB_DRIVER 未设置时默认走 Turso ---------- */
if (!Deno.env.get('DB_DRIVER')) Deno.env.set('DB_DRIVER', 'turso');

/* ---------- 复用共享 CommonJS 实现(与 dev-server.js / api/index.js 同一份逻辑) ---------- */
const require = createRequire(import.meta.url);
const { getDb, SCHEMA } = require('../server/db.js');
const { encrypt, decrypt } = require('../server/crypto.js');
const { verifyPassword } = require('../server/auth.js');
const { createApiHandler } = require('../server/api.js');

/* ---------- 静态资源根目录:部署包内的仓库根目录(deno/ 的上一级) ---------- */
const ROOT = resolve(import.meta.dirname, '..');

/* ---------- 数据库(单例,每个 isolate 一份;懒初始化:缺环境变量时不拖垮整进程) ---------- */
let _db = null;
function getDbSafe() {
  if (!_db) _db = getDb();
  return _db;
}

/* 首次请求建表(幂等,每 isolate 一次);失败后允许下次请求重试 */
let _boot = null;
function boot() {
  if (!_boot) {
    _boot = getDbSafe()
      .initSchema(SCHEMA)
      .catch((e) => {
        _boot = null;
        throw e;
      });
  }
  return _boot;
}

/* API 处理器:db 实例就绪后再创建(createApiHandler 会捕获 db 引用) */
let _handler = null;
function getApiHandler() {
  if (!_handler) {
    _handler = createApiHandler({ db: getDbSafe(), encrypt, decrypt, verifyPassword });
  }
  return _handler;
}

/* ---------- Web Request → Node 风格 req(server/api.js 的 readBody 依赖事件) ---------- */
function makeNodeReq(request) {
  const headers = {};
  for (const [k, v] of request.headers) headers[k.toLowerCase()] = v;
  const listeners = { data: [], end: [], error: [] };
  const req = {
    method: request.method,
    headers,
    on(ev, cb) {
      if (Array.isArray(listeners[ev])) listeners[ev].push(cb);
      return req;
    },
  };
  // 延迟到微任务再消费请求体:handleApi 会同步挂载 data/end 监听器,顺序安全。
  // ⚠ request.body 产出 Uint8Array,而 server/api.js 的 readBody 按 Node Buffer 语义做
  // `data += chunk`(字符串拼接),因此这里必须先用 TextDecoder 转成字符串再发出。
  queueMicrotask(async () => {
    try {
      const decoder = new TextDecoder();
      if (request.body) {
        for await (const chunk of request.body) {
          const text = decoder.decode(chunk, { stream: true });
          if (text) listeners.data.forEach((cb) => cb(text));
        }
        const tail = decoder.decode(); // 冲刷跨块残余的多字节字符
        if (tail) listeners.data.forEach((cb) => cb(tail));
      }
      listeners.end.forEach((cb) => cb());
    } catch (e) {
      listeners.error.forEach((cb) => cb(e));
    }
  });
  return req;
}

/* ---------- Node 风格 res → Web Response ---------- */
function makeNodeRes() {
  let status = 200;
  const headers = {};
  const res = {
    writeHead(s, h) {
      status = s;
      if (h) Object.assign(headers, h);
    },
    end(body) {
      res._body = body;
    },
    toResponse() {
      return new Response(res._body, { status, headers });
    },
  };
  return res;
}

/* ---------- 静态资源(与 dev-server.js 的 serveStatic 行为一致) ---------- */
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

async function serveStatic(pathname) {
  const rel = pathname === '/' ? '/index.html' : pathname;
  let filePath = resolve(ROOT, '.' + rel);
  // 防目录穿越:解析后的路径必须仍在 ROOT 内
  if (filePath !== ROOT && !filePath.startsWith(ROOT + sep)) {
    return new Response('Forbidden', { status: 403 });
  }
  let data = null;
  try {
    data = await Deno.readFile(filePath);
  } catch {
    try {
      filePath = join(filePath, 'index.html'); // 目录 → index.html
      data = await Deno.readFile(filePath);
    } catch {
      return new Response('Not Found', {
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
  }
  return new Response(data, {
    status: 200,
    headers: {
      'Content-Type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    },
  });
}

/* ---------- 入口 ---------- */
function isApiPath(pathname) {
  return pathname === '/api' || pathname.startsWith('/api/');
}

async function handleRequest(request) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  if (isApiPath(pathname)) {
    const res = makeNodeRes();
    try {
      await boot();
      await getApiHandler()(makeNodeReq(request), res, pathname);
    } catch (e) {
      console.error('[deno] API 处理异常: ' + pathname + '\n' + ((e && e.stack) || e));
      if (!res._body) {
        res.writeHead(500, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        res.end(JSON.stringify({ error: 'internal', message: String((e && e.message) || e) }));
      }
    }
    return res.toResponse();
  }

  return serveStatic(pathname);
}

/* Deno Deploy(dynamic 模式)入口:平台注入端口,Deno.serve 即可 */
Deno.serve(handleRequest);
