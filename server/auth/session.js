/* ============================================================
 * session.js — 会话令牌哈希与查询(纯逻辑,Node / Worker 共用)
 * ------------------------------------------------------------
 * 数据库只存令牌的 SHA-256 哈希,明文令牌仅在登录响应中返回。
 * 本模块只依赖注入进来的 db 实例,不关心 HTTP 层差异。
 * ============================================================ */
'use strict';

const crypto = require('crypto');

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

/**
 * 按令牌查询会话;令牌不存在 / 已过期返回 null。
 * 过期会话顺带删除(清理 auth_sessions 表)。
 */
async function findSession(db, token) {
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

module.exports = { sha256, findSession };
