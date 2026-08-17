/* ============================================================
 * logs 模块 — 清单
 * ============================================================ */
App.registerModule({
  id: 'logs',
  title: { 'zh-CN': '日志', 'zh-TW': '日誌', en: 'Logs' },
  icon: 'scroll-text',
  route: '/logs',
  load: 'module.js',
  i18n: {
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
  },
});
