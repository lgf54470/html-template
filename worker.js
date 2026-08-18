/* ============================================================
 * worker.js — Cloudflare Worker 入口(静态资源 + 鉴权 API + D1)
 * ------------------------------------------------------------
 * 与根目录 dev-server.js 职责一一对应,按 Workers 运行时适配:
 *   - 静态资源:由 wrangler.toml [assets] 在边缘网络直接托管
 *     (index.html / js / assets);未命中资源的请求(如 /api/*)
 *     才进入本 Worker,非 API 请求一律透传给 ASSETS 绑定
 *   - API:登录 / 校验 / 登出 / 改密 / 设置 KV,逻辑与 server/api.js 保持一致
 *   - 数据库:Cloudflare D1(binding = DB),适配器 server/db-d1.js
 *   - 密码哈希:PBKDF2-SHA256(WebCrypto,不占 CPU 配额;
 *     同时兼容本地 dev-server.js 生成的 scrypt 哈希)
 *   - 敏感键加密:AES-256-GCM,存储格式与 server/crypto.js 一致(enc:v1:...)
 *
 * 环境变量(通过 `wrangler secret put` 设置,勿写入 wrangler.toml):
 *   AUTH_PASSWORD   首次启动初始化管理员密码(生产必设;密码已在库中则忽略)
 *   ENCRYPTION_KEY  敏感数据加密密钥,64 位 hex(生产必设;缺失时报错)
 *
 * 注意:修改本文件的鉴权 / 设置逻辑时,请同步 server/api.js(或反之)。
 * 完整部署说明见 DEPLOY.md。
 * ============================================================ */

// 注意:Cloudflare 要求 ESM 格式(nodejs_compat 下 CJS 会报
// "no default export" 错误),因此本文件使用 import / export default。
import crypto from 'node:crypto';
import { init as initD1 } from './server/db-d1.js';

/* ---------- 与 server/db.js 的 SCHEMA 保持一致 ---------- */
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

const AUTH_KEY = 'settings:auth:password';
const RESERVED_SETTINGS_PREFIX = 'settings:auth:';
const SENSITIVE_WORDS = ['password', 'email', 'apikey', 'api_key', 'secret', 'token', 'credential', 'access_key'];

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
  browser: 30 * 86400e3,
};

/* ---------- 数据库(单例,每 isolate 一份) ---------- */
let _db = null;
function getDb(env) {
  if (!_db) _db = initD1({ binding: env.DB, schema: SCHEMA });
  return _db;
}

/* ---------- 首次启动:建表 + 初始化管理员密码(每 isolate 一次) ---------- */
let _boot = null;
function boot(db, env) {
  if (!_boot) {
    _boot = (async () => {
      await db.initSchema(SCHEMA);
      await ensureAuthPassword(db, env);
    })().catch((e) => {
      _boot = null; // 失败后允许下次请求重试
      throw e;
    });
  }
  return _boot;
}

async function ensureAuthPassword(db, env) {
  const row = await db.get('SELECT value FROM app_settings WHERE key = ?', [AUTH_KEY]);
  if (row && row.value) return false; // 已存在密码(含用户改密后),忽略 AUTH_PASSWORD
  const initial = env.AUTH_PASSWORD || randomPassword();
  await db.run(
    "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')",
    [AUTH_KEY, await hashPassword(initial)],
  );
  if (!env.AUTH_PASSWORD) {
    console.warn('[auth] 未设置 AUTH_PASSWORD,已生成随机初始密码: ' + initial +
      ';生产环境请用 `wrangler secret put AUTH_PASSWORD` 预置(可用 `wrangler tail` 查看日志)');
  }
  return true;
}

function randomPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#%';
  let s = '';
  for (let i = 0; i < 14; i++) s += chars[crypto.randomInt(chars.length)];
  return s;
}

/* ---------- 密码哈希:PBKDF2-SHA256(WebCrypto,不占 CPU 配额) ---------- */
function subtle() {
  return (globalThis.crypto && globalThis.crypto.subtle) || crypto.webcrypto.subtle;
}

async function pbkdf2(password, saltHex, iterations, keyLen) {
  const keyMaterial = await subtle().importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'],
  );
  const bits = await subtle().deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: Buffer.from(saltHex, 'hex'), iterations },
    keyMaterial, keyLen * 8,
  );
  return Buffer.from(bits).toString('hex');
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const iterations = 100000;
  const hash = await pbkdf2(password, salt, iterations, 32);
  return 'pbkdf2$' + iterations + '$' + salt + '$' + hash;
}

