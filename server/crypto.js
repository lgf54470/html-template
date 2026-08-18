/* ============================================================
 * crypto.js — 敏感数据加密(零第三方依赖)
 * ------------------------------------------------------------
 * 用途:app_settings 中的敏感键值(邮箱 / apikey / token / secret …)
 * 在落库前用 AES-256-GCM 加密,保证数据库不以明文存放敏感数据。
 *
 * 密钥来源(优先级):
 *   1. 环境变量 ENCRYPTION_KEY(64 位 hex = 32 字节;生产环境必须显式设置)
 *   2. 首次启动自动生成随机密钥并持久化到 server/.secret-key(本地开发零配置)
 *
 * 存储格式:enc:v1:<iv_b64url>:<tag_b64url>:<ciphertext_b64url>
 * 注意:改密/丢钥会导致已加密数据无法解密,生产环境请妥善保管 ENCRYPTION_KEY。
 * ============================================================ */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const KEY_FILE = path.join(__dirname, '.secret-key');
const PREFIX = 'enc:v1:';
const IV_LEN = 12;
const TAG_LEN = 16;

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}
function fromB64url(s) {
  return Buffer.from(s, 'base64url');
}

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
    console.log('[crypto] 已生成加密密钥并保存到 ' + KEY_FILE + '(生产环境请改用 ENCRYPTION_KEY)');
  } catch (e) { /* 目录不可写时仅内存持有,重启后无法解密旧数据 */ }
  return fresh;
}

let _key = null;
function key() {
  if (!_key) _key = getEncryptionKey();
  return _key;
}

/** AES-256-GCM 加密 → enc:v1:<iv>:<tag>:<ct> */
function encrypt(plaintext) {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + b64url(iv) + ':' + b64url(tag) + ':' + b64url(ct);
}

/** 解密 enc:v1:…;格式非法/密钥不符返回 null(绝不抛出到业务层) */
function decrypt(stored) {
  if (typeof stored !== 'string' || stored.indexOf(PREFIX) !== 0) return null;
  const parts = stored.slice(PREFIX.length).split(':');
  if (parts.length !== 3) return null;
  try {
    const iv = fromB64url(parts[0]);
    const tag = fromB64url(parts[1]);
    const ct = fromB64url(parts[2]);
    if (iv.length !== IV_LEN || tag.length !== TAG_LEN) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch (e) {
    return null;
  }
}

module.exports = { encrypt, decrypt };
