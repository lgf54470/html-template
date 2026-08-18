/* ============================================================
 * routes/auth.js — 鉴权相关 API 路由
 * ------------------------------------------------------------
 * POST /api/auth/login    登录(公开)
 * GET  /api/auth/verify   校验会话
 * POST /api/auth/logout   登出
 * 依赖由 server/api/index.js 注入 { db, verifyPassword }。
 * ============================================================ */
'use strict';

const crypto = require('crypto');
const { EXPIRY_MS } = require('../../auth/expiry');
const { sha256 } = require('../../auth/session');
const { sendJson, readBody } = require('../../http/json');

function authRoutes({ db, verifyPassword }) {
  async function login(req, res) {
    let body;
    try { body = await readBody(req); } catch (e) { return sendJson(res, 400, { error: 'bad_json' }); }
    const password = typeof body.password === 'string' ? body.password : '';
    const expiry = typeof body.expiry === 'string' ? body.expiry : '24h';
    const ttl = EXPIRY_MS[expiry];
    if (!ttl) return sendJson(res, 400, { error: 'bad_expiry', message: '不支持的失效选项' });

    let ok;
    try {
      ok = verifyPassword(password); // 与 AUTH_PASSWORD 环境变量常量时间比较
    } catch (e) {
      return sendJson(res, 500, { error: 'no_auth_password', message: String((e && e.message) || e) });
    }
    if (!ok) {
      return sendJson(res, 401, { error: 'bad_password', message: '密码错误' });
    }

    const token = crypto.randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + ttl).toISOString();
    // 数据库仅存 SHA-256 哈希,明文令牌只在响应中返回给客户端
    await db.run('INSERT INTO auth_sessions (token_hash, expires_at, note) VALUES (?, ?, ?)', [sha256(token), expiresAt, expiry]);
    return sendJson(res, 200, { token, expiresAt, expiry });
  }

  return [
    { method: 'POST', path: '/api/auth/login', public: true, handler: login },
    {
      method: 'GET',
      path: '/api/auth/verify',
      handler(req, res, ctx) {
        return sendJson(res, 200, { ok: true, expiry: ctx.session.note });
      },
    },
    {
      method: 'POST',
      path: '/api/auth/logout',
      async handler(req, res) {
        await db.run('DELETE FROM auth_sessions WHERE token_hash = ?', [sha256(req.headers['x-auth-token'])]);
        return sendJson(res, 200, { ok: true });
      },
    },
  ];
}

module.exports = authRoutes;
