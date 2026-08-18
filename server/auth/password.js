/* ============================================================
 * password.js — 密码常量时间比较(纯逻辑,Node / Worker 共用)
 * ------------------------------------------------------------
 * 登录密码不落库、不生成随机密码;与部署平台提供的密码
 * (AUTH_PASSWORD 环境变量 / Worker secret)做常量时间比较。
 * 本模块只负责"比较"这一纯逻辑,密码来源由各运行时注入:
 *   - Node:server/auth/index.js 读 process.env.AUTH_PASSWORD
 *   - Worker:worker.js 读 env.AUTH_PASSWORD
 * ============================================================ */
'use strict';

const crypto = require('crypto');

/** 常量时间比较密码与期望值(两者长度不同时直接不匹配) */
function matchesPassword(password, expected) {
  const a = Buffer.from(String(password));
  const b = Buffer.from(String(expected));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { matchesPassword };
