/* ============================================================
 * security/index.js — Node 端敏感数据加解密入口(零第三方依赖)
 * ------------------------------------------------------------
 * 用途:app_settings 中的敏感键值(邮箱 / apikey / token / secret …)
 * 在落库前用 AES-256-GCM 加密,保证数据库不以明文存放敏感数据。
 * 加解密的纯算法在 ./core.js(与 Worker 共用);本文件只负责
 * "从环境变量 / 本地密钥文件取得 32 字节密钥"这一 Node 特定职责。
 *
 * 密钥来源(优先级):
 *   1. 环境变量 ENCRYPTION_KEY(64 位 hex = 32 字节;生产环境必须显式设置)
 *   2. 首次启动自动生成随机密钥并持久化到 server/.secret-key(本地开发零配置)
 * ============================================================ */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { encryptWithKey, decryptWithKey } = require('./core');
const log = require('../logging/logger');

// 保持 server/.secret-key 位置不变:已被 .gitignore / .dockerignore /
// .vercelignore / .assetsignore 与 Deno 部署工作流统一排除。
const KEY_FILE = path.resolve(__dirname, '..', '.secret-key');

/** 获取 32 字节密钥:ENCRYPTION_KEY 优先,否则读取/生成 server/.secret-key */
function getEncryptionKey() {
  const fromEnv = process.env.ENCRYPTION_KEY;
  if (fromEnv) {
    const buf = Buffer.from(fromEnv, 'hex');
    if (buf.length === 32) return buf;
    throw new Error('[crypto] ENCRYPTION_KEY 必须是 64 位 hex(32 字节)');
  }
  try {
    const stored = fs.readFileSync(KEY_FILE, 'utf8').trim();
    const buf = Buffer.from(stored, 'hex');
    if (buf.length === 32) return buf;
  } catch (e) { /* 不存在则生成 */ }
  const fresh = crypto.randomBytes(32);
  try {
    fs.writeFileSync(KEY_FILE, fresh.toString('hex') + '\n', { mode: 0o600 });
    log.warn('crypto', '已生成加密密钥并保存到 ' + KEY_FILE + '(生产环境请改用 ENCRYPTION_KEY)');
  } catch (e) { /* 目录不可写时仅内存持有,重启后无法解密旧数据 */ }
  return fresh;
}

let _key = null;
function key() {
  if (!_key) _key = getEncryptionKey();
  return _key;
}

function encrypt(plaintext) {
  return encryptWithKey(key(), plaintext);
}

function decrypt(stored) {
  return decryptWithKey(key(), stored);
}

module.exports = { encrypt, decrypt };
