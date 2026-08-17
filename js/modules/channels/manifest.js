/* ============================================================
 * channels 模块 — 清单
 * ============================================================ */
App.registerModule({
  id: 'channels',
  title: { 'zh-CN': '渠道', 'zh-TW': '渠道', en: 'Channels' },
  icon: 'route',
  route: '/channels',
  load: 'module.js',
  i18n: {
    en: {
      'channels.title': 'Channels',
      'channels.desc': 'Manage API channels, upstream providers and load balancing.',
    },
    'zh-CN': {
      'channels.title': '渠道',
      'channels.desc': '管理 API 渠道、上游供应商与负载均衡。',
    },
    'zh-TW': {
      'channels.title': '渠道',
      'channels.desc': '管理 API 渠道、上游供應商與負載平衡。',
    },
  },
});
