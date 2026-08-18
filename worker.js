/* ============================================================
 * worker.js — Cloudflare Worker 入口(静态资源 + 鉴权 API + D1)
 * ------------------------------------------------------------
 * 与根目录 dev-server.js 职责一一对应,按 Workers 运行时适配:
 *   - 静态资源:由 wrangler.toml [assets] 在边缘网络直接托管
 *     (index.html / js / assets);未命中资源的请求(如 /api/*)
 *     才进入本 Worker,非 API 请求一律透传给 ASSETS 绑定
 *   - 数据库:Cloudflare D1(binding = DB),适配器 server/db/d1.js
 *
 * 纯逻辑复用 server/ 下的 CJS 模块(经 esbuild 打包,与 Node/Deno 同一份实现):
 *   - SCHEMA            server/db/schema.js
 *   - EXPIRY_MS         server/auth/expiry.js
 *   - matchesPassword   server/auth/password.js
 *   - sha256/findSession server/auth/session.js
 *   - 敏感键判定         server/security/sensitive.js
 *   - AES-256-GCM       server/security/core.js
 * Worker 只保留传输层适配(原生 Response / env secret),不再重复实现上述逻辑。
 *
 * 环境变量(通过 `wrangler secret put` 设置,勿写入 wrangler.toml):
 *   AUTH_PASSWORD   登录密码(必设;缺失时登录直接报错,绝不生成随机密码)
 *   ENCRYPTION_KEY  敏感数据加密密钥,64 位 hex(生产必设;缺失时报错)
 *
 * 完整部署说明见 docs/deploy/cloudflare.md。
 * ============================================================ */

// 注意:Cloudflare 要求 ESM 格式(nodejs_compat 下 CJS 会报
// "no default export" 错误),因此本文件使用 import / export default。
import crypto from 'node:crypto';
import { init as initD1 } from './server/db/d1.js';
import { SCHEMA } from './server/db/schema.js';
import { EXPIRY_MS } from './server/auth/expiry.js';
import { matchesPassword } from './server/auth/password.js';
import { sha256, findSession } from './server/auth/session.js';
import { RESERVED_SETTINGS_PREFIX, isSensitiveKey } from './server/security/sensitive.js';
import { GLOBAL_WORKSPACE_ID, workspaceIdForKey } from './server/db/scope.js';
import { encryptWithKey, decryptWithKey } from './server/security/core.js';
import { createThrottle } from './server/auth/throttle.js';
import { SECURITY_HEADERS } from './server/http/headers.js';

/* ---------- 登录限流(仅统计密码错误次数;与 Node 路由共用 server/auth/throttle.js) ---------- */
const loginThrottle = createThrottle();

function clientIp(request) {
  const cf = request.headers.get('cf-connecting-ip');
  if (cf) return cf;
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return 'unknown';
}

/* ---------- 数据库(单例,每 isolate 一份) ---------- */
let _db = null;
function getDb(env) {
  if (!_db) _db = initD1({ binding: env.DB, schema: SCHEMA });
  return _db;
}

/* ---------- 首次启动:建表(每 isolate 一次;密码由 AUTH_PASSWORD secret 直接校验) ---------- */
let _boot = null;
function boot(db) {
  if (!_boot) {
    _boot = db.initSchema(SCHEMA).catch((e) => {
      _boot = null; // 失败后允许下次请求重试
      throw e;
    });
  }
  return _boot;
}

/* ---------- 密码校验:与 secret AUTH_PASSWORD 常量时间比较(纯比较在 server/auth/password.js) ---------- */
function verifyEnvPassword(password, env) {
  const expected = env.AUTH_PASSWORD;
  if (!expected) {
    throw new Error(
      '[auth] 未配置 AUTH_PASSWORD secret,请用 `wrangler secret put AUTH_PASSWORD` 设置后再登录'
    );
  }
  return matchesPassword(password, expected);
}

/* ---------- 敏感键加密(AES-256-GCM 实现在 server/security/core.js;密钥来自 secret) ---------- */
let _key = null;
function key(env) {
  if (_key) return _key;
  const hex = env.ENCRYPTION_KEY;
  if (!hex) {
    throw new Error(
      '[crypto] 缺少 ENCRYPTION_KEY(64 位 hex),请用 `wrangler secret put ENCRYPTION_KEY` 设置'
    );
  }
  const buf = Buffer.from(hex, 'hex');
  if (buf.length !== 32) throw new Error('[crypto] ENCRYPTION_KEY 必须是 64 位 hex(32 字节)');
  _key = buf;
  return _key;
}

function encrypt(plaintext, env) {
  return encryptWithKey(key(env), plaintext);
}

function decrypt(stored, env) {
  return decryptWithKey(key(env), stored);
}

/* ---------- 会话(数据库只存令牌哈希;查询逻辑在 server/auth/session.js) ---------- */
async function authed(request, db) {
  return findSession(db, request.headers.get('x-auth-token'));
}

/* ---------- HTTP 工具(Worker 原生 Response) ---------- */
function sendJson(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: Object.assign(
      {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
      SECURITY_HEADERS
    ),
  });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch (e) {
    return {};
  }
}

