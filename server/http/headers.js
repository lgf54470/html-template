/* ============================================================
 * headers.js — 统一安全响应头(纯常量,Node / Worker / Deno 共用)
 * ------------------------------------------------------------
 * - X-Content-Type-Options: nosniff  防止 MIME 嗅探
 * - X-Frame-Options: DENY           防止被 iframe 劫持(点击劫持)
 * - Referrer-Policy: no-referrer     不随跳转泄露来源路径
 * ============================================================ */
'use strict';

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
};

module.exports = { SECURITY_HEADERS };
