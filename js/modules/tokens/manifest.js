/* ============================================================
 * tokens 模块 — 清单
 * ============================================================ */
App.registerModule({
  id: 'tokens',
  title: { 'zh-CN': '令牌', 'zh-TW': '令牌', en: 'Tokens' },
  icon: 'key-round',
  route: '/tokens',
  load: 'module.js',
  i18n: {
    en: {
      'tokens.title': 'Tokens',
      'tokens.desc': 'Create and rotate API tokens, set quotas and expiry policies.',
    },
    'zh-CN': {
      'tokens.title': '令牌',
      'tokens.desc': '创建与轮换 API 令牌,设置配额与过期策略。',
    },
    'zh-TW': {
      'tokens.title': '令牌',
      'tokens.desc': '建立與輪換 API 令牌,設定配額與到期策略。',
    },
  },
});
