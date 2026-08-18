/* ============================================================
 * tasks 模块 — 清单(声明元信息,不含逻辑)
 * 复刻参考项目 shadcn-admin 的 Tasks 页:数据表格 + 过滤器 +
 * 模糊搜索 + 字段显隐 + 行操作 + 分页。
 * ============================================================ */
App.registerModule({
  id: 'tasks',
  title: { 'zh-CN': '任务', 'zh-TW': '任務', en: 'Tasks' },
  icon: 'list-todo',
  route: '/tasks',
  load: 'module.js',
  css: 'module.css',
  i18nFile: 'i18n.js',
});
