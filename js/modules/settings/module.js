/* ============================================================
 * settings 模块 — 实现(懒加载,首次访问 /settings 时下载)
 * ------------------------------------------------------------
 * 从 mpages 移植的 Settings 二级子菜单页面(仅页面内容,无功能):
 * 个人资料 / 账号 / 外观 / 通知 / 显示。
 * 父模块按路由分发到对应页面渲染;表单为静态展示(无提交/校验)。
 * 只依赖核心层 App.ui / App.icon / App.settings / ctx。
 * ============================================================ */
(function () {
  'use strict';

  var S = function () { return App.settings; };
  var icon = function () { return App.icon; };

  /* ---------- 页内子导航(与主侧边栏二级菜单一致) ---------- */
  var NAV = [
    { id: 'profile', route: '/settings', icon: 'user-cog', titleKey: 'profile.title' },
    { id: 'account', route: '/settings/account', icon: 'wrench', titleKey: 'account.title' },
    { id: 'appearance', route: '/settings/appearance', icon: 'palette', titleKey: 'appearance.title' },
    { id: 'notifications', route: '/settings/notifications', icon: 'bell', titleKey: 'notifications.title' },
    { id: 'display', route: '/settings/display', icon: 'monitor', titleKey: 'display.title' },
  ];

  /* ---------- 通用布局 ---------- */
  function contentSection(t, titleKey, descKey, body) {
    return '<div class="sp-section">' +
      '<h3>' + t(titleKey) + '</h3>' +
      '<p class="sp-section-desc">' + t(descKey) + '</p>' +
      '<div class="sp-sep"></div>' +
      '<div class="sp-section-body"><div class="sp-section-inner">' + body + '</div></div>' +
      '</div>';
  }

  /* ---------- 个人资料 ---------- */
  function pageProfile(ctx) {
    var t = ctx.t;
    var body =
      '<form class="sp-form">' +
      '<div class="sp-field">' +
      '<label class="sp-label">' + t('profile.username.label') + '</label>' +
      '<input class="sp-input" type="text" value="shadcn" placeholder="' + t('profile.username.placeholder') + '" />' +
      '<p class="sp-field-desc">' + t('profile.username.description') + '</p>' +
      '</div>' +
      '<div class="sp-field">' +
      '<label class="sp-label">' + t('profile.email.label') + '</label>' +
      '<select class="sp-select"><option>m@example.com</option><option>m@google.com</option><option>m@support.com</option></select>' +
      '<p class="sp-field-desc">' + t('profile.email.descriptionBefore') +
      ' <a href="#/settings" data-link="/settings">' + t('profile.email.emailSettings') + '</a>.</p>' +
      '</div>' +
      '<div class="sp-field">' +
      '<label class="sp-label">' + t('profile.bio.label') + '</label>' +
      '<textarea class="sp-textarea" placeholder="' + t('profile.bio.placeholder') + '">I own a computer.</textarea>' +
      '<p class="sp-field-desc">' + t('profile.bio.descriptionBefore') +
      ' <span>' + t('profile.bio.mention') + '</span> ' + t('profile.bio.descriptionAfter') + '</p>' +
      '</div>' +
      '<div class="sp-field">' +
      '<label class="sp-label">' + t('profile.urls.label') + '</label>' +
      '<p class="sp-field-desc">' + t('profile.urls.description') + '</p>' +
      '<input class="sp-input" type="url" value="https://shadcn.com" />' +
      '<input class="sp-input" type="url" value="http://twitter.com/shadcn" />' +
      '<button type="button" class="' + App.ui.buttonClass('outline', 'sm') + '">' + t('profile.urls.add') + '</button>' +
      '</div>' +
      '<button type="button" class="' + App.ui.buttonClass('default') + '">' + t('profile.submit') + '</button>' +
      '</form>';
    return contentSection(t, 'profile.title', 'profile.description', body);
  }

  /* ---------- 账号 ---------- */
  var ACCOUNT_LANGUAGES = [
    { label: 'English', value: 'en' },
    { label: 'French', value: 'fr' },
    { label: 'German', value: 'de' },
    { label: 'Spanish', value: 'es' },
    { label: 'Portuguese', value: 'pt' },
    { label: 'Russian', value: 'ru' },
    { label: 'Japanese', value: 'ja' },
    { label: 'Korean', value: 'ko' },
    { label: 'Chinese', value: 'zh' },
  ];

  function pageAccount(ctx) {
    var t = ctx.t;
    var langOptions = '<option value="" disabled selected>' + t('account.language.selectPlaceholder') + '</option>' +
      ACCOUNT_LANGUAGES.map(function (l) {
        return '<option value="' + l.value + '">' + l.label + '</option>';
      }).join('');
    var body =
      '<form class="sp-form">' +
      '<div class="sp-field">' +
      '<label class="sp-label">' + t('account.name.label') + '</label>' +
      '<input class="sp-input" type="text" placeholder="' + t('account.name.placeholder') + '" />' +
      '<p class="sp-field-desc">' + t('account.name.description') + '</p>' +
      '</div>' +
      '<div class="sp-field">' +
      '<label class="sp-label">' + t('account.dob.label') + '</label>' +
      '<input class="sp-date" type="date" />' +
      '<p class="sp-field-desc">' + t('account.dob.description') + '</p>' +
      '</div>' +
      '<div class="sp-field">' +
      '<label class="sp-label">' + t('account.language.label') + '</label>' +
      '<select class="sp-select">' + langOptions + '</select>' +
      '<p class="sp-field-desc">' + t('account.language.description') + '</p>' +
      '</div>' +
      '<button type="button" class="' + App.ui.buttonClass('default') + '">' + t('account.submit') + '</button>' +
      '</form>';
    return contentSection(t, 'account.title', 'account.description', body);
  }

  /* ---------- 外观(mpages radio-group 风格,与设置面板同源,静态展示) ---------- */
  function optSection(t, titleKey, inner) {
    return '<div class="sp-opt-group">' +
      '<span class="sp-opt-title">' + t(titleKey) + '</span>' + inner +
      '</div>';
  }

  function optCheck(selected) {
    return selected ? '<span class="sp-opt-check">' + icon().iconSvg('circle-check') + '</span>' : '';
  }

  /** 图标预览卡(主题/侧边栏/布局):选中描边 ring-primary + 阴影 + 对勾徽标,点击实时生效 */
  function optCard(iconName, label, selected, isTheme, extra) {
    var fill = isTheme ? '' : selected ? 'fill-primary stroke-primary' : 'fill-muted-foreground stroke-muted-foreground';
    return '<button type="button" data-settings-card="' + extra + '" aria-pressed="' + selected + '" class="sp-opt' + (selected ? ' is-active' : '') + '">' +
      '<span class="sp-opt-frame">' +
      optCheck(selected) +
      icon().previewIcon(iconName, fill) +
      '</span>' +
      '<span class="sp-opt-label">' + label + '</span>' +
      '</button>';
  }

  /** 色板卡(基础色/强调色):bordered 卡片 + 对勾徽标,点击实时生效 */
  function swatchRow(current, colors, cols, kind) {
    return '<div class="sp-radio-grid sp-cols-' + cols + '">' +
      colors.map(function (c) {
        var sel = current === c;
        return '<button type="button" data-swatch="' + kind + '" data-value="' + c + '" aria-pressed="' + sel + '" class="sp-opt' + (sel ? ' is-active' : '') + '">' +
          '<span class="sp-opt-swatch">' +
          optCheck(sel) +
          '<span class="sp-opt-dot swatch-' + c + '"></span>' +
          '<span class="sp-opt-swatch-label">' + c + '</span>' +
          '</span>' +
          '</button>';
      }).join('') + '</div>';
  }

  /** 文本卡(风格/字体/圆角/菜单):h-14 描边卡片 + 对勾徽标,点击实时生效 */
  function segRow(options, current, cols, kind) {
    return '<div class="sp-radio-grid sp-cols-' + cols + '">' +
      options.map(function (o) {
        var sel = current === o.value;
        return '<button type="button" data-segmented="' + kind + '" data-value="' + o.value + '" aria-pressed="' + sel + '" class="sp-opt' + (sel ? ' is-active' : '') + '">' +
          '<span class="sp-opt-text">' +
          optCheck(sel) +
          '<span class="text-sm font-medium">' + o.label + '</span>' +
          '</span>' +
          '</button>';
      }).join('') + '</div>';
  }

  function readonlyRow(label, value) {
    return '<div class="sp-readonly">' +
      '<span class="sp-readonly-label">' + label + '</span>' +
      '<span class="sp-readonly-value">' + value + '</span>' +
      '</div>';
  }

  function pageAppearance(ctx) {
    var t = ctx.t;
    var s = ctx.settings;
    var ap = s.appearance;
    var st = S();

    var layout = s.sidebarVariant === 'inset' ? 'default' : s.sidebarCollapsible === 'offcanvas' ? 'offcanvas' : 'icon';

    var themeItems = [
      { value: 'system', icon: 'theme-system', labelKey: 'header.system' },
      { value: 'light', icon: 'theme-light', labelKey: 'header.light' },
      { value: 'dark', icon: 'theme-dark', labelKey: 'header.dark' },
    ];
    var sidebarItems = [
      { value: 'inset', icon: 'sidebar-inset', labelKey: 'settings.variantOptions.inset' },
      { value: 'floating', icon: 'sidebar-floating', labelKey: 'settings.variantOptions.floating' },
      { value: 'sidebar', icon: 'sidebar-sidebar', labelKey: 'settings.variantOptions.sidebar' },
    ];
    var layoutItems = [
      { value: 'default', icon: 'layout-default', labelKey: 'settings.layoutOptions.default' },
      { value: 'icon', icon: 'layout-compact', labelKey: 'settings.layoutOptions.icon' },
      { value: 'offcanvas', icon: 'layout-full', labelKey: 'settings.layoutOptions.offcanvas' },
    ];

    var body =
      '<div class="sp-form">' +
      optSection(t, 'settings.theme',
        '<div class="sp-radio-grid sp-cols-3">' +
        themeItems.map(function (it) { return optCard(it.icon, t(it.labelKey), s.theme === it.value, true, 'theme:' + it.value); }).join('') +
        '</div>') +
      optSection(t, 'settings.sidebar',
        '<div class="sp-radio-grid sp-cols-3">' +
        sidebarItems.map(function (it) { return optCard(it.icon, t(it.labelKey), s.sidebarVariant === it.value, false, 'sidebar:' + it.value); }).join('') +
        '</div>') +
      optSection(t, 'settings.layout',
        '<div class="sp-radio-grid sp-cols-3">' +
        layoutItems.map(function (it) { return optCard(it.icon, t(it.labelKey), layout === it.value, false, 'layout:' + it.value); }).join('') +
        '</div>') +
      optSection(t, 'settings.baseColor', swatchRow(ap.baseColor, st.BASE_COLORS, 7, 'base')) +
      optSection(t, 'settings.chartColor', swatchRow(ap.chartColor, [ap.baseColor].concat(st.CHART_COLORS), 6, 'chart')) +
      optSection(t, 'settings.style',
        segRow(st.STYLES.map(function (v) { return { value: v, label: v }; }), ap.style, 4, 'style')) +
      optSection(t, 'settings.bodyFont',
        segRow(st.FONTS.map(function (f) { return { value: f.value, label: f.label }; }), ap.bodyFont, 3, 'body-font')) +
      optSection(t, 'settings.headingFont',
        segRow(st.FONTS.map(function (f) { return { value: f.value, label: f.label }; }), ap.headingFont, 3, 'heading-font')) +
      readonlyRow(t('settings.iconLibrary'), t('settings.lucide')) +
      optSection(t, 'settings.radius',
        segRow(st.RADII.map(function (r) { return { value: r.value, label: t(r.labelKey) }; }), ap.radius, 6, 'radius')) +
      optSection(t, 'settings.menuColor',
        segRow([
          { value: 'default', label: t('settings.menuColorOptions.default') },
          { value: 'inverted', label: t('settings.menuColorOptions.inverted') },
        ], ap.menuColor, 2, 'menu-color')) +
      optSection(t, 'settings.menuAppearance',
        segRow([
          { value: 'solid', label: t('settings.menuAppearanceOptions.solid') },
          { value: 'translucent', label: t('settings.menuAppearanceOptions.translucent') },
        ], ap.menuAppearance, 2, 'menu-appearance')) +
      readonlyRow(t('settings.menuAccent'), t('settings.subtle')) +
      '<button type="button" data-reset-appearance class="' + App.ui.buttonClass('destructive') + '">' + t('appearance.reset') + '</button>' +
      '</div>';
    return contentSection(t, 'appearance.title', 'appearance.description', body);
  }

  /* ---------- 通知 ---------- */
  function switchRow(t, labelKey, descKey, on, disabled) {
    return '<div class="sp-switch-row">' +
      '<div class="sp-switch-info">' +
      '<label class="sp-label">' + t(labelKey) + '</label>' +
      '<p class="sp-field-desc">' + t(descKey) + '</p>' +
      '</div>' +
      '<span role="switch" aria-checked="' + on + '" class="sp-switch' + (on ? ' is-on' : '') + (disabled ? ' is-disabled' : '') + '"></span>' +
      '</div>';
  }

  function pageNotifications(ctx) {
    var t = ctx.t;
    var radioItem = function (value, labelKey, checked) {
      return '<label class="sp-radio">' +
        '<input type="radio" name="notify-type" value="' + value + '"' + (checked ? ' checked' : '') + ' />' +
        '<span class="sp-label">' + t(labelKey) + '</span>' +
        '</label>';
    };
    var body =
      '<form class="sp-form">' +
      '<div class="sp-field">' +
      '<label class="sp-label">' + t('notifications.notifyLabel') + '</label>' +
      radioItem('all', 'notifications.type.all', true) +
      radioItem('mentions', 'notifications.type.mentions', false) +
      radioItem('none', 'notifications.type.none', false) +
      '</div>' +
      '<div>' +
      '<h3 class="mb-4 text-lg font-medium" style="font-family:var(--font-heading-base,inherit)">' + t('notifications.emailSection') + '</h3>' +
      '<div style="display:flex;flex-direction:column;gap:1rem">' +
      switchRow(t, 'notifications.communication.label', 'notifications.communication.description', false, false) +
      switchRow(t, 'notifications.marketing.label', 'notifications.marketing.description', false, false) +
      switchRow(t, 'notifications.social.label', 'notifications.social.description', true, false) +
      switchRow(t, 'notifications.security.label', 'notifications.security.description', true, true) +
      '</div></div>' +
      '<div class="sp-radio" style="align-items:flex-start">' +
      '<span class="sp-checkbox"></span>' +
      '<div class="sp-switch-info" style="gap:0.25rem">' +
      '<label class="sp-label" style="line-height:1.5">' + t('notifications.mobile.label') + '</label>' +
      '<p class="sp-field-desc">' + t('notifications.mobile.descriptionBefore') +
      ' <a href="#/settings" data-link="/settings">' + t('notifications.mobile.mobileSettings') + '</a> ' +
      t('notifications.mobile.descriptionAfter') + '</p>' +
      '</div></div>' +
      '<button type="button" class="' + App.ui.buttonClass('default') + '">' + t('notifications.submit') + '</button>' +
      '</form>';
    return contentSection(t, 'notifications.title', 'notifications.description', body);
  }

  /* ---------- 显示(侧边栏显示控制:勾选实时控制侧边栏可见性,设置项锁定) ---------- */
  function pageDisplay(ctx) {
    var t = ctx.t;
    var hidden = ctx.settings.hiddenNav || [];
    // 用不过滤的完整列表,隐藏项也要能在此重新显示
    var items = App.buildAllNavItems(ctx.settings.locale);
    var rows = items.map(function (item) {
      var locked = item.id === 'settings';
      var checked = hidden.indexOf(item.id) === -1;
      return '<button type="button" data-nav-toggle="' + item.id + '" class="sp-display-item' +
        (locked ? ' is-locked' : '') + (checked ? '' : ' is-hidden') + '">' +
        '<span class="sp-checkbox' + (checked ? ' is-checked' : '') + '">' +
        (checked ? icon().iconSvg('check', { class: 'size-3' }) : '') + '</span>' +
        '<span class="sp-item-icon">' + icon().iconSvg(item.icon) + '</span>' +
        '<span class="sp-item-title">' + item.title + '</span>' +
        (locked ? '<span class="sp-lock">' + icon().iconSvg('lock') + t('display.locked') + '</span>' : '') +
        '</button>';
    }).join('');
    var body =
      '<div class="sp-display-group">' +
      '<h4>' + t('display.sidebar.label') + '</h4>' +
      '<div class="sp-display-items">' + rows + '</div>' +
      '</div>' +
      '<p class="sp-display-hint">' + t('display.lockHint') + '</p>';
    return contentSection(t, 'display.title', 'display.description', body);
  }

  /* ---------- 分发 ---------- */
  var PAGES = {
    profile: pageProfile,
    account: pageAccount,
    appearance: pageAppearance,
    notifications: pageNotifications,
    display: pageDisplay,
  };

  function render(route, ctx) {
    var t = ctx.t;
    var pageId = route === '/settings' ? 'profile' : route.split('/').pop();
    var renderer = PAGES[pageId] || null;
    var bodyHtml = renderer ? renderer(ctx) : App.ui.notFound(t);

    var navHtml = NAV.map(function (n) {
      var active = n.id === pageId;
      return '<a href="#' + n.route + '" data-link="' + n.route + '" class="sp-nav-link' + (active ? ' is-active' : '') + '">' +
        icon().iconSvg(n.icon, { class: 'size-4' }) +
        '<span>' + t(n.titleKey) + '</span>' +
        '</a>';
    }).join('');

    return '<div class="sp-page">' +
      '<div class="sp-page-head">' +
      '<h1>' + t('settings.title') + '</h1>' +
      '<p>' + t('settings.description') + '</p>' +
      '</div>' +
      '<div class="sp-sep"></div>' +
      '<div class="sp-body">' +
      '<aside class="sp-nav-col"><nav class="sp-nav">' + navHtml + '</nav></aside>' +
      '<div class="sp-content">' + bodyHtml + '</div>' +
      '</div>' +
      '</div>';
  }

  App.defineModule({ id: 'settings', render: render });
})();
