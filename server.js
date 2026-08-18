/* ============================================================
 * server.js — 零依赖 Node 服务器(静态资源 + 鉴权 API + 数据库)
 * ------------------------------------------------------------
 * 运行:node server.js [端口]
 * 环境变量:
 *   PORT              端口(默认 3000)
 *   AUTH_PASSWORD     首次启动时用于初始化管理员密码(不设则自动生成并打印)
 *   SQLITE_PATH       本地 sqlite 文件路径(默认 sqlite.db)
 *   DB_DRIVER         sqlite(默认) / turso(DATABASE_URL + DATABASE_AUTH_TOKEN)
 *
 * API(除 /api/auth/login 外均需请求头 x-auth-token):
 *   POST   /api/auth/login     { password, expiry }  -> { token, expiresAt }
 *   GET    /api/auth/verify                            -> { ok: true }
 *   POST   /api/auth/logout                            登出(删除会话)
 *   POST   /api/auth/password  { currentPassword, newPassword } 修改密码
 *   GET    /api/settings                               全部 app_settings(KV)
 *   PUT    /api/settings       { settings: { key: value } }  批量写入
 *   DELETE /api/settings       { keys: [ ... ] }       删除
 *
 * 数据库表与命名规范见 README「数据库设计」。
 * ============================================================ */
'use strict';

require('./server/env'); // 零依赖 .env 加载(须在任何 env 读取之前)

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getDb, isLocalSqlite, localDbPath } = require('./server/db');
const { encrypt, decrypt } = require('./server/crypto');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = process.cwd();
const AUTH_KEY = 'settings:auth:password';

/* ---------- 会话失效时长(ms);'browser'= 下一次浏览器打开 ---------- */
const EXPIRY_MS = {
  '3h': 3 * 3600e3,
  '6h': 6 * 3600e3,
  '9h': 9 * 3600e3,
  '12h': 12 * 3600e3,
  '24h': 24 * 3600e3,
  '7d': 7 * 86400e3,
  '14d': 14 * 86400e3,
  '30d': 30 * 86400e3,
  // 浏览器会话:服务端 30 天上限兜底,真正"关浏览器即失效"由客户端 sessionStorage 保证
  browser: 30 * 86400e3,
};

/* ---------- 密码哈希(scrypt) ---------- */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const N = 16384, r = 8, p = 1;
  const hash = crypto.scryptSync(password, salt, 64, { N, r, p }).toString('hex');
  return 'scrypt$' + N + '$' + r + '$' + p + '$' + salt + '$' + hash;
}

function verifyPassword(password, stored) {
  if (!stored) return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, salt, expected] = parts;
  try {
    const hash = crypto.scryptSync(password, salt, 64, {
      N: Number(N), r: Number(r), p: Number(p),
    });
    const a = Buffer.from(hash.toString('hex'));
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch (e) {
    return false;
  }
}

/* ---------- 首次启动:初始化管理员密码 ---------- */
function ensureAuthPassword(db) {
  const row = db.get('SELECT value FROM app_settings WHERE key = ?', [AUTH_KEY]);
  if (row) return false;
  const initial = process.env.AUTH_PASSWORD || randomPassword();
  db.run(
    'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\')',
    [AUTH_KEY, hashPassword(initial)],
  );
  console.log('==================================================');
  console.log('  首次启动:已初始化管理员密码');
  console.log('  密码: ' + initial);
  console.log('  请登录后立即在 设置 → 账号 修改(或使用 POST /api/auth/password)');
  console.log('  (可用环境变量 AUTH_PASSWORD 预置初始密码)');
  console.log('==================================================');
  return true;
}

function randomPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#%';
  let s = '';
  for (let i = 0; i < 14; i++) s += chars[crypto.randomInt(chars.length)];
  return s;
}

/* ---------- 数据库初始化 ---------- */
const db = getDb();

