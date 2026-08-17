/* ============================================================
 * channels 模块 — 模块词典(懒加载:首次访问该模块路由时随实现一起下载)
 * 从清单 manifest.js 的 i18n 字段迁移而来,减小启动加载体积。
 * ============================================================ */
window.__moduleI18n = window.__moduleI18n || {};
window.__moduleI18n['channels'] = {
  "en": {
    "channels.title": "Channels",
    "channels.desc": "Manage API channels, upstream providers and load balancing."
  },
  "zh-CN": {
    "channels.title": "渠道",
    "channels.desc": "管理 API 渠道、上游供应商与负载均衡。"
  },
  "zh-TW": {
    "channels.title": "渠道",
    "channels.desc": "管理 API 渠道、上游供應商與負載平衡。"
  }
};
