/* ============================================================
 * throttle.js — 登录暴力破解限流(纯逻辑,Node / Worker 共用)
 * ------------------------------------------------------------
 * 只统计「密码错误」的失败次数,成功登录后清空计数。
 * 滑动窗口 + 失败阈值默认 1 分钟内 8 次。
 *
 * 注意:内存级限流按进程/isolate 生效;多实例部署(serverless)时
 * 还应叠加平台层限流(如 Cloudflare WAF / 网关限流)以获得全局保障。
 * ============================================================ */
'use strict';

const DEFAULT_WINDOW_MS = 60 * 1000;
const DEFAULT_MAX_FAILURES = 8;

function createThrottle(opts) {
  const windowMs = (opts && opts.windowMs) || DEFAULT_WINDOW_MS;
  const max = (opts && opts.max) || DEFAULT_MAX_FAILURES;
  const failures = new Map(); // key -> { start, count }

  function isBlocked(key) {
    const rec = failures.get(key);
    if (!rec) return false;
    if (Date.now() - rec.start >= windowMs) {
      failures.delete(key);
      return false;
    }
    return rec.count >= max;
  }

  function recordFailure(key) {
    const now = Date.now();
    const rec = failures.get(key);
    if (!rec || now - rec.start >= windowMs) failures.set(key, { start: now, count: 1 });
    else rec.count += 1;
  }

  function clear(key) {
    failures.delete(key);
  }

  return { isBlocked, recordFailure, clear };
}

module.exports = { createThrottle };
