/* ============================================================
 * api.js — 共享 API 处理器(Node http req/res 风格,零第三方依赖)
 * ------------------------------------------------------------
 * 供 dev-server.js(本地 http 服务器)与 Vercel 函数
 * (api/[[...path]].js)共用,保证两处逻辑完全一致。
 * 用法:
 *   const { createApiHandler, sendJson } = require('./server/api');
 *   const handleApi = createApiHandler({ db, encrypt, decrypt, hashPassword, verifyPassword });
 *   await handleApi(req, res, pathname);
 *
 * API(除 /api/auth/login 外均需请求头 x-auth-token):
 *   POST   /api/auth/login     { password, expiry }  -> { token, expiresAt }
 *   GET    /api/auth/verify                            -> { ok: true }
 *   POST   /api/auth/logout                            登出(删除会话)
 *   POST   /api/auth/password  { currentPassword, newPassword } 修改密码
 *   GET    /api/settings                               全部 app_settings(KV)
 *   PUT    /api/settings       { settings: { key: value } }  批量写入
 *   DELETE /api/settings       { keys: [ ... ] }       删除
 * ============================================================ */
'use strict';

const crypto = require('crypto');

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

const RESERVED_SETTINGS_PREFIX = 'settings:auth:'; // 鉴权相关键禁止通过通用 KV 接口写入

/* ---------- 敏感键值:落库前 AES-256-GCM 加密,读取时解密 ---------- */
const SENSITIVE_WORDS = ['password', 'email', 'apikey', 'api_key', 'secret', 'token', 'credential', 'access_key'];

/** 键名含敏感词,或整体为含敏感字段的配置块(如 settings:profile 含邮箱) */
function isSensitiveKey(key) {
  if (key === 'settings:profile') return true;
  const lower = String(key).toLowerCase();
  return SENSITIVE_WORDS.some(function (w) { return lower.indexOf(w) !== -1; });
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

/* ---------- 会话(数据库只存令牌哈希,不存明文) ---------- */
function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

async function getSession(db, token) {
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

async function authed(db, req, res) {
  const session = await getSession(db, req.headers['x-auth-token']);
  if (!session) {
    sendJson(res, 401, { error: 'unauthorized', message: '登录已失效,请重新登录' });
    return null;
  }
  return session;
}

/* ---------- API 处理器工厂 ---------- */
function createApiHandler(ctx) {
  const { db, encrypt, decrypt, hashPassword, verifyPassword } = ctx;

  return async function handleApi(req, res, pathname) {
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
      const row = await db.get('SELECT value FROM app_settings WHERE key = ?', [ctx.authKey]);
      if (!(await verifyPassword(password, row && row.value))) {
        return sendJson(res, 401, { error: 'bad_password', message: '密码错误' });
      }
      const token = crypto.randomBytes(24).toString('base64url');
      const expiresAt = new Date(Date.now() + ttl).toISOString();
      // 数据库仅存 SHA-256 哈希,明文令牌只在响应中返回给客户端
      await db.run('INSERT INTO auth_sessions (token_hash, expires_at, note) VALUES (?, ?, ?)', [sha256(token), expiresAt, expiry]);
      return sendJson(res, 200, { token, expiresAt, expiry });
    }

    const session = await authed(db, req, res);
    if (!session) return;

    // GET /api/auth/verify
    if (method === 'GET' && parts[1] === 'auth' && parts[2] === 'verify') {
      return sendJson(res, 200, { ok: true, expiry: session.note });
    }

    // POST /api/auth/logout
    if (method === 'POST' && parts[1] === 'auth' && parts[2] === 'logout') {
      await db.run('DELETE FROM auth_sessions WHERE token_hash = ?', [sha256(req.headers['x-auth-token'])]);
      return sendJson(res, 200, { ok: true });
    }

    // POST /api/auth/password
    if (method === 'POST' && parts[1] === 'auth' && parts[2] === 'password') {
      let body;
      try { body = await readBody(req); } catch (e) { return sendJson(res, 400, { error: 'bad_json' }); }
      const row = await db.get('SELECT value FROM app_settings WHERE key = ?', [ctx.authKey]);
      if (!(await verifyPassword(String(body.currentPassword || ''), row && row.value))) {
        return sendJson(res, 401, { error: 'bad_password', message: '当前密码错误' });
      }
      const np = String(body.newPassword || '');
      if (np.length < 6) return sendJson(res, 400, { error: 'weak_password', message: '新密码至少 6 位' });
      await db.run(
        'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\')',
        [ctx.authKey, hashPassword(np)],
      );
      // 修改密码后吊销全部既有会话
      await db.run('DELETE FROM auth_sessions');
      return sendJson(res, 200, { ok: true });
    }

    // GET /api/settings(保留键 settings:auth:* 不返回;敏感键解密后返回)
    if (method === 'GET' && parts[1] === 'settings') {
      const rows = await db.query('SELECT key, value FROM app_settings ORDER BY key');
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
        await db.run(
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
        await db.run('DELETE FROM app_settings WHERE key = ?', [k]);
      }
      return sendJson(res, 200, { ok: true, removed: keys.length });
    }

    return sendJson(res, 404, { error: 'not_found' });
  };
}

module.exports = { createApiHandler, sendJson, EXPIRY_MS };
