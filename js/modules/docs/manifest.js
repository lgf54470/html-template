/* ============================================================
 * docs 模块 — 清单
 * ------------------------------------------------------------
 * 二级菜单 = 模块中的子模块:
 * 每个 children 声明自己的路由与独立实现文件(sub/*.js),
 * 互不依赖、可单独删除或替换。
 * css 字段演示"模块私有样式懒加载"(module.css)。
 * 模块词典通过 i18nFile 声明懒加载文件 i18n.js(不进核心词典、不随启动加载)。
 * ============================================================ */
App.registerModule({
  id: 'docs',
  title: { 'zh-CN': '文档', 'zh-TW': '文件', en: 'Documentation' },
  icon: 'book-open',
  css: 'module.css',
  children: [
    {
      id: 'introduction',
      title: { 'zh-CN': '简介', 'zh-TW': '簡介', en: 'Introduction' },
      route: '/docs/introduction',
      load: 'sub/introduction.js',
    },
    {
      id: 'get-started',
      title: { 'zh-CN': '快速开始', 'zh-TW': '快速開始', en: 'Get Started' },
      route: '/docs/get-started',
      load: 'sub/get-started.js',
    },
    {
      id: 'tutorials',
      title: { 'zh-CN': '教程', 'zh-TW': '教學', en: 'Tutorials' },
      route: '/docs/tutorials',
      load: 'sub/tutorials.js',
    },
    {
      id: 'changelog',
      title: { 'zh-CN': '更新日志', 'zh-TW': '更新日誌', en: 'Changelog' },
      route: '/docs/changelog',
      load: 'sub/changelog.js',
    },
  ],
  i18nFile: 'i18n.js',
});
