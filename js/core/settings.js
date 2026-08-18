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

  // 工作空间强调色:zinc + 主题面板的 17 种强调色(与主题设置面板一致)
  var WORKSPACE_COLORS = ['zinc'].concat(CHART_COLORS);
  // 工作空间预设图标(均为 icons-data.js 中已内置的 lucide 图标)
  var WORKSPACE_ICONS = [
    'house',
    'briefcase',
    'book-open',
    'heart',
    'gamepad-2',
    'plane',
    'folder',
    'star',
    'globe',
    'layers',
    'sparkles',
    'users',
    'building-2',
    'shopping-bag',
    'graduation-cap',
    'coffee',
    'trophy',
    'rocket',
  ];
  // 默认工作空间(首次启动无本地数据时使用)。
  // names 为三语显示名(zh-CN/en 必填,zh-TW 可选);id 采用 ws-英文名称 规则。
  var DEFAULT_WORKSPACES = [
    {
      id: 'ws-default',
      name: '默认',
      names: { 'zh-CN': '默认', 'zh-TW': '預設', en: 'Default' },
      icon: 'house',
      color: 'zinc',
      note: '',
    },
    {
      id: 'ws-work',
      name: '工作',
      names: { 'zh-CN': '工作', 'zh-TW': '工作', en: 'Work' },
      icon: 'briefcase',
      color: 'blue',
      note: '',
    },
    {
      id: 'ws-study',
      name: '学习',
      names: { 'zh-CN': '学习', 'zh-TW': '學習', en: 'Study' },
      icon: 'book-open',
      color: 'violet',
      note: '',
    },
    {
      id: 'ws-life',
      name: '生活',
      names: { 'zh-CN': '生活', 'zh-TW': '生活', en: 'Life' },
      icon: 'heart',
      color: 'rose',
      note: '',
    },
    {
      id: 'ws-fun',
      name: '娱乐',
      names: { 'zh-CN': '娱乐', 'zh-TW': '娛樂', en: 'Entertainment' },
      icon: 'gamepad-2',
      color: 'emerald',
      note: '',
    },
    {
      id: 'ws-travel',
      name: '旅游',
      names: { 'zh-CN': '旅游', 'zh-TW': '旅遊', en: 'Travel' },
      icon: 'plane',
      color: 'sky',
      note: '',
    },
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
  // 头像:type ∈ initial(用户名首字母)/ icon(预设图标)/ emoji / image(上传后裁剪为 256×256 方形 dataURL)
  var AVATAR_TYPES = ['initial', 'icon', 'emoji', 'image'];
  var AVATAR_ICONS = [
    'user',
    'rocket',
    'star',
    'heart',
    'sparkles',
    'globe',
    'plane',
    'coffee',
    'trophy',
    'brain-circuit',
    'key-round',
    'layers',
    'gamepad-2',
    'palette',
    'sun',
    'moon',
    'briefcase',
    'graduation-cap',
  ];
  var AVATAR_EMOJIS = [
    '😀',
    '😎',
    '🤖',
    '🚀',
    '🌟',
    '🎯',
    '💡',
    '🎨',
    '☕',
    '🐱',
    '🐶',
    '🌸',
    '🍀',
    '⚡',
    '🔥',
    '👑',
    '🎮',
    '📚',
    '🎵',
    '🏆',
  ];
  // 头像数据串长度上限(256×256 JPEG 约 20-40KB,此处留足余量防 localStorage/数据库膨胀)
  var AVATAR_MAX_IMAGE_LENGTH = 400000;

  var PROFILE_DEFAULTS = {
    username: '',
    email: '',
    bio: '',
    links: ['', ''],
    avatar: { type: 'initial', value: '' },
  };

  /** 头像字段白名单校验(类型枚举 + 值类型/长度上限),脏数据回退默认 */
  function sanitizeAvatar(avatar) {
    var a = avatar && typeof avatar === 'object' ? avatar : {};
    var type = AVATAR_TYPES.indexOf(a.type) !== -1 ? a.type : 'initial';
    var value = typeof a.value === 'string' ? a.value.slice(0, AVATAR_MAX_IMAGE_LENGTH) : '';
    if (type === 'icon' && AVATAR_ICONS.indexOf(value) === -1) value = 'user';
    return { type: type, value: value };
  }
  var ACCOUNT_DEFAULTS = { name: '', dob: '', language: '' };
  var NOTIFICATIONS_DEFAULTS = {
    type: 'all',
    communication: false,
    marketing: false,
    social: true,
    security: true,
    mobile: false,
  };
  var SIDEBAR_VARIANTS = ['inset', 'floating', 'sidebar'];

  /* ---------- 配置文件(VSCode 风格:保存 外观/通知/显示 的设置组合,支持增删改与切换) ---------- */
  // 每个配置文件的 snapshot 为 { <域>: <该域设置> } 的结构;
  // 新增域时只需在 PROFILE_HANDLERS 增加一项(capture 抓取 / apply 还原),
  // 捕获与应用逻辑全部由 profileCapture / profileApply 按表驱动,无需改动其它代码。
  var DEFAULT_PROFILES = [
    { id: 'p-default', name: '', nameKey: 'profiles.defaultName', snapshot: {} },
  ];

  var PROFILE_HANDLERS = {
    appearance: {
      capture: function (s) {
        var ap = s.appearance || {};
        return {
          theme: s.theme,
          style: ap.style,
          baseColor: ap.baseColor,
          chartColor: ap.chartColor,
          radius: ap.radius,
          bodyFont: ap.bodyFont,
          headingFont: ap.headingFont,
          menuColor: ap.menuColor,
          menuAppearance: ap.menuAppearance,
        };
      },
      apply: function (out, data) {
        data = data || {};
        out.theme =
          data.theme === 'system' || data.theme === 'light' || data.theme === 'dark'
            ? data.theme
            : 'system';
        var ap = Object.assign({}, APPEARANCE_DEFAULTS, data);
        ap.style = STYLES.indexOf(ap.style) !== -1 ? ap.style : APPEARANCE_DEFAULTS.style;
        ap.baseColor =
          BASE_COLORS.indexOf(ap.baseColor) !== -1 ? ap.baseColor : APPEARANCE_DEFAULTS.baseColor;
        ap.chartColor =
          CHART_COLORS.indexOf(ap.chartColor) !== -1
            ? ap.chartColor
            : APPEARANCE_DEFAULTS.chartColor;
        ap.radius = RADII.some(function (r) {
          return r.value === ap.radius;
        })
          ? ap.radius
          : APPEARANCE_DEFAULTS.radius;
        ap.bodyFont = FONTS.some(function (f) {
          return f.value === ap.bodyFont;
        })
          ? ap.bodyFont
          : APPEARANCE_DEFAULTS.bodyFont;
        ap.headingFont = FONTS.some(function (f) {
          return f.value === ap.headingFont;
        })
          ? ap.headingFont
          : APPEARANCE_DEFAULTS.headingFont;
        ap.menuColor = ap.menuColor === 'inverted' ? 'inverted' : 'default';
        ap.menuAppearance = ap.menuAppearance === 'translucent' ? 'translucent' : 'solid';
        out.appearance = ap;
      },
    },
    notifications: {
      capture: function (s) {
        return Object.assign({}, NOTIFICATIONS_DEFAULTS, s.notifications || {});
      },
      apply: function (out, data) {
        out.notifications = Object.assign({}, NOTIFICATIONS_DEFAULTS, data || {});
      },
    },
    display: {
      capture: function (s) {
        return {
          sidebarOpen: !!s.sidebarOpen,
          sidebarVariant: s.sidebarVariant,
          sidebarCollapsible: s.sidebarCollapsible,
          sidebarWidth: s.sidebarWidth,
          hiddenNav: (s.hiddenNav || []).slice(),
        };
      },
      apply: function (out, data) {
        data = data || {};
        out.sidebarOpen = data.sidebarOpen === undefined ? true : !!data.sidebarOpen;
        out.sidebarVariant =
          SIDEBAR_VARIANTS.indexOf(data.sidebarVariant) !== -1 ? data.sidebarVariant : 'inset';
        out.sidebarCollapsible =
          data.sidebarCollapsible === 'icon' || data.sidebarCollapsible === 'offcanvas'
            ? data.sidebarCollapsible
            : 'icon';
        var n = Number(data.sidebarWidth);
        out.sidebarWidth =
          Number.isFinite(n) && n >= SIDEBAR_MIN_WIDTH && n <= SIDEBAR_MAX_WIDTH
            ? n
            : SIDEBAR_DEFAULT_WIDTH;
        out.hiddenNav = Array.isArray(data.hiddenNav)
          ? data.hiddenNav.filter(function (x) {
              return typeof x === 'string' && x;
            })
          : [];
      },
    },
  };

  /** 抓取当前设置为配置文件快照(按 PROFILE_HANDLERS 域表驱动,天然可扩展) */
  function profileCapture(s) {
    var snap = {};
    Object.keys(PROFILE_HANDLERS).forEach(function (k) {
      snap[k] = PROFILE_HANDLERS[k].capture(s);
    });
    return snap;
  }

  /** 把配置文件快照应用到设置对象(保留未涉及字段;各域值做白名单校验) */
  function profileApply(s, snapshot) {
    var out = Object.assign({}, s);
    Object.keys(PROFILE_HANDLERS).forEach(function (k) {
      if (snapshot && snapshot[k]) PROFILE_HANDLERS[k].apply(out, snapshot[k]);
    });
    return out;
  }

  /** 默认配置文件快照(基于出厂默认设置) */
  function defaultProfiles() {
    var base = {
      theme: 'system',
      appearance: Object.assign({}, APPEARANCE_DEFAULTS),
      notifications: Object.assign({}, NOTIFICATIONS_DEFAULTS),
      sidebarOpen: true,
      sidebarVariant: 'inset',
      sidebarCollapsible: 'icon',
      sidebarWidth: SIDEBAR_DEFAULT_WIDTH,
      hiddenNav: [],
    };
    return DEFAULT_PROFILES.map(function (p) {
      return {
        id: p.id,
        name: p.name,
        nameKey: p.nameKey,
        snapshot: profileCapture(base),
      };
    });
  }

  /** 规范化任意来源的配置文件对象(白名单形状,脏数据回退空值) */
  function normalizeProfile(p) {
    return {
      id: String(p && p.id ? p.id : ''),
      name: p && typeof p.name === 'string' ? p.name : '',
      nameKey: p && typeof p.nameKey === 'string' ? p.nameKey : '',
      snapshot: p && p.snapshot && typeof p.snapshot === 'object' ? p.snapshot : {},
    };
  }

  /** 读取配置文件列表(非法项丢弃,空列表回退默认;始终确保内置默认配置文件存在) */
  function readProfiles() {
    var stored = readStorage(K('profiles'));
    if (!stored) return defaultProfiles();
    try {
      var arr = JSON.parse(stored);
      if (!Array.isArray(arr) || !arr.length) return defaultProfiles();
      var out = arr
        .filter(function (p) {
          return (
            p &&
            typeof p === 'object' &&
            typeof p.id === 'string' &&
            p.id &&
            (typeof p.name === 'string' || typeof p.nameKey === 'string')
          );
        })
        .map(normalizeProfile);
      if (!out.length) return defaultProfiles();
      if (
        !out.some(function (p) {
          return p.id === DEFAULT_PROFILES[0].id;
        })
      )
        out.unshift(defaultProfiles()[0]);
      return out;
    } catch (e) {
      return defaultProfiles();
    }
  }

  /** 读取当前配置文件 id(不在列表中则回退第一个) */
  function readActiveProfile(profiles) {
    var stored = readStorage(K('active-profile'));
    if (
      stored &&
      profiles.some(function (p) {
        return p.id === stored;
      })
    ) {
      return stored;
    }
    return profiles[0].id;
  }

  /** 按 id 查找配置文件(找不到回退第一个) */
  function findProfile(list, id) {
    var arr = list && list.length ? list : defaultProfiles();
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].id === id) return arr[i];
    }
    return arr[0];
  }

  /** 配置文件显示名:内置默认(带 nameKey)按当前语言翻译,自定义名原样显示 */
  function profileDisplayName(p, t) {
    if (!p) return '';
    if (p.nameKey) return t ? t(p.nameKey) : p.nameKey;
    return p.name || '';
  }

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

  /** 工作空间默认值拷贝(避免外部修改共享引用;names 为对象需独立拷贝) */
  function defaultWorkspaces() {
    return DEFAULT_WORKSPACES.map(function (w) {
      return {
        id: w.id,
        name: w.name,
        names: {
          'zh-CN': w.names['zh-CN'],
          'zh-TW': w.names['zh-TW'],
          en: w.names.en,
        },
        icon: w.icon,
        color: w.color,
        note: w.note || '',
      };
    });
  }

  /** 英文名称 → 工作空间 id 的 slug 规则(仅保留 a-z0-9,其余转连字符) */
  function slugify(str) {
    return String(str == null ? '' : str)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-');
  }

  /** 依据英文 slug 生成唯一 id(重名自动追加 -2/-3…;excludeId 供编辑时忽略自身) */
  function uniqueWorkspaceId(base, list, excludeId) {
    var id = base;
    var i = 2;
    while (
      (list || []).some(function (w) {
        return w.id === id && w.id !== excludeId;
      })
    ) {
      id = base + '-' + i;
      i += 1;
    }
    return id;
  }

  /** 规范化任意来源(本地存储/服务端)的工作空间对象:补齐三语 names / note 并做白名单校验 */
  function normalizeWorkspace(w) {
    var rawName = w && typeof w.name === 'string' ? w.name : '';
    var names = { 'zh-CN': '', 'zh-TW': '', en: '' };
    if (w && w.names && typeof w.names === 'object') {
      names['zh-CN'] = typeof w.names['zh-CN'] === 'string' ? w.names['zh-CN'] : '';
      names['zh-TW'] = typeof w.names['zh-TW'] === 'string' ? w.names['zh-TW'] : '';
      names.en = typeof w.names.en === 'string' ? w.names.en : '';
    }
    if (!names['zh-CN'] && rawName) names['zh-CN'] = rawName;
    if (!names.en) names.en = names['zh-CN'] || rawName;
    return {
      id: String(w && w.id ? w.id : ''),
      name: names['zh-CN'] || names.en,
      names: names,
      icon: WORKSPACE_ICONS.indexOf(w && w.icon) !== -1 ? w.icon : 'house',
      color: WORKSPACE_COLORS.indexOf(w && w.color) !== -1 ? w.color : 'zinc',
      note: w && typeof w.note === 'string' ? w.note : '',
    };
  }

  /** 当前语言下的工作空间显示名(自定义名按语言取,缺省回退简体/英文) */
  function workspaceDisplayName(ws, locale) {
    if (!ws) return '';
    var n = ws.names;
    if (n && typeof n === 'object') {
      return (locale && n[locale]) || n['zh-CN'] || n.en || ws.name || '';
    }
    return ws.name || '';
  }

  /** 读取工作空间列表(白名单校验:非法项丢弃,空列表回退默认;兼容旧 nameKey/单 name 数据) */
  function readWorkspaces() {
    var stored = readStorage(K('workspaces'));
    if (!stored) return defaultWorkspaces();
    try {
      var arr = JSON.parse(stored);
      if (!Array.isArray(arr) || !arr.length) return defaultWorkspaces();
      var out = arr
        .filter(function (w) {
          return w && typeof w === 'object' && typeof w.id === 'string' && w.id;
        })
        .map(normalizeWorkspace)
        .filter(function (w) {
          return w.name;
        });
      return out.length ? out : defaultWorkspaces();
    } catch (e) {
      return defaultWorkspaces();
    }
  }

  /** 读取侧边栏展开状态(默认展开;纯静态方式也适用) */
  function readSidebarOpen() {
    var v = readStorage(K('sidebar-open'));
    return v !== 'false';
  }

  /** 读取当前工作空间 id(不在列表中则回退第一个) */
  function readActiveWorkspace(workspaces) {
    var stored = readStorage(K('active-workspace'));
    if (
      stored &&
      workspaces.some(function (w) {
        return w.id === stored;
      })
    ) {
      return stored;
    }
    return workspaces[0].id;
  }

  /** 按 id 查找工作空间(找不到回退第一个) */
  function findWorkspace(list, id) {
    var arr = list && list.length ? list : DEFAULT_WORKSPACES;
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].id === id) return arr[i];
    }
    return arr[0];
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
    var workspaces = readWorkspaces();
    var profiles = readProfiles();
    var profile = readJsonObject('profile', PROFILE_DEFAULTS, ['links']);
    profile.avatar = sanitizeAvatar(profile.avatar);
    return {
      locale: locale,
      theme: theme,
      appearance: readAppearance(),
      sidebarVariant: sidebarVariant,
      sidebarCollapsible: sidebarCollapsible,
      sidebarWidth: sidebarWidth,
      hiddenNav: hiddenNav,
      sidebarOpen: readSidebarOpen(),
      workspaces: workspaces,
      activeWorkspace: readActiveWorkspace(workspaces),
      profiles: profiles,
      activeProfile: readActiveProfile(profiles),
      profile: profile,
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
    writeStorage(K('sidebar-open'), String(!!s.sidebarOpen));
    writeStorage(K('profile'), JSON.stringify(s.profile || PROFILE_DEFAULTS));
    writeStorage(K('account'), JSON.stringify(s.account || ACCOUNT_DEFAULTS));
    writeStorage(K('notifications'), JSON.stringify(s.notifications || NOTIFICATIONS_DEFAULTS));
    writeStorage(
      K('workspaces'),
      JSON.stringify(s.workspaces && s.workspaces.length ? s.workspaces : DEFAULT_WORKSPACES)
    );
    writeStorage(K('active-workspace'), s.activeWorkspace || DEFAULT_WORKSPACES[0].id);
    writeStorage(
      K('profiles'),
      JSON.stringify(s.profiles && s.profiles.length ? s.profiles : defaultProfiles())
    );
    writeStorage(K('active-profile'), s.activeProfile || DEFAULT_PROFILES[0].id);
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
      K('workspaces'),
      K('active-workspace'),
      K('profiles'),
      K('active-profile'),
    ].forEach(removeStorage);
    return {
      locale: App.i18n.DEFAULT_LOCALE,
      theme: 'system',
      appearance: Object.assign({}, APPEARANCE_DEFAULTS),
      sidebarVariant: 'inset',
      sidebarCollapsible: 'icon',
      sidebarWidth: SIDEBAR_DEFAULT_WIDTH,
      hiddenNav: [],
      sidebarOpen: true,
      workspaces: defaultWorkspaces(),
      activeWorkspace: DEFAULT_WORKSPACES[0].id,
      profiles: defaultProfiles(),
      activeProfile: DEFAULT_PROFILES[0].id,
      profile: {
        username: '',
        email: '',
        bio: '',
        links: ['', ''],
        avatar: { type: 'initial', value: '' },
      },
      account: Object.assign({}, ACCOUNT_DEFAULTS),
      notifications: Object.assign({}, NOTIFICATIONS_DEFAULTS),
    };
  }

  window.App = window.App || {};
  App.settings = {
    STYLES: STYLES,
    BASE_COLORS: BASE_COLORS,
    CHART_COLORS: CHART_COLORS,
    WORKSPACE_COLORS: WORKSPACE_COLORS,
    WORKSPACE_ICONS: WORKSPACE_ICONS,
    DEFAULT_WORKSPACES: DEFAULT_WORKSPACES,
    FONTS: FONTS,
    RADII: RADII,
    SIDEBAR_DEFAULT_WIDTH: SIDEBAR_DEFAULT_WIDTH,
    SIDEBAR_MIN_WIDTH: SIDEBAR_MIN_WIDTH,
    SIDEBAR_MAX_WIDTH: SIDEBAR_MAX_WIDTH,
    STORAGE_PREFIX: STORAGE_PREFIX,
    K: K,
    APPEARANCE_DEFAULTS: APPEARANCE_DEFAULTS,
    AVATAR_TYPES: AVATAR_TYPES,
    AVATAR_ICONS: AVATAR_ICONS,
    AVATAR_EMOJIS: AVATAR_EMOJIS,
    sanitizeAvatar: sanitizeAvatar,
    PROFILE_DEFAULTS: PROFILE_DEFAULTS,
    ACCOUNT_DEFAULTS: ACCOUNT_DEFAULTS,
    NOTIFICATIONS_DEFAULTS: NOTIFICATIONS_DEFAULTS,
    DEFAULT_PROFILES: DEFAULT_PROFILES,
    THEME_ITEMS: THEME_ITEMS,
    SIDEBAR_ITEMS: SIDEBAR_ITEMS,
    LAYOUT_ITEMS: LAYOUT_ITEMS,
    readSettings: readSettings,
    defaultProfiles: defaultProfiles,
    findProfile: findProfile,
    normalizeProfile: normalizeProfile,
    profileCapture: profileCapture,
    profileApply: profileApply,
    profileDisplayName: profileDisplayName,
    applySettings: applySettings,
    persistSettings: persistSettings,
    resetAllSettings: resetAllSettings,
    isDarkMode: isDarkMode,
    readStorage: readStorage,
    writeStorage: writeStorage,
    defaultWorkspaces: defaultWorkspaces,
    findWorkspace: findWorkspace,
    slugify: slugify,
    uniqueWorkspaceId: uniqueWorkspaceId,
    normalizeWorkspace: normalizeWorkspace,
    workspaceDisplayName: workspaceDisplayName,
  };
})();
