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
  i18n: {
    en: {
      'home.welcomeTitle': 'Welcome back',
      'home.welcomeDesc':
        'This is a pure HTML/JS/CSS admin template — a draggable / collapsible sidebar, frosted-glass header and a single scrolling content region, with zero external dependencies.',
      'home.overview': 'Overview',
      'home.statRequests': 'Total Requests',
      'home.statTokens': 'Total Tokens',
      'home.statChannels': 'Channels',
      'home.statLatency': 'Avg Latency',
      'home.activityTitle': 'Recent Activity',
      'home.activityDesc': 'The list is intentionally long to demonstrate the single-scroll-region layout.',
      'home.success': 'Success',
      'home.retrying': 'Retrying',
      'home.requestTitle': 'Request {n} completed',
    },
    'zh-CN': {
      'home.welcomeTitle': '欢迎回来',
      'home.welcomeDesc':
        '这是一个纯 HTML/JS/CSS 管理后台模板——可拖拽/可折叠侧边栏、毛玻璃顶栏与单一内容滚动区,零外部依赖。',
      'home.overview': '概览',
      'home.statRequests': '总请求数',
      'home.statTokens': '令牌总量',
      'home.statChannels': '渠道数',
      'home.statLatency': '平均延迟',
      'home.activityTitle': '最近活动',
      'home.activityDesc': '列表特意加长,用于验证单一滚动区布局。',
      'home.success': '成功',
      'home.retrying': '重试中',
      'home.requestTitle': '请求 {n} 已完成',
    },
    'zh-TW': {
      'home.welcomeTitle': '歡迎回來',
      'home.welcomeDesc':
        '這是一個純 HTML/JS/CSS 管理後台模板——可拖曳/可收合側邊欄、毛玻璃頂欄與單一內容捲動區,零外部依賴。',
      'home.overview': '總覽',
      'home.statRequests': '總請求數',
      'home.statTokens': '令牌總量',
      'home.statChannels': '渠道數',
      'home.statLatency': '平均延遲',
      'home.activityTitle': '最近活動',
      'home.activityDesc': '清單刻意加長,用於驗證單一捲動區佈局。',
      'home.success': '成功',
      'home.retrying': '重試中',
      'home.requestTitle': '請求 {n} 已完成',
    },
  },
});
