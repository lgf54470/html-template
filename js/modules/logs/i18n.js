/* ============================================================
 * logs 模块 — 模块词典(懒加载:首次访问该模块路由时随实现一起下载)
 * 从清单 manifest.js 的 i18n 字段迁移而来,减小启动加载体积。
 * ============================================================ */
window.__moduleI18n = window.__moduleI18n || {};
window.__moduleI18n['logs'] = {
  en: {
    'logs.title': 'Logs',
    'logs.desc': 'Search request logs, errors and usage history.',
  },
  'zh-CN': {
    'logs.title': '日志',
    'logs.desc': '搜索请求日志、错误与用量历史。',
  },
  'zh-TW': {
    'logs.title': '日誌',
    'logs.desc': '搜尋請求日誌、錯誤與用量歷史。',
  },
};
