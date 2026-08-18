/* ============================================================
 * auth/index.js — Node 端密码校验入口(读 AUTH_PASSWORD 环境变量)
 * ------------------------------------------------------------
 * 密码与 AUTH_PASSWORD 环境变量直接做常量时间比较,不落库、
 * 无随机初始密码。比较的纯逻辑在 ./password.js(与 Worker 共用);
 * 本文件只负责"从 process.env 取密码"这一 Node 特定职责。
 * ============================================================ */
'use strict';

const { matchesPassword } = require('./password');

/**
 * 校验登录密码是否等于环境变量 AUTH_PASSWORD(常量时间比较)。
 * 未配置 AUTH_PASSWORD 时抛错(而不是生成随机密码),由调用方返回 500。
 */
function verifyPassword(password) {
  const expected = process.env.AUTH_PASSWORD;
  if (!expected) {
    throw new Error('[auth] 未配置 AUTH_PASSWORD 环境变量,请先在部署平台设置后重新部署');
  }
  return matchesPassword(password, expected);
}

module.exports = { verifyPassword, matchesPassword };