async function bootstrap() {
  if (db.initSchema && typeof db.initSchema === 'function') {
    // 远程驱动:异步建表后再初始化密码
    await db.initSchema(require('./server/db').SCHEMA);
  }
  ensureAuthPassword(db);
  return db;
}

/* ---------- 会话(数据库只存令牌哈希,不存明文) ---------- */
function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function getSession(token) {
  if (!token) return null;
  const hash = sha256(token);
  const row = db.get('SELECT * FROM auth_sessions WHERE token_hash = ?', [hash]);
  if (!row) return null;
  if (row.expires_at && Date.parse(row.expires_at) <= Date.now()) {
    db.run('DELETE FROM auth_sessions WHERE token_hash = ?', [hash]);
    return null;
  }
  return row;
}

/* ---------- HTTP 工具 ---------- */
function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e6) reject(new Error('body too large')); });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function authed(req, res) {
  const session = getSession(req.headers['x-auth-token']);
  if (!session) {
    sendJson(res, 401, { error: 'unauthorized', message: '登录已失效,请重新登录' });
    return null;
  }
  return session;
}

const RESERVED_SETTINGS_PREFIX = 'settings:auth:'; // 鉴权相关键禁止通过通用 KV 接口写入

/* ---------- 敏感键值:落库前 AES-256-GCM 加密,读取时解密 ---------- */
const SENSITIVE_WORDS = ['password', 'email', 'apikey', 'api_key', 'secret', 'token', 'credential', 'access_key'];

/** 键名含敏感词,或整体为含敏感字段的配置块(如 settings:profile 含邮箱) */
function isSensitiveKey(key) {
  if (key === 'settings:profile') return true;
  const lower = String(key).toLowerCase();
  return SENSITIVE_WORDS.some(function (w) { return lower.indexOf(w) !== -1; });
}