function timingSafeEqualHex(a, b) {
  const x = Buffer.from(String(a), 'hex');
  const y = Buffer.from(String(b), 'hex');
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

async function verifyPassword(password, stored) {
  if (!stored) return false;
  const parts = String(stored).split('$');
  if (parts[0] === 'pbkdf2' && parts.length === 4) {
    const hash = await pbkdf2(password, parts[2], Number(parts[1]) || 100000, 32);
    return timingSafeEqualHex(hash, parts[3]);
  }
  if (parts[0] === 'scrypt' && parts.length === 6) {
    // 兼容本地 dev-server.js 生成的 scrypt 哈希(异步版,不阻塞 Worker 主线程)
    const [, N, r, p, salt, expected] = parts;
    const hash = await new Promise((resolve, reject) => {
      crypto.scrypt(password, salt, 64, { N: Number(N), r: Number(r), p: Number(p) }, (err, key) => {
        if (err) reject(err);
        else resolve(key.toString('hex'));
      });
    });
    return timingSafeEqualHex(hash, expected);
  }
  return false;
}

/* ---------- 敏感键加密(AES-256-GCM,格式与 server/crypto.js 一致) ---------- */
const PREFIX = 'enc:v1:';
let _key = null;
function key(env) {
  if (_key) return _key;
  const hex = env.ENCRYPTION_KEY;
  if (!hex) {
    throw new Error('[crypto] 缺少 ENCRYPTION_KEY(64 位 hex),请用 `wrangler secret put ENCRYPTION_KEY` 设置');
  }
  const buf = Buffer.from(hex, 'hex');
  if (buf.length !== 32) throw new Error('[crypto] ENCRYPTION_KEY 必须是 64 位 hex(32 字节)');
  _key = buf;
  return _key;
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}
function fromB64url(s) {
  return Buffer.from(s, 'base64url');
}

/** AES-256-GCM 加密 → enc:v1:<iv>:<tag>:<ct> */
function encrypt(plaintext, env) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(env), iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  return PREFIX + b64url(iv) + ':' + b64url(cipher.getAuthTag()) + ':' + b64url(ct);
}

/** 解密 enc:v1:…;格式非法 / 密钥不符返回 null */
function decrypt(stored, env) {
  if (typeof stored !== 'string' || stored.indexOf(PREFIX) !== 0) return null;
  const parts = stored.slice(PREFIX.length).split(':');
  if (parts.length !== 3) return null;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(env), fromB64url(parts[0]));
    decipher.setAuthTag(fromB64url(parts[1]));
    return Buffer.concat([decipher.update(fromB64url(parts[2])), decipher.final()]).toString('utf8');
  } catch (e) {
    return null;
  }
}

/* ---------- 会话(数据库只存令牌哈希) ---------- */
function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

async function getSession(token, db) {
  if (!token) return null;
  const hash = sha256(token);
  const row = await db.get('SELECT * FROM auth_sessions WHERE token_hash = ?', [hash]);
  if (!row) return null;
  if (row.expires_at && Date.parse(row.expires_at) <= Date.now()) {
    await db.run('DELETE FROM auth_sessions WHERE token_hash = ?', [hash]);
    return null;
  }
  return row;
}

async function authed(request, db) {
  const session = await getSession(request.headers.get('x-auth-token'), db);
  return session; // null 时由调用方返回 401
}

/* ---------- HTTP 工具 ---------- */
function sendJson(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch (e) {
    return {};
  }
}

/** 键名含敏感词,或整体为含敏感字段的配置块(如 settings:profile 含邮箱) */
function isSensitiveKey(k) {
  if (k === 'settings:profile') return true;
  const lower = String(k).toLowerCase();
  return SENSITIVE_WORDS.some(function (w) { return lower.indexOf(w) !== -1; });
}

