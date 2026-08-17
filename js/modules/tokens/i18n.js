/* ============================================================
 * tokens 模块 — 模块词典(懒加载:首次访问该模块路由时随实现一起下载)
 * 从清单 manifest.js 的 i18n 字段迁移而来,减小启动加载体积。
 * ============================================================ */
window.__moduleI18n = window.__moduleI18n || {};
window.__moduleI18n['tokens'] = {
  "en": {
    "tokens.title": "Tokens",
    "tokens.desc": "Create and rotate API tokens, set quotas and expiry policies."
  },
  "zh-CN": {
    "tokens.title": "令牌",
    "tokens.desc": "创建与轮换 API 令牌,设置配额与过期策略。"
  },
  "zh-TW": {
    "tokens.title": "令牌",
    "tokens.desc": "建立與輪換 API 令牌,設定配額與到期策略。"
  }
};