/* ---------- API 路由 ---------- */
async function handleApi(req, res, pathname) {
  const method = req.method;
  const parts = pathname.split('/').filter(Boolean); // ['api', ...]

  // POST /api/auth/login
  if (method === 'POST' && parts[1] === 'auth' && parts[2] === 'login') {
    let body;
    try { body = await readBody(req); } catch (e) { return sendJson(res, 400, { error: 'bad_json' }); }
    const password = typeof body.password === 'string' ? body.password : '';
    const expiry = typeof body.expiry === 'string' ? body.expiry : '24h';
    const ttl = EXPIRY_MS[expiry];
    if (!ttl) return sendJson(res, 400, { error: 'bad_expiry', message: '不支持的失效选项' });
    const row = db.get('SELECT value FROM app_settings WHERE key = ?', [AUTH_KEY]);
    if (!verifyPassword(password, row && row.value)) {
      return sendJson(res, 401, { error: 'bad_password', message: '密码错误' });
    }
    const token = crypto.randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + ttl).toISOString();
    // 数据库仅存 SHA-256 哈希,明文令牌只在响应中返回给客户端
    db.run('INSERT INTO auth_sessions (token_hash, expires_at, note) VALUES (?, ?, ?)', [sha256(token), expiresAt, expiry]);
    return sendJson(res, 200, { token, expiresAt, expiry });
  }

  const session = authed(req, res);
  if (!session) return;

  // GET /api/auth/verify
  if (method === 'GET' && parts[1] === 'auth' && parts[2] === 'verify') {
    return sendJson(res, 200, { ok: true, expiry: session.note });
  }

  // POST /api/auth/logout
  if (method === 'POST' && parts[1] === 'auth' && parts[2] === 'logout') {
    db.run('DELETE FROM auth_sessions WHERE token_hash = ?', [sha256(req.headers['x-auth-token'])]);
    return sendJson(res, 200, { ok: true });
  }

  // POST /api/auth/password
  if (method === 'POST' && parts[1] === 'auth' && parts[2] === 'password') {
    let body;
    try { body = await readBody(req); } catch (e) { return sendJson(res, 400, { error: 'bad_json' }); }
    const row = db.get('SELECT value FROM app_settings WHERE key = ?', [AUTH_KEY]);
    if (!verifyPassword(String(body.currentPassword || ''), row && row.value)) {
      return sendJson(res, 401, { error: 'bad_password', message: '当前密码错误' });
    }
    const np = String(body.newPassword || '');
    if (np.length < 6) return sendJson(res, 400, { error: 'weak_password', message: '新密码至少 6 位' });
    db.run(
      'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\')',
      [AUTH_KEY, hashPassword(np)],
    );
    // 修改密码后吊销全部既有会话
    db.run('DELETE FROM auth_sessions');
    return sendJson(res, 200, { ok: true });
  }

  // GET /api/settings(保留键 settings:auth:* 不返回;敏感键解密后返回)
  if (method === 'GET' && parts[1] === 'settings') {
    const rows = db.query('SELECT key, value FROM app_settings ORDER BY key');
    const out = {};
    rows.forEach((r) => {
      if (r.key.indexOf(RESERVED_SETTINGS_PREFIX) === 0) return;
      out[r.key] = isSensitiveKey(r.key) ? (decrypt(r.value) || '') : r.value;
    });
    return sendJson(res, 200, out);
  }

  // PUT /api/settings
  if (method === 'PUT' && parts[1] === 'settings') {
    let body;
    try { body = await readBody(req); } catch (e) { return sendJson(res, 400, { error: 'bad_json' }); }
    const entries = body && typeof body.settings === 'object' ? body.settings : null;
    if (!entries) return sendJson(res, 400, { error: 'bad_body', message: '需要 { settings: {...} }' });
    const keys = Object.keys(entries);
    for (const k of keys) {
      if (k.indexOf(RESERVED_SETTINGS_PREFIX) === 0) {
        return sendJson(res, 403, { error: 'reserved_key', message: k + ' 为保留键,请走专用鉴权接口' });
      }
    }
    const now = new Date().toISOString();
    for (const k of keys) {
      let v = typeof entries[k] === 'string' ? entries[k] : JSON.stringify(entries[k]);
      // 敏感键:落库前加密,数据库不以明文存放
      if (isSensitiveKey(k)) v = encrypt(v);
      db.run(
        'INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
        [k, v, now],
      );
    }
    return sendJson(res, 200, { ok: true, written: keys.length });
  }

  // DELETE /api/settings
  if (method === 'DELETE' && parts[1] === 'settings') {
    let body;
    try { body = await readBody(req); } catch (e) { return sendJson(res, 400, { error: 'bad_json' }); }
    const keys = Array.isArray(body && body.keys) ? body.keys : [];
    for (const k of keys) {
      if (k.indexOf(RESERVED_SETTINGS_PREFIX) === 0) {
        return sendJson(res, 403, { error: 'reserved_key', message: k + ' 为保留键' });
      }
      db.run('DELETE FROM app_settings WHERE key = ?', [k]);
    }
    return sendJson(res, 200, { ok: true, removed: keys.length });
  }

  return sendJson(res, 404, { error: 'not_found' });
}

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
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    handleApi(req, res, url.pathname).catch((e) => {
      console.error('[server] API 错误', e);
      sendJson(res, 500, { error: 'internal', message: String((e && e.message) || e) });
    });
    return;
  }
  serveStatic(req, res, url.pathname);
});

bootstrap()
  .then(() => {
    server.listen(PORT, () => {
      const dbPath = isLocalSqlite() ? localDbPath() : 'DB_DRIVER=' + (process.env.DB_DRIVER || 'sqlite');
      console.log('[server] http://127.0.0.1:' + PORT);
      console.log('[server] 数据库: ' + dbPath);
      console.log('[server] 静态目录: ' + ROOT);
    });
  })
  .catch((e) => {
    console.error('[server] 数据库初始化失败', e);
    process.exit(1);
  });
