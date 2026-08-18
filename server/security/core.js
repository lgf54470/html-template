/* ============================================================
 * core.js — AES-256-GCM 加解密(纯逻辑,Node / Worker 共用)
 * ------------------------------------------------------------
 * 只依赖 node:crypto 与传入的 32 字节密钥,不读环境变量、不碰文件系统,
 * 因此可同时被 Node(server/security/index.js)与 Cloudflare Worker
 * (worker.js,nodejs_compat)复用,消除两处加解密实现的重复。
 *
 * 存储格式:enc:v1:<iv_b64url>:<tag_b64url>:<ciphertext_b64url>
 * ============================================================ */
'use strict';

const crypto = require('crypto');

const PREFIX = 'enc:v1:';
const IV_LEN = 12;
const TAG_LEN = 16;

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function fromB64url(s) {
  return Buffer.from(s, 'base64url');
}

/** AES-256-GCM 加密 → enc:v1:<iv>:<tag>:<ct> */
function encryptWithKey(key, plaintext) {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + b64url(iv) + ':' + b64url(tag) + ':' + b64url(ct);
}

/** 解密 enc:v1:…;格式非法 / 密钥不符返回 null(绝不抛出到业务层) */
function decryptWithKey(key, stored) {
  if (typeof stored !== 'string' || stored.indexOf(PREFIX) !== 0) return null;
  const parts = stored.slice(PREFIX.length).split(':');
  if (parts.length !== 3) return null;
  try {
    const iv = fromB64url(parts[0]);
    const tag = fromB64url(parts[1]);
    const ct = fromB64url(parts[2]);
    if (iv.length !== IV_LEN || tag.length !== TAG_LEN) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch (e) {
    return null;
  }
}

module.exports = { PREFIX, encryptWithKey, decryptWithKey };
