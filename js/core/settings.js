/* ============================================================
 * settings.js — 设置状态管理(零依赖)
 * ------------------------------------------------------------
 * - 持久化到 localStorage(存储键前缀 html-template-,独立命名空间)
 * - 所有读入值一律白名单校验:localStorage 可被用户篡改,
 *   非法值回退默认,避免把脏字符串带进 DOM class
 * ============================================================ */
(function () {
  'use strict';

  var STYLES = ['nova', 'vega', 'maia', 'lyra', 'mira', 'luma', 'sera', 'rhea'];
  var BASE_COLORS = ['neutral', 'stone', 'zinc', 'mauve', 'olive', 'mist', 'taupe'];
  var CHART_COLORS = [
    'amber',
    'blue',
    'cyan',
    'emerald',
    'fuchsia',
    'green',
    'indigo',
    'lime',
    'orange',
    'pink',
    'purple',
    'red',
    'rose',
    'sky',
    'teal',
    'violet',
    'yellow',
  ];
  var FONTS = [
    {
      value: 'inter',
      label: 'Inter',
      stack: "'Inter Variable', ui-sans-serif, system-ui, sans-serif",
    },
    {
      value: 'manrope',
      label: 'Manrope',
      stack: "'Manrope Variable', ui-sans-serif, system-ui, sans-serif",
    },
    { value: 'system', label: 'System', stack: 'ui-sans-serif, system-ui, sans-serif' },
  ];
  var RADII = [
    { value: 'default', labelKey: 'settings.radiusOptions.default', px: '0.625rem' },
    { value: 'none', labelKey: 'settings.radiusOptions.none', px: '0rem' },
    { value: 'sm', labelKey: 'settings.radiusOptions.sm', px: '0.25rem' },
    { value: 'md', labelKey: 'settings.radiusOptions.md', px: '0.5rem' },
    { value: 'lg', labelKey: 'settings.radiusOptions.lg', px: '0.75rem' },
    { value: 'full', labelKey: 'settings.radiusOptions.full', px: '9999px' },
  ];

  var SIDEBAR_DEFAULT_WIDTH = 256;
  var SIDEBAR_MIN_WIDTH = 160;
  var SIDEBAR_MAX_WIDTH = 480;

  /** 存储键前缀(独立命名空间) */
  var STORAGE_PREFIX = 'html-template';
  var K = function (key) {
    return STORAGE_PREFIX + '-' + key;
  };

  var APPEARANCE_DEFAULTS = {
    style: 'nova',
    baseColor: 'zinc',
    chartColor: 'zinc',
    radius: 'default',
    bodyFont: 'inter',
    headingFont: 'manrope',
    menuColor: 'default',
    menuAppearance: 'solid',
  };

  /** 设置子页数据默认值(同步到数据库 settings:profile / settings:account / settings:notifications) */
  var PROFILE_DEFAULTS = { username: '', email: '', bio: '', links: ['', ''] };
  var ACCOUNT_DEFAULTS = { name: '', dob: '', language: '' };
  var NOTIFICATIONS_DEFAULTS = {
    type: 'all',
    communication: false,
    marketing: false,
    social: true,
    security: true,
    mobile: false,
  };

  /** 读取 JSON 存储值(白名单形状校验:对象则合并默认,数组/字符串按类型) */
  function readJsonObject(key, defaults, listKeys) {
    var stored = readStorage(K(key));
    if (!stored) return Object.assign({}, defaults);
    try {
      var parsed = JSON.parse(stored);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        return Object.assign({}, defaults);
      var out = Object.assign({}, defaults, parsed);
      if (listKeys) {
        listKeys.forEach(function (lk) {
          if (!Array.isArray(out[lk])) out[lk] = defaults[lk].slice();
          else
            out[lk] = out[lk].filter(function (x) {
              return typeof x === 'string';
            });
        });
      }
      return out;
    } catch (e) {
      return Object.assign({}, defaults);
    }
  }

  /** 外观 radio-group 选项(设置面板与 Settings → 外观页共用) */
  var THEME_ITEMS = [
    { value: 'system', icon: 'theme-system', labelKey: 'header.system' },
    { value: 'light', icon: 'theme-light', labelKey: 'header.light' },
    { value: 'dark', icon: 'theme-dark', labelKey: 'header.dark' },
  ];
  var SIDEBAR_ITEMS = [
    { value: 'inset', icon: 'sidebar-inset', labelKey: 'settings.variantOptions.inset' },
    { value: 'floating', icon: 'sidebar-floating', labelKey: 'settings.variantOptions.floating' },
    { value: 'sidebar', icon: 'sidebar-sidebar', labelKey: 'settings.variantOptions.sidebar' },
  ];
  var LAYOUT_ITEMS = [
    { value: 'default', icon: 'layout-default', labelKey: 'settings.layoutOptions.default' },
    { value: 'icon', icon: 'layout-compact', labelKey: 'settings.layoutOptions.icon' },
    { value: 'offcanvas', icon: 'layout-full', labelKey: 'settings.layoutOptions.offcanvas' },
  ];

  function readStorage(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function writeStorage(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (e) {
      /* ignore */
    }
  }

  function removeStorage(key) {
    try {
      window.localStorage.removeItem(key);
    } catch (e) {
      /* ignore */
    }
  }

  /** 读取外观设置:全部白名单校验 */
  function readAppearance() {
    var ap = Object.assign({}, APPEARANCE_DEFAULTS);
    var style = readStorage(K('style'));
    if (style && STYLES.indexOf(style) !== -1) ap.style = style;
    var baseColor = readStorage(K('base'));
    if (baseColor && BASE_COLORS.indexOf(baseColor) !== -1) ap.baseColor = baseColor;
    var chartColor = readStorage(K('chart'));
    if (chartColor && CHART_COLORS.indexOf(chartColor) !== -1) ap.chartColor = chartColor;
    // 存储值为像素串(如 '0.5rem'),必须映射回 RadiusName
    var radius = readStorage(K('radius'));
    if (radius) {
      var r = RADII.find(function (x) {
        return x.px === radius;
      });
      if (r) ap.radius = r.value;
    }
    var f = readStorage(K('font'));
    if (f) {
      var bf = FONTS.find(function (x) {
        return x.stack === f;
      });
      if (bf) ap.bodyFont = bf.value;
    }
    var hf = readStorage(K('heading-font'));
    if (hf) {
      var h = FONTS.find(function (x) {
        return x.stack === hf;
      });
      if (h) ap.headingFont = h.value;
    }
    var menuColor = readStorage(K('menu-color'));
    if (menuColor === 'default' || menuColor === 'inverted') ap.menuColor = menuColor;
    var menuAppearance = readStorage(K('menu-appearance'));
    if (menuAppearance === 'solid' || menuAppearance === 'translucent')
      ap.menuAppearance = menuAppearance;
    return ap;
  }

  /** 读取完整设置 */
  function readSettings() {
    var storedLocale = readStorage(App.i18n.LOCALE_KEY);
    var locale =
      storedLocale === 'zh-CN' || storedLocale === 'zh-TW' || storedLocale === 'en'
        ? storedLocale
        : App.i18n.DEFAULT_LOCALE;
    var storedTheme = readStorage(K('theme'));
    var theme =
      storedTheme === 'system' || storedTheme === 'light' || storedTheme === 'dark'
        ? storedTheme
        : 'system';
    var storedVariant = readStorage(K('sidebar-variant'));
    var sidebarVariant =
      storedVariant === 'inset' || storedVariant === 'floating' || storedVariant === 'sidebar'
        ? storedVariant
        : 'inset';
    var storedCollapsible = readStorage(K('sidebar-collapsible'));
    var sidebarCollapsible =
      storedCollapsible === 'icon' || storedCollapsible === 'offcanvas'
        ? storedCollapsible
        : 'icon';
    var n = Number(readStorage(K('sidebar-width')));
    var sidebarWidth =
      Number.isFinite(n) && n >= SIDEBAR_MIN_WIDTH && n <= SIDEBAR_MAX_WIDTH
        ? n
        : SIDEBAR_DEFAULT_WIDTH;
    // 侧边栏隐藏的菜单项(显示页控制):JSON 数组,白名单为字符串
    var hiddenNav = [];
    var storedHidden = readStorage(K('hidden-nav'));
    if (storedHidden) {
      try {
        var arr = JSON.parse(storedHidden);
        if (Array.isArray(arr)) {
          hiddenNav = arr.filter(function (x) {
            return typeof x === 'string' && x;
          });
        }
      } catch (e) {
        /* 脏数据回退空数组 */
      }
    }
    return {
      locale: locale,
      theme: theme,
      appearance: readAppearance(),
      sidebarVariant: sidebarVariant,
      sidebarCollapsible: sidebarCollapsible,
      sidebarWidth: sidebarWidth,
      hiddenNav: hiddenNav,
      profile: readJsonObject('profile', PROFILE_DEFAULTS, ['links']),
      account: readJsonObject('account', ACCOUNT_DEFAULTS),
      notifications: readJsonObject('notifications', NOTIFICATIONS_DEFAULTS),
    };
  }

  function isDarkMode(theme) {
    return (
      theme === 'dark' ||
      (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    );
  }

  /** 应用主题/外观/侧边栏到 html 元素 */
  function applySettings(s) {
    var root = document.documentElement;
    var dark = isDarkMode(s.theme);
    root.classList.toggle('dark', dark);
    root.style.colorScheme = dark ? 'dark' : 'light';

    var applyMap = [
      ['style', s.appearance.style],
      ['base', s.appearance.baseColor],
      ['chart', s.appearance.chartColor],
      ['menu-color', s.appearance.menuColor],
      ['menu-appearance', s.appearance.menuAppearance],
    ];
    applyMap.forEach(function (pair) {
      var prefix = pair[0];
      var value = pair[1];
      Array.prototype.forEach.call(root.classList, function (c) {
        if (c.indexOf(prefix + '-') === 0) root.classList.remove(c);
      });
      root.classList.add(prefix + '-' + value);
    });

    var radiusPx = (
      RADII.find(function (r) {
        return r.value === s.appearance.radius;
      }) || RADII[0]
    ).px;
    root.style.setProperty('--radius', radiusPx);
    var bf = (
      FONTS.find(function (f) {
        return f.value === s.appearance.bodyFont;
      }) || FONTS[0]
    ).stack;
    var hf = (
      FONTS.find(function (f) {
        return f.value === s.appearance.headingFont;
      }) || FONTS[1]
    ).stack;
    root.style.setProperty('--font-sans-base', bf);
    root.style.setProperty('--font-heading-base', hf);

    root.setAttribute('data-sidebar-variant', s.sidebarVariant);
    root.setAttribute('data-sidebar-collapsible', s.sidebarCollapsible);
    root.style.setProperty('--sidebar-width', s.sidebarWidth + 'px');
    // wrapper 上有内联 style(--sidebar-width),优先级更高,必须同步更新
    var wrapper = document.querySelector('[data-slot="sidebar-wrapper"]');
    if (wrapper) wrapper.style.setProperty('--sidebar-width', s.sidebarWidth + 'px');
  }

  /** 持久化全部设置 */
  function persistSettings(s) {
    writeStorage(App.i18n.LOCALE_KEY, s.locale);
    writeStorage(K('theme'), s.theme);
    var radiusPx = (
      RADII.find(function (r) {
        return r.value === s.appearance.radius;
      }) || RADII[0]
    ).px;
    var writes = [
      [K('style'), s.appearance.style],
      [K('base'), s.appearance.baseColor],
      [K('chart'), s.appearance.chartColor],
      [K('radius'), radiusPx],
      [
        K('font'),
        (
          FONTS.find(function (f) {
            return f.value === s.appearance.bodyFont;
          }) || FONTS[0]
        ).stack,
      ],
      [
        K('heading-font'),
        (
          FONTS.find(function (f) {
            return f.value === s.appearance.headingFont;
          }) || FONTS[1]
        ).stack,
      ],
      [K('menu-color'), s.appearance.menuColor],
      [K('menu-appearance'), s.appearance.menuAppearance],
      [K('sidebar-variant'), s.sidebarVariant],
      [K('sidebar-collapsible'), s.sidebarCollapsible],
      [K('sidebar-width'), String(s.sidebarWidth)],
    ];
    writeStorage(K('hidden-nav'), JSON.stringify(s.hiddenNav || []));
    writeStorage(K('profile'), JSON.stringify(s.profile || PROFILE_DEFAULTS));
    writeStorage(K('account'), JSON.stringify(s.account || ACCOUNT_DEFAULTS));
    writeStorage(K('notifications'), JSON.stringify(s.notifications || NOTIFICATIONS_DEFAULTS));
    writes.forEach(function (w) {
      if (w[1]) writeStorage(w[0], w[1]);
    });
  }

  /** 重置全部设置到默认值并清除存储 */
  function resetAllSettings() {
    [
      App.i18n.LOCALE_KEY,
      K('theme'),
      K('style'),
      K('base'),
      K('chart'),
      K('radius'),
      K('font'),
      K('heading-font'),
      K('menu-color'),
      K('menu-appearance'),
      K('sidebar-variant'),
      K('sidebar-collapsible'),
      K('sidebar-width'),
      K('sidebar-open'),
      K('hidden-nav'),
      K('profile'),
      K('account'),
      K('notifications'),
    ].forEach(removeStorage);
    return {
      locale: App.i18n.DEFAULT_LOCALE,
      theme: 'system',
      appearance: Object.assign({}, APPEARANCE_DEFAULTS),
      sidebarVariant: 'inset',
      sidebarCollapsible: 'icon',
      sidebarWidth: SIDEBAR_DEFAULT_WIDTH,
      hiddenNav: [],
      profile: Object.assign({}, PROFILE_DEFAULTS),
      account: Object.assign({}, ACCOUNT_DEFAULTS),
      notifications: Object.assign({}, NOTIFICATIONS_DEFAULTS),
    };
  }

  window.App = window.App || {};
  App.settings = {
    STYLES: STYLES,
    BASE_COLORS: BASE_COLORS,
    CHART_COLORS: CHART_COLORS,
    FONTS: FONTS,
    RADII: RADII,
    SIDEBAR_DEFAULT_WIDTH: SIDEBAR_DEFAULT_WIDTH,
    SIDEBAR_MIN_WIDTH: SIDEBAR_MIN_WIDTH,
    SIDEBAR_MAX_WIDTH: SIDEBAR_MAX_WIDTH,
    STORAGE_PREFIX: STORAGE_PREFIX,
    K: K,
    APPEARANCE_DEFAULTS: APPEARANCE_DEFAULTS,
    PROFILE_DEFAULTS: PROFILE_DEFAULTS,
    ACCOUNT_DEFAULTS: ACCOUNT_DEFAULTS,
    NOTIFICATIONS_DEFAULTS: NOTIFICATIONS_DEFAULTS,
    THEME_ITEMS: THEME_ITEMS,
    SIDEBAR_ITEMS: SIDEBAR_ITEMS,
    LAYOUT_ITEMS: LAYOUT_ITEMS,
    readSettings: readSettings,
    applySettings: applySettings,
    persistSettings: persistSettings,
    resetAllSettings: resetAllSettings,
    isDarkMode: isDarkMode,
    readStorage: readStorage,
    writeStorage: writeStorage,
  };
})();
