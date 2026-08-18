/* ============================================================
 * sensitive.js — 敏感键判定与保留键前缀(纯逻辑,Node / Worker 共用)
 * ------------------------------------------------------------
 * 判定规则:
 *   - 键名含 password/email/apikey/api_key/secret/token/credential/access_key 之一
 *   - 或整体为含敏感字段的配置块(如 settings:profile 含邮箱)
 * 保留键 settings:auth:* 禁止通过通用 KV 接口读写。
 * ============================================================ */
'use strict';

const RESERVED_SETTINGS_PREFIX = 'settings:auth:';

const SENSITIVE_WORDS = [
  'password',
  'email',
  'apikey',
  'api_key',
  'secret',
  'token',
  'credential',
  'access_key',
];

/** 键名含敏感词,或整体为含敏感字段的配置块 */
function isSensitiveKey(key) {
  if (key === 'settings:profile') return true;
  const lower = String(key).toLowerCase();
  return SENSITIVE_WORDS.some(function (w) {
    return lower.indexOf(w) !== -1;
  });
}

module.exports = { RESERVED_SETTINGS_PREFIX, SENSITIVE_WORDS, isSensitiveKey };
