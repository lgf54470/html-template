/* ============================================================
 * auth.js — 密码哈希与管理员密码初始化(零第三方依赖)
 * ------------------------------------------------------------
 * 供 dev-server.js 与 Vercel 函数(api/[[...path]].js)共用。
 * 哈希格式:scrypt$N$r$p$salt$hash(Node 环境;Workers 内见 worker.js
 * 的 PBKDF2 版本,两者互不冲突)。
 * ============================================================ */
'use strict';

const crypto = require('crypto');
const log = require('./logger');

const AUTH_KEY = 'settings:auth:password';

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

function randomPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#%';
  let s = '';
  for (let i = 0; i < 14; i++) s += chars[crypto.randomInt(chars.length)];
  return s;
}

/* ---------- 首次启动:初始化管理员密码 ---------- */
async function ensureAuthPassword(db) {
  const row = await db.get('SELECT value FROM app_settings WHERE key = ?', [AUTH_KEY]);
  if (row) return false;
  const initial = process.env.AUTH_PASSWORD || randomPassword();
  await db.run(
    'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\')',
    [AUTH_KEY, hashPassword(initial)],
  );
  log.divider();
  log.warn('auth', '首次启动:已初始化管理员密码(请立即在 设置 → 账号 修改)');
  log.info('auth', '初始密码: ' + initial);
  log.info('auth', '可用环境变量 AUTH_PASSWORD 预置初始密码');
  log.divider();
  return true;
}

module.exports = { AUTH_KEY, hashPassword, verifyPassword, randomPassword, ensureAuthPassword };
