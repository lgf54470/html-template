/* ============================================================
 * system 模块 — 清单
 * ============================================================ */
App.registerModule({
  id: 'system',
  title: { 'zh-CN': '系统', 'zh-TW': '系統', en: 'System' },
  icon: 'settings',
  route: '/system',
  load: 'module.js',
  i18n: {
    en: {
      'system.title': 'System',
      'system.desc': 'System settings, appearance and deployment configuration.',
    },
    'zh-CN': {
      'system.title': '系统',
      'system.desc': '系统设置、外观与部署配置。',
    },
    'zh-TW': {
      'system.title': '系統',
      'system.desc': '系統設定、外觀與部署設定。',
    },
  },
});