/* ---------- API 路由(与 server/api.js createApiHandler 保持一致) ---------- */
async function handleApi(request, env, pathname) {
  const db = getDb(env);
  await boot(db, env); // 建表 + 初始化密码(幂等,仅首次真正执行)
  const method = request.method;
  const parts = pathname.split('/').filter(Boolean);

  // POST /api/auth/login
  if (method === 'POST' && parts[1] === 'auth' && parts[2] === 'login') {
    const body = await readJson(request);
    const password = typeof body.password === 'string' ? body.password : '';
    const expiry = typeof body.expiry === 'string' ? body.expiry : '24h';
    const ttl = EXPIRY_MS[expiry];
    if (!ttl) return sendJson(400, { error: 'bad_expiry', message: '不支持的失效选项' });
    const row = await db.get('SELECT value FROM app_settings WHERE key = ?', [AUTH_KEY]);
    if (!(await verifyPassword(password, row && row.value))) {
      return sendJson(401, { error: 'bad_password', message: '密码错误' });
    }
    const token = crypto.randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + ttl).toISOString();
    await db.run('INSERT INTO auth_sessions (token_hash, expires_at, note) VALUES (?, ?, ?)', [sha256(token), expiresAt, expiry]);
    return sendJson(200, { token, expiresAt, expiry });
  }

  const session = await authed(request, db);
  if (!session) return sendJson(401, { error: 'unauthorized', message: '登录已失效,请重新登录' });

  // GET /api/auth/verify
  if (method === 'GET' && parts[1] === 'auth' && parts[2] === 'verify') {
    return sendJson(200, { ok: true, expiry: session.note });
  }

  // POST /api/auth/logout
  if (method === 'POST' && parts[1] === 'auth' && parts[2] === 'logout') {
    await db.run('DELETE FROM auth_sessions WHERE token_hash = ?', [sha256(request.headers.get('x-auth-token'))]);
    return sendJson(200, { ok: true });
  }

  // POST /api/auth/password(改密后吊销全部既有会话)
  if (method === 'POST' && parts[1] === 'auth' && parts[2] === 'password') {
    const body = await readJson(request);
    const row = await db.get('SELECT value FROM app_settings WHERE key = ?', [AUTH_KEY]);
    if (!(await verifyPassword(String(body.currentPassword || ''), row && row.value))) {
      return sendJson(401, { error: 'bad_password', message: '当前密码错误' });
    }
    const np = String(body.newPassword || '');
    if (np.length < 6) return sendJson(400, { error: 'weak_password', message: '新密码至少 6 位' });
    await db.run(
      "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')",
      [AUTH_KEY, await hashPassword(np)],
    );
    await db.run('DELETE FROM auth_sessions');
    return sendJson(200, { ok: true });
  }

  // GET /api/settings(保留键 settings:auth:* 不返回;敏感键解密后返回)
  if (method === 'GET' && parts[1] === 'settings') {
    const rows = await db.query('SELECT key, value FROM app_settings ORDER BY key');
    const out = {};
    for (const r of rows) {
      if (r.key.indexOf(RESERVED_SETTINGS_PREFIX) === 0) continue;
      out[r.key] = isSensitiveKey(r.key) ? (decrypt(r.value, env) || '') : r.value;
    }
    return sendJson(200, out);
  }

  // PUT /api/settings
  if (method === 'PUT' && parts[1] === 'settings') {
    const body = await readJson(request);
    const entries = body && typeof body.settings === 'object' ? body.settings : null;
    if (!entries) return sendJson(400, { error: 'bad_body', message: '需要 { settings: {...} }' });
    const keys = Object.keys(entries);
    for (const k of keys) {
      if (k.indexOf(RESERVED_SETTINGS_PREFIX) === 0) {
        return sendJson(403, { error: 'reserved_key', message: k + ' 为保留键,请走专用鉴权接口' });
      }
    }
    const now = new Date().toISOString();
    for (const k of keys) {
      let v = typeof entries[k] === 'string' ? entries[k] : JSON.stringify(entries[k]);
      // 敏感键:落库前加密,数据库不以明文存放
      if (isSensitiveKey(k)) v = encrypt(v, env);
      await db.run(
        'INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
        [k, v, now],
      );
    }
    return sendJson(200, { ok: true, written: keys.length });
  }

  // DELETE /api/settings
  if (method === 'DELETE' && parts[1] === 'settings') {
    const body = await readJson(request);
    const keys = Array.isArray(body && body.keys) ? body.keys : [];
    for (const k of keys) {
      if (k.indexOf(RESERVED_SETTINGS_PREFIX) === 0) {
        return sendJson(403, { error: 'reserved_key', message: k + ' 为保留键' });
      }
      await db.run('DELETE FROM app_settings WHERE key = ?', [k]);
    }
    return sendJson(200, { ok: true, removed: keys.length });
  }

  return sendJson(404, { error: 'not_found' });
}

/* ---------- 入口 ---------- */
function isApiPath(pathname) {
  return pathname === '/api' || pathname.startsWith('/api/');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (isApiPath(url.pathname)) {
        return await handleApi(request, env, url.pathname);
      }
      // 非 API:透传给静态资源(assets 绑定);未命中资源时按 not_found_handling 处理
      return await env.ASSETS.fetch(request);
    } catch (e) {
      console.error('[worker] 处理请求失败: ' + url.pathname + ' ' + ((e && e.stack) || e));
      return sendJson(500, { error: 'internal', message: String((e && e.message) || e) });
    }
  },
};
