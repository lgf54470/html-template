/* ============================================================
 * auth.js — 登录密码校验(零第三方依赖)
 * ------------------------------------------------------------
 * 密码由部署平台的环境变量 AUTH_PASSWORD 统一管理,登录时直接
 * 与该值做常量时间比较;不落库、不生成随机密码、不写初始密码。
 *
 * 供 dev-server.js、Vercel 函数(api/index.js)共用;
 * Cloudflare worker.js 内有同款实现(读取 env.AUTH_PASSWORD secret)。
 * ============================================================ */
'use strict';

const crypto = require('crypto');

/**
 * 校验登录密码是否等于环境变量 AUTH_PASSWORD(常量时间比较)。
 * 未配置 AUTH_PASSWORD 时抛错(而不是生成随机密码),由调用方返回 500。
 */
function verifyPassword(password) {
  const expected = process.env.AUTH_PASSWORD;
  if (!expected) {
    throw new Error('[auth] 未配置 AUTH_PASSWORD 环境变量,请先在部署平台设置后重新部署');
  }
  const a = Buffer.from(String(password));
  const b = Buffer.from(String(expected));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { verifyPassword };
