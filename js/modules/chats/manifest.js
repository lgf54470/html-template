/* ============================================================
 * chats 模块 — 清单
 * 复刻参考项目 shadcn-admin 的 Chats 页:会话列表 + 聊天面板。
 * ============================================================ */
App.registerModule({
  id: 'chats',
  title: { 'zh-CN': '聊天', 'zh-TW': '聊天', en: 'Chats' },
  icon: 'messages-square',
  route: '/chats',
  load: 'module.js',
  css: 'module.css',
  i18nFile: 'i18n.js',
});