/* ---------- API 路由(与 server/api/index.js 的 createApiHandler 保持一致) ---------- */
async function handleApi(request, env, pathname) {
  const db = getDb(env);
  await boot(db); // 建表(幂等,仅首次真正执行)
  const method = request.method;
  const parts = pathname.split('/').filter(Boolean);

  // POST /api/auth/login
  if (method === 'POST' && parts[1] === 'auth' && parts[2] === 'login') {
    const body = await readJson(request);
    const password = typeof body.password === 'string' ? body.password : '';
    const expiry = typeof body.expiry === 'string' ? body.expiry : '24h';
    const ttl = EXPIRY_MS[expiry];
    if (!ttl) return sendJson(400, { error: 'bad_expiry', message: '不支持的失效选项' });
    const ip = clientIp(request);
    if (loginThrottle.isBlocked(ip)) {
      return sendJson(429, { error: 'too_many_attempts', message: '登录尝试过于频繁,请稍后再试' });
    }
    let ok;
    try {
      ok = verifyEnvPassword(password, env);
    } catch (e) {
      return sendJson(500, { error: 'no_auth_password', message: String((e && e.message) || e) });
    }
    if (!ok) {
      loginThrottle.recordFailure(ip);
      return sendJson(401, { error: 'bad_password', message: '密码错误' });
    }
    loginThrottle.clear(ip);
    const token = crypto.randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + ttl).toISOString();
    await db.run('INSERT INTO auth_sessions (token_hash, expires_at, note) VALUES (?, ?, ?)', [
      sha256(token),
      expiresAt,
      expiry,
    ]);
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
    await db.run('DELETE FROM auth_sessions WHERE token_hash = ?', [
      sha256(request.headers.get('x-auth-token')),
    ]);
    return sendJson(200, { ok: true });
  }

  // GET /api/settings(保留键 settings:auth:* 不返回;敏感键解密后返回;
  // 返回全局注册表 + 指定/当前工作空间的设置)
  if (method === 'GET' && parts[1] === 'settings') {
    const url = new URL(request.url);
    const requestedWs = url.searchParams.get('workspace') || '';
    let activeWs = requestedWs;
    if (!activeWs) {
      const row = await db.get(
        "SELECT value FROM app_settings WHERE workspace_id = ? AND key = 'settings:activeWorkspace'",
        [GLOBAL_WORKSPACE_ID]
      );
      activeWs = (row && row.value) || GLOBAL_WORKSPACE_ID;
    }
    const rows = await db.query(
      'SELECT workspace_id, key, value FROM app_settings WHERE workspace_id IN (?, ?) ORDER BY key',
      [GLOBAL_WORKSPACE_ID, activeWs]
    );
    const out = {};
    for (const r of rows) {
      if (r.key.indexOf(RESERVED_SETTINGS_PREFIX) === 0) continue;
      out[r.key] = isSensitiveKey(r.key) ? decrypt(r.value, env) || '' : r.value;
    }
    return sendJson(200, out);
  }

  // PUT /api/settings(按键归属作用域落库:全局键 → global,其余 → 当前工作空间)
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
    const declared =
      typeof entries['settings:activeWorkspace'] === 'string' && entries['settings:activeWorkspace']
        ? entries['settings:activeWorkspace']
        : '';
    let activeWs = declared;
    if (!activeWs) {
      const row = await db.get(
        "SELECT value FROM app_settings WHERE workspace_id = ? AND key = 'settings:activeWorkspace'",
        [GLOBAL_WORKSPACE_ID]
      );
      activeWs = (row && row.value) || GLOBAL_WORKSPACE_ID;
    }
    const now = new Date().toISOString();
    for (const k of keys) {
      const wsId = workspaceIdForKey(k, activeWs);
      let v = typeof entries[k] === 'string' ? entries[k] : JSON.stringify(entries[k]);
      // 敏感键:落库前加密,数据库不以明文存放
      if (isSensitiveKey(k)) v = encrypt(v, env);
      await db.run(
        'INSERT INTO app_settings (workspace_id, key, value, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(workspace_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
        [wsId, k, v, now]
      );
    }
    return sendJson(200, { ok: true, written: keys.length });
  }

  // DELETE /api/settings(按当前工作空间定位;全局键仍落在 global)
  if (method === 'DELETE' && parts[1] === 'settings') {
    const body = await readJson(request);
    const keys = Array.isArray(body && body.keys) ? body.keys : [];
    const row = await db.get(
      "SELECT value FROM app_settings WHERE workspace_id = ? AND key = 'settings:activeWorkspace'",
      [GLOBAL_WORKSPACE_ID]
    );
    const activeWs = (row && row.value) || GLOBAL_WORKSPACE_ID;
    for (const k of keys) {
      if (k.indexOf(RESERVED_SETTINGS_PREFIX) === 0) {
        return sendJson(403, { error: 'reserved_key', message: k + ' 为保留键' });
      }
      await db.run('DELETE FROM app_settings WHERE workspace_id = ? AND key = ?', [
        workspaceIdForKey(k, activeWs),
        k,
      ]);
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
      return sendJson(500, { error: 'internal', message: '服务器内部错误' });
    }
  },
};
