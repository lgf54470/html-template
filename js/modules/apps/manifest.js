/* ============================================================
 * apps 模块 — 清单
 * 复刻参考项目 shadcn-admin 的 Apps 页:App Integrations。
 * ============================================================ */
App.registerModule({
  id: 'apps',
  title: { 'zh-CN': '应用', 'zh-TW': '應用', en: 'Apps' },
  icon: 'package',
  route: '/apps',
  load: 'module.js',
  css: 'module.css',
  i18nFile: 'i18n.js',
});
