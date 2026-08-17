/* ============================================================
 * dashboard 模块 — 清单(声明元信息,不含逻辑)
 * 侧边栏一级菜单即一个模块;title 为三语言映射;load 指向实现文件
 * ============================================================ */
App.registerModule({
  id: 'dashboard',
  title: { 'zh-CN': '仪表盘', 'zh-TW': '儀表板', en: 'Dashboard' },
  icon: 'layout-dashboard',
  route: '/',
  load: 'module.js',
  i18nFile: 'i18n.js',
});
