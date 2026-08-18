/* ============================================================
 * docs 模块 — 模块词典(懒加载:首次访问该模块路由时随实现一起下载)
 * 从清单 manifest.js 的 i18n 字段迁移而来,减小启动加载体积。
 * ============================================================ */
window.__moduleI18n = window.__moduleI18n || {};
window.__moduleI18n['docs'] = {
  en: {
    'docs.wip': 'Sub-module demo',
    'docs.introduction.title': 'Introduction',
    'docs.introduction.desc':
      'An overview of the template architecture: single entry, modular directories, decoupled modules.',
    'docs.introduction.s1': 'Architecture',
    'docs.introduction.s1p':
      'The root has exactly one index.html as the single entry. Everything else is organized by directory:',
    'docs.introduction.l1':
      'js/core/ — core runtime: boot, router, settings, i18n, UI kit, App Shell',
    'docs.introduction.l2':
      'js/modules/ — business modules: one directory per top-level sidebar menu',
    'docs.introduction.l3':
      'assets/css/ — design system (vendored build output, all styles & palettes)',
    'docs.introduction.l4': 'assets/fonts/ — local fonts, zero CDN requests',
    'docs.introduction.s2': 'Zero dependencies',
    'docs.introduction.s2p':
      'No npm, no build step, no server required. Double-click index.html to run (file:// with hash routing), or serve it with any static server. Fonts, icons and styles are all local files.',
    'docs.introduction.s3': 'Decoupling',
    'docs.introduction.s3p':
      'Modules never reference each other. Each module only talks to the core layer (App.ui / App.icon / ctx), so adding, removing or breaking any module cannot affect the others.',
    'docs.getStarted.title': 'Get Started',
    'docs.getStarted.desc': 'Run the template and add your first module in three steps.',
    'docs.getStarted.s1': 'Run',
    'docs.getStarted.s1p':
      'Open index.html directly in a browser (works from file://), or serve the folder with any static server (e.g. python -m http.server).',
    'docs.getStarted.s2': 'Add a module',
    'docs.getStarted.s2p':
      'Every top-level sidebar menu is one module. Creating one takes three steps:',
    'docs.getStarted.step1': 'Create the directory js/modules/<name>/',
    'docs.getStarted.step2':
      'Write manifest.js (metadata) + i18n.js (module dictionary) + module.js (implementation)',
    'docs.getStarted.step3': 'Register the directory name in MODULE_DIRS inside js/core/boot.js',
    'docs.getStarted.s3': 'No changes needed',
    'docs.getStarted.s3p':
      'You never touch index.html or any core file to add a module — the sidebar, routing and lazy loading are all derived from the module registry.',
    'docs.tutorials.title': 'Tutorials',
    'docs.tutorials.desc':
      'The module contract: manifest metadata, lazy implementation and sub-modules.',
    'docs.tutorials.s1': 'Manifest (manifest.js)',
    'docs.tutorials.s1p':
      'Declares id, trilingual title, icon, route, optional css, children and i18nFile (lazy-loaded module dictionary):',
    'docs.tutorials.code1':
      "App.registerModule({ id: 'mymod', title: { en: 'My Mod', 'zh-CN': '我的模块' }, icon: 'settings', route: '/mymod', load: 'module.js', i18nFile: 'i18n.js' })",
    'docs.tutorials.s2': 'Implementation (module.js)',
    'docs.tutorials.s2p':
      'Lazy-loaded on first visit. Registers a render function that returns the content HTML:',
    'docs.tutorials.code2':
      "App.defineModule({ id: 'mymod', render: function (route, ctx) { return App.ui.placeholderCard(ctx.t, 'settings', ctx.t('mymod.title'), ctx.t('mymod.desc')); } })",
    'docs.tutorials.s3': 'Sub-modules (second-level menus)',
    'docs.tutorials.s3p':
      'Add a children array in the manifest; each child gets its own route and implementation file. All four pages you are browsing are sub-modules of the docs module.',
    'docs.changelog.title': 'Changelog',
    'docs.changelog.desc': 'Version history and notable changes of this template.',
    'docs.changelog.v1': 'v1.0.0 — initial release',
    'docs.changelog.l1': 'Pure HTML/JS/CSS, zero external dependencies',
    'docs.changelog.l2': 'Single root index.html with PREPAINT first-frame theme script',
    'docs.changelog.l3': 'Sidebar menu = module, second-level menu = sub-module, fully decoupled',
    'docs.changelog.l4': 'Hash router with lazy module loading (works from file://)',
    'docs.changelog.l5':
      'Theme settings panel, trilingual i18n, drag-resizable sidebar, mobile drawer',
  },
  'zh-CN': {
    'docs.wip': '子模块演示',
    'docs.introduction.title': '简介',
    'docs.introduction.desc': '模板架构概览:单一入口、模块化目录、模块间解耦。',
    'docs.introduction.s1': '架构',
    'docs.introduction.s1p': '根目录只有一个 index.html 作为唯一入口,其余全部按目录组织:',
    'docs.introduction.l1': 'js/core/ — 核心运行时:引导、路由、设置、i18n、UI 组件、App Shell',
    'docs.introduction.l2': 'js/modules/ — 业务模块:侧边栏每个一级菜单对应一个目录',
    'docs.introduction.l3': 'assets/css/ — 设计系统(内置编译产物,含全部风格与调色板)',
    'docs.introduction.l4': 'assets/fonts/ — 本地字体,零 CDN 请求',
    'docs.introduction.s2': '零外部依赖',
    'docs.introduction.s2p':
      '无需 npm、无需构建、无需服务器。直接双击 index.html 即可运行(file:// 协议,Hash 路由);也可放到任意静态服务器。字体、图标、样式均为本地文件。',
    'docs.introduction.s3': '解耦原则',
    'docs.introduction.s3p':
      '模块之间互不引用:每个模块只通过核心层暴露的 API(App.ui / App.icon / ctx)工作,新增、删除或出错的模块都不会影响其它模块。',
    'docs.getStarted.title': '快速开始',
    'docs.getStarted.desc': '运行模板,并三步添加你的第一个模块。',
    'docs.getStarted.s1': '运行',
    'docs.getStarted.s1p':
      '直接用浏览器打开 index.html(file:// 即可);或用任意静态服务器托管本目录(如 python -m http.server)。',
    'docs.getStarted.s2': '新增模块',
    'docs.getStarted.s2p': '侧边栏每个一级菜单就是一个模块,三步完成创建:',
    'docs.getStarted.step1': '创建目录 js/modules/<name>/',
    'docs.getStarted.step2': '编写 manifest.js(元信息)+ i18n.js(模块词典)+ module.js(实现)',
    'docs.getStarted.step3': '在 js/core/boot.js 的 MODULE_DIRS 中登记目录名',
    'docs.getStarted.s3': '无需改动其它文件',
    'docs.getStarted.s3p':
      '新增模块不需要触碰 index.html 或任何核心文件——侧边栏、路由、懒加载全部由模块注册表自动推导。',
    'docs.tutorials.title': '教程',
    'docs.tutorials.desc': '模块契约:清单元信息、懒加载实现与子模块。',
    'docs.tutorials.s1': '清单(manifest.js)',
    'docs.tutorials.s1p':
      '声明 id、三语言标题、图标、路由、可选 css、children 与 i18nFile(懒加载的模块词典):',
    'docs.tutorials.code1':
      "App.registerModule({ id: 'mymod', title: { en: 'My Mod', 'zh-CN': '我的模块' }, icon: 'settings', route: '/mymod', load: 'module.js', i18nFile: 'i18n.js' })",
    'docs.tutorials.s2': '实现(module.js)',
    'docs.tutorials.s2p': '首次访问路由时才懒加载,注册 render 函数返回内容区 HTML:',
    'docs.tutorials.code2':
      "App.defineModule({ id: 'mymod', render: function (route, ctx) { return App.ui.placeholderCard(ctx.t, 'settings', ctx.t('mymod.title'), ctx.t('mymod.desc')); } })",
    'docs.tutorials.s3': '子模块(二级菜单)',
    'docs.tutorials.s3p':
      '在清单的 children 中声明子模块,每个子模块拥有独立路由与实现文件。你正在浏览的四个页面就是 docs 模块下的子模块。',
    'docs.changelog.title': '更新日志',
    'docs.changelog.desc': '本模板的版本历史与重要变更。',
    'docs.changelog.v1': 'v1.0.0 — 初始版本',
    'docs.changelog.l1': '纯 HTML/JS/CSS,零外部依赖',
    'docs.changelog.l2': '根目录单一 index.html + 首帧主题 PREPAINT 脚本',
    'docs.changelog.l3': '侧边栏菜单 = 模块,二级菜单 = 子模块,完全解耦',
    'docs.changelog.l4': 'Hash 路由 + 模块懒加载(file:// 可直接运行)',
    'docs.changelog.l5': '主题设置面板、三语言 i18n、可拖拽调宽侧边栏、移动端抽屉',
  },
  'zh-TW': {
    'docs.wip': '子模組示範',
    'docs.introduction.title': '簡介',
    'docs.introduction.desc': '模板架構概覽:單一入口、模組化目錄、模組間解耦。',
    'docs.introduction.s1': '架構',
    'docs.introduction.s1p': '根目錄只有一個 index.html 作為唯一入口,其餘全部按目錄組織:',
    'docs.introduction.l1': 'js/core/ — 核心執行時:引導、路由、設定、i18n、UI 元件、App Shell',
    'docs.introduction.l2': 'js/modules/ — 業務模組:側邊欄每個一級選單對應一個目錄',
    'docs.introduction.l3': 'assets/css/ — 設計系統(內置建置產物,含全部風格與調色板)',
    'docs.introduction.l4': 'assets/fonts/ — 本機字型,零 CDN 請求',
    'docs.introduction.s2': '零外部依賴',
    'docs.introduction.s2p':
      '無需 npm、無需建置、無需伺服器。直接雙擊 index.html 即可執行(file:// 協定,Hash 路由);也可放到任意靜態伺服器。字型、圖示、樣式均為本機檔案。',
    'docs.introduction.s3': '解耦原則',
    'docs.introduction.s3p':
      '模組之間互不引用:每個模組只透過核心層暴露的 API(App.ui / App.icon / ctx)工作,新增、刪除或出錯的模組都不會影響其它模組。',
    'docs.getStarted.title': '快速開始',
    'docs.getStarted.desc': '執行模板,並三步加入你的第一個模組。',
    'docs.getStarted.s1': '執行',
    'docs.getStarted.s1p':
      '直接用瀏覽器開啟 index.html(file:// 即可);或用任意靜態伺服器託管本目錄(如 python -m http.server)。',
    'docs.getStarted.s2': '新增模組',
    'docs.getStarted.s2p': '側邊欄每個一級選單就是一個模組,三步完成建立:',
    'docs.getStarted.step1': '建立目錄 js/modules/<name>/',
    'docs.getStarted.step2': '編寫 manifest.js(元資訊)+ i18n.js(模組辭典)+ module.js(實作)',
    'docs.getStarted.step3': '在 js/core/boot.js 的 MODULE_DIRS 中登記目錄名',
    'docs.getStarted.s3': '無需改動其它檔案',
    'docs.getStarted.s3p':
      '新增模組不需要觸碰 index.html 或任何核心檔案——側邊欄、路由、懶載入全部由模組註冊表自動推導。',
    'docs.tutorials.title': '教學',
    'docs.tutorials.desc': '模組契約:清單元資訊、懶載入實作與子模組。',
    'docs.tutorials.s1': '清單(manifest.js)',
    'docs.tutorials.s1p':
      '宣告 id、三語言標題、圖示、路由、可選 css、children 與 i18nFile(懶載入的模組辭典):',
    'docs.tutorials.code1':
      "App.registerModule({ id: 'mymod', title: { en: 'My Mod', 'zh-CN': '我的模組' }, icon: 'settings', route: '/mymod', load: 'module.js', i18nFile: 'i18n.js' })",
    'docs.tutorials.s2': '實作(module.js)',
    'docs.tutorials.s2p': '首次造訪路由時才懶載入,註冊 render 函式回傳內容區 HTML:',
    'docs.tutorials.code2':
      "App.defineModule({ id: 'mymod', render: function (route, ctx) { return App.ui.placeholderCard(ctx.t, 'settings', ctx.t('mymod.title'), ctx.t('mymod.desc')); } })",
    'docs.tutorials.s3': '子模組(二級選單)',
    'docs.tutorials.s3p':
      '在清單的 children 中宣告子模組,每個子模組擁有獨立路由與實作檔案。你正在瀏覽的四個頁面就是 docs 模組下的子模組。',
    'docs.changelog.title': '更新日誌',
    'docs.changelog.desc': '本模板的版本歷史與重要變更。',
    'docs.changelog.v1': 'v1.0.0 — 初始版本',
    'docs.changelog.l1': '純 HTML/JS/CSS,零外部依賴',
    'docs.changelog.l2': '根目錄單一 index.html + 首幀主題 PREPAINT 腳本',
    'docs.changelog.l3': '側邊欄選單 = 模組,二級選單 = 子模組,完全解耦',
    'docs.changelog.l4': 'Hash 路由 + 模組懶載入(file:// 可直接執行)',
    'docs.changelog.l5': '主題設定面板、三語言 i18n、可拖曳調寬側邊欄、行動端抽屜',
  },
};
