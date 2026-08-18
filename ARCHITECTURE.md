# 架构文档 — Pure HTML/JS/CSS Admin Template

## 1. 项目概览

这是一个**零外部依赖**的纯前端管理后台模板,由 SSR 项目模板转换而来。整个应用以单个 `index.html` 为入口,支持三种运行模式:

| 模式 | 入口 | 鉴权 | 数据库 | 适用场景 |
|------|------|------|--------|----------|
| **纯静态** | 双击 `index.html` | ❌ | ❌ | 快速预览、无需服务器的场景 |
| **本地服务器** | `node dev-server.js` | ✅ x-auth-password | ✅ SQLite/Turso/D1 | 本地开发、自托管 |
| **部署模式** | 见下方 | ✅ | ✅ | 生产环境 |

### 部署平台支持

- **Cloudflare Workers + D1**: 边缘网络托管,Worker 处理 API
- **Vercel + Turso**: 无服务器函数 + 远程数据库
- **Deno Deploy + Turso**: 动态模式,复用 Node.js 实现
- **Docker**: 自托管,本地 SQLite

---

## 2. 目录结构

```
.
├── index.html                 # 唯一入口(PREPAINT 首帧脚本 + CSP + boot.js)
├── assets/
│   ├── css/app.css            # 设计系统(内置编译产物:8套风格 + 调色板 + 深浅主题)
│   ├── fonts/                  # 本地字体(Inter / Manrope woff2)
│   └── favicon.svg
├── js/
│   ├── core/                   # 核心运行时(12个模块,按依赖顺序加载)
│   │   ├── boot.js             # 引导入口:加载核心 + 模块清单 + App.start()
│   │   ├── logger.js           # 浏览器端日志(分级着色 + 自动定位)
│   │   ├── i18n.js             # 三语言国际化(核心词典 + 模块词典懒加载)
│   │   ├── icons-data.js       # lucide 图标节点数据(v0.525.0, ISC)
│   │   ├── icons.js            # 图标渲染(SVG) + 设置面板预览图
│   │   ├── settings.js         # 设置状态管理(localStorage + 白名单校验)
│   │   ├── api.js              # API 客户端(fetch 封装 + 401 回调)
│   │   ├── auth.js             # 登录页 + 令牌存储 + 登出
│   │   ├── ui.js               # 共享 UI 组件(button/badge/card/radio 等)
│   │   ├── shell.js            # App Shell 渲染(侧边栏/顶栏/设置面板)
│   │   ├── app.js              # 应用内核(模块注册表 + Hash 路由 + 事件委托 + 双向同步)
│   │   └── interactions.js     # 交互层(拖拽调宽 + 移动端抽屉)
│   ├── lib/                    # 第三方单文件库(无子依赖的纯 JS 库)
│   └── modules/                # 业务模块(6个)
│       ├── dashboard/          # 仪表盘(路由 /)
│       ├── channels/           # 渠道(路由 /channels)
│       ├── tokens/             # 令牌(路由 /tokens)
│       ├── logs/               # 日志(路由 /logs)
│       ├── docs/               # 文档(含4个子模块)
│       └── settings/           # 设置(含5个子模块:个人资料/账号/外观/通知/显示)
├── server/                     # 服务端代码(按域组织)
│   ├── config/env.js           # 零依赖 .env 加载器
│   ├── db/                     # 数据库(工厂 + schema + 驱动)
│   │   ├── index.js            # 驱动工厂(统一 query/run 接口)
│   │   ├── schema.js           # 建表语句(单一事实来源)
│   │   ├── sqlite.js           # SQLite 驱动(node:sqlite 内置)
│   │   ├── turso.js            # Turso/libSQL HTTP 驱动
│   │   └── d1.js               # Cloudflare D1 驱动(binding + REST)
│   ├── auth/                   # 鉴权
│   │   ├── index.js            # Node 端密码校验(读 AUTH_PASSWORD)
│   │   ├── password.js         # 常量时间密码比较(纯逻辑,与 Worker 共用)
│   │   ├── session.js          # 会话令牌哈希与查询(纯逻辑)
│   │   └── expiry.js           # 会话失效时长(纯常量)
│   ├── security/               # 加密与敏感键判定
│   │   ├── index.js            # Node 端 AES-256-GCM 加解密(密钥来源封装)
│   │   ├── core.js             # AES-256-GCM 纯算法(与 Worker 共用)
│   │   └── sensitive.js        # 敏感键判定 + 保留键前缀
│   ├── http/                   # HTTP 工具
│   │   ├── json.js             # sendJson / readBody(Node req/res 风格)
│   │   ├── mime.js             # 静态资源 MIME 映射
│   │   └── static.js           # 静态资源服务
│   ├── api/                    # API 处理器(路由按域拆分)
│   │   ├── index.js            # 路由注册表 + createApiHandler
│   │   └── routes/
│   │       ├── auth.js         # 登录 / 校验 / 登出
│   │       └── settings.js     # 全局设置 KV
│   ├── logging/logger.js       # 服务器终端日志(分级彩色输出)
│   └── lib/                    # 第三方单文件库(无子依赖的纯 JS 库)
├── dev-server.js               # 本地 Node 服务器入口
├── worker.js                   # Cloudflare Worker 入口(ESM)
├── api/index.js                # Vercel 无服务器函数入口
├── deno/main.js                # Deno Deploy 入口
├── docker-compose.yml          # Docker Compose 配置
├── Dockerfile                  # Docker 镜像构建
└── docs/deploy/                # 部署文档
```

---

## 3. 核心运行时架构

### 3.1 引导流程 (`boot.js`)

```
index.html
  │
  ├─ PREPAINT 内联脚本(首帧):应用主题/语言/外观,避免闪烁
  │   └─ 读取 localStorage(html-template-*) → 设置 html class/属性
  │
  └─ boot.js(异步加载)
       │
       ├─ 1. 按依赖顺序加载核心模块(js/core/*)
       │     logger → i18n → icons-data → icons → settings → api → auth → ui → shell → app → interactions
       │
       ├─ 2. 加载模块清单(js/modules/*/manifest.js)
       │     dashboard, channels, tokens, logs, docs, settings
       │
       └─ 3. App.start()
             ├─ 鉴权门禁:App.auth.isAuthed()?
             │   ├─ 否 → renderLogin() → 等待用户登录
             │   └─ 是 → renderApp() + syncSettingsFromServer()
             │         └─ 加载路由 → renderRoute() → resolveRoute()
             └─ 事件委托(document 级别,一次绑定)
```

### 3.2 模块注册表

每个模块由两个文件组成:

1. **manifest.js** (启动时同步加载,体积极小)
   - 声明 `id`, `title`(三语言), `icon`, `route`, `load`, `css`, `i18nFile`
   - 可声明 `children`(子模块/二级菜单)

2. **module.js** (首次访问路由时懒加载)
   - 调用 `App.defineModule({ id, render })` 注册实现
   - `render(route, ctx)` 返回 HTML 字符串

```javascript
// manifest.js 示例
App.registerModule({
  id: 'dashboard',
  title: { 'zh-CN': '仪表盘', en: 'Dashboard' },
  icon: 'layout-dashboard',
  route: '/',
  load: 'module.js',
  i18nFile: 'i18n.js',
  children: [
    { id: 'sub', title: { en: 'Sub' }, route: '/dashboard/sub', load: 'sub/sub.js' },
  ],
});

// module.js 示例
App.defineModule({
  id: 'dashboard',
  render: function (route, ctx) {
    return '<div>' + ctx.t('home.welcomeTitle') + '</div>';
  },
});
```

### 3.3 Hash 路由

- 路由格式: `#/path` (兼容 `file://` 协议)
- 路由解析: `app.js` 的 `findRoute(path)` → 匹配模块 `route` 或子模块 `children[].route`
- 默认路由: `/` → `dashboard` 模块
- 404 兜底: `App.ui.notFound(t)`
- 导航触发: `hashchange` 事件 → `renderRoute()` → `resolveRoute()` → 懒加载 + 渲染

### 3.4 事件委托

所有交互事件绑定在 `document` 级别,内容区重渲染后无需重新绑定:

```javascript
document.addEventListener('click', function (e) {
  // 导航链接: a[data-link]
  // 主题切换: [data-theme-btn]
  // 语言切换: [data-lang]
  // 下拉菜单: [data-dropdown-trigger]
  // 设置面板: [data-sheet-trigger]
  // 侧边栏折叠: [data-sidebar-trigger]
  // 子菜单展开: [data-submenu-toggle]
  // 设置面板卡片: [data-settings-card]
  // 色板: [data-swatch]
  // 分段控件: [data-segmented]
  // 重置: [data-reset-settings]
  // 显示页菜单切换: [data-nav-toggle]
});
```

### 3.5 设置双向同步

```
本地 localStorage ←→ 数据库 app_settings

写入流程(防抖 400ms):
  用户修改 → updateSettings() → persistSettings(localStorage)
                                → pushSettingsToServer() → PUT /api/settings

读取流程:
  登录成功 → syncSettingsFromServer() → GET /api/settings
                                      → mergeServerSettings() → 写入 localStorage
                                      → applySettings() → 应用到 DOM

设置子页(data-setting 绑定):
  表单 change/input → applySettingField() → updateSettings() → 同步数据库
```

---

## 4. 服务端架构

### 4.1 统一 API 处理器 (`server/api.js`)

所有平台共享同一份 API 逻辑:

| 方法 | 路径 | 说明 | 鉴权 |
|------|------|------|------|
| POST | `/api/auth/login` | `{ password, expiry }` → `{ token, expiresAt }` | ❌ |
| GET | `/api/auth/verify` | 校验会话有效性 | ✅ |
| POST | `/api/auth/logout` | 删除服务端会话 | ✅ |
| GET | `/api/settings` | 返回全部 `app_settings` | ✅ |
| PUT | `/api/settings` | 批量写入 `{ settings: { key: value } }` | ✅ |
| DELETE | `/api/settings` | 删除 `{ keys: [...] }` | ✅ |

### 4.2 鉴权机制

```
登录流程:
  客户端 POST { password, expiry }
    → verifyPassword(password)  // 与 AUTH_PASSWORD 环境变量常量时间比较
    → 生成随机令牌(24字节 base64url)
    → 服务端存 SHA-256 哈希(token_hash) + 过期时间
    → 返回明文令牌给客户端

验证流程:
  请求头 x-auth-token → SHA-256 哈希 → 查询 auth_sessions
    → 未找到/已过期 → 401
    → 找到且未过期 → 通过

登出流程:
  POST /api/auth/logout → 删除 auth_sessions 记录
  客户端清除 localStorage/sessionStorage 令牌
```

### 4.3 数据库设计

```sql
-- 全局设置(键值对)
CREATE TABLE app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- 会话表(只存令牌哈希)
CREATE TABLE auth_sessions (
  token_hash TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT,
  note       TEXT
);
```

**键命名规范:**
- `settings:appearance` — 外观设置
- `settings:display` — 显示设置(侧边栏宽度/隐藏菜单)
- `settings:profile` — 个人资料
- `settings:account` — 账号设置
- `settings:notifications` — 通知设置
- `settings:auth:*` — 保留键(禁止读写)

### 4.4 敏感数据加密

```
敏感键判定:
  键名含 password/email/apikey/api_key/secret/token/credential/access_key
  或整体为 settings:profile(含邮箱)

加密方案:
  AES-256-GCM
  存储格式: enc:v1:<iv_b64url>:<tag_b64url>:<ciphertext_b64url>
  密钥来源: ENCRYPTION_KEY 环境变量 或 server/.secret-key 自动生成
```

### 4.5 数据库驱动

通过 `DB_DRIVER` 环境变量切换:

| 驱动 | 文件 | 说明 |
|------|------|------|
| `sqlite` | `server/db/sqlite.js` | 本地 SQLite(node:sqlite 内置, Node ≥ 22.5) |
| `turso` | `server/db/turso.js` | 远程 Turso/libSQL HTTP API |
| `d1` | `server/db/d1.js` | Cloudflare D1(binding + REST) |

统一接口:
```javascript
db.query(sql, params)  // 查询 → 行数组
db.get(sql, params)    // 单行查询 → 对象或 null
db.run(sql, params)    // 写操作 → { changes, lastInsertRowid }
db.initSchema(schema)  // 建表(幂等)
```

---

## 5. 前端状态管理

### 5.1 localStorage 命名空间

所有存储键以 `html-template-` 为前缀:

| 键 | 说明 |
|----|------|
| `html-template-locale` | 语言(zh-CN/zh-TW/en) |
| `html-template-theme` | 主题模式(system/light/dark) |
| `html-template-style` | 风格(nova/vega/maia/lyra/mira/luma/sera/rhea) |
| `html-template-base` | 基础色 |
| `html-template-chart` | 强调色 |
| `html-template-radius` | 圆角(px) |
| `html-template-font` | 正文字体 |
| `html-template-heading-font` | 标题字体 |
| `html-template-menu-color` | 菜单颜色 |
| `html-template-menu-appearance` | 菜单外观 |
| `html-template-sidebar-variant` | 侧边栏变体(inset/floating/sidebar) |
| `html-template-sidebar-collapsible` | 侧边栏折叠模式(icon/offcanvas) |
| `html-template-sidebar-width` | 侧边栏宽度(px) |
| `html-template-sidebar-open` | 侧边栏展开状态 |
| `html-template-hidden-nav` | 隐藏的菜单项(JSON 数组) |
| `html-template-auth-token` | 登录令牌 |
| `html-template-auth-expiry` | 令牌过期时间 |
| `html-template-profile` | 个人资料(JSON) |
| `html-template-account` | 账号设置(JSON) |
| `html-template-notifications` | 通知设置(JSON) |

### 5.2 白名单校验

`settings.js` 对所有 localStorage 读入值做白名单校验:

```javascript
var STYLES = ['nova', 'vega', 'maia', 'lyra', 'mira', 'luma', 'sera', 'rhea'];
var BASE_COLORS = ['neutral', 'stone', 'zinc', 'mauve', 'olive', 'mist', 'taupe'];
var FONTS = ['inter', 'manrope', 'system'];
// 非法值自动回退默认值
```

---

## 6. 设计系统

### 6.1 CSS 架构

`assets/css/app.css` 是 Tailwind 构建产物的内置副本(352KB):

- **8 套组件风格**: nova, vega, maia, lyra, mira, luma, sera, rhea
- **调色板**: 7 种基础色 × 17 种强调色
- **深浅主题**: 通过 `dark` class 切换
- **本地字体**: Inter Variable, Manrope Variable

### 6.2 类名系统

```html
<html class="style-nova base-zinc chart-zinc menu-color-default menu-appearance-solid"
      data-sidebar-variant="inset"
      data-sidebar-collapsible="icon">
```

动态切换通过 `App.settings.applySettings()` 操作 DOM class:
- 风格: `style-{name}`
- 基础色: `base-{name}`
- 强调色: `chart-{name}`
- 菜单颜色: `menu-color-{default|inverted}`
- 菜单外观: `menu-appearance-{solid|translucent}`

### 6.3 图标系统

使用 lucide 图标(v0.525.0),数据预加载到 `icons-data.js`:

```javascript
// 渲染 lucide 图标
App.icon.iconSvg('settings', { class: 'size-4' })

// 渲染预览图标(主题/侧边栏/布局示意)
App.icon.previewIcon('theme-dark', 'fill-primary')
```

---

## 7. 国际化 (i18n)

### 7.1 三语言支持

- `zh-CN` — 简体中文
- `zh-TW` — 繁体中文
- `en` — English

### 7.2 词典分层

```
核心词典(i18n.js):
  ├─ App Shell 文案(侧边栏/顶栏/登录页)
  ├─ 设置面板文案
  └─ 公共 UI 文案(placeholder/404)

模块词典(i18n.js, 懒加载):
  ├─ dashboard: home.welcomeTitle, home.overview, ...
  ├─ settings: settings.profile.title, ...
  └─ docs: docs.intro.title, ...
```

### 7.3 翻译函数

```javascript
// 生成翻译函数(模块词典优先)
var t = App.i18n.makeT(locale, moduleDict);

// 使用
t('settings.title')           // → "主题设置" 或 "Theme Settings"
t('home.requestTitle', 5)     // → "请求 5 已完成" (支持 {n} 插值)
```

---

## 8. 安全设计

### 8.1 CSP (Content Security Policy)

```html
<meta http-equiv="Content-Security-Policy"
  content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; object-src 'none'; base-uri 'self'" />
```

### 8.2 敏感数据保护

| 防线 | 措施 |
|------|------|
| 会话令牌 | 服务端只存 SHA-256 哈希,明文仅在登录响应中返回 |
| 敏感值加密 | AES-256-GCM 加密落库(邮箱/apikey/token/secret/...) |
| 密码校验 | 与 `AUTH_PASSWORD` 环境变量常量时间比较,不落库 |
| API 保护 | 除登录外,所有 `/api/*` 需 `x-auth-token` 请求头 |
| 保留键保护 | `settings:auth:*` 禁止通过通用 KV 接口读写 |
| 令牌过期 | 双端校验:客户端 localStorage/sessionStorage + 服务端 auth_sessions |

### 8.3 令牌存储策略

| 失效选项 | 存储位置 | 说明 |
|----------|----------|------|
| 3h/6h/9h/12h/24h/7d/14d/30d | localStorage | 持久存储,关浏览器仍有效 |
| 下一次浏览器打开 | sessionStorage | 关浏览器即失效 |

### 8.4 静态资源白名单与响应加固

| 防线 | 措施 |
|------|------|
| 静态白名单 | 仅放行 `index.html` / `js/` / `assets/`(`server/http/allowed.js`),阻断 `server/`、`.env*`、`sqlite.db`、部署配置等 |
| 登录限流 | 密码错误按 IP 计数,默认 1 分钟 8 次后返回 429(`server/auth/throttle.js`) |
| 安全响应头 | `X-Content-Type-Options: nosniff` / `X-Frame-Options: DENY` / `Referrer-Policy: no-referrer`(`server/http/headers.js`) |
| 错误信息 | 500 只返回通用文案,不向前端泄露内部错误详情 |
| 输出转义 | 个人资料邮箱等用户可控字段渲染时做 HTML 属性/文本双重转义 |

---

## 9. 部署架构

### 9.1 Cloudflare Workers + D1

```
静态资源 → Cloudflare 边缘网络(wrangler.toml [assets])
/api/*   → worker.js (Worker 运行时)
  ├─ auth: AUTH_PASSWORD secret
  ├─ crypto: ENCRYPTION_KEY secret
  └─ db: D1 binding (env.DB)
```

### 9.2 Vercel + Turso

```
静态资源 → dist/ (npm run build 输出)
/api/*   → api/index.js (无服务器函数)
  ├─ vercel.json rewrites: /api/:path* → /api/index
  └─ db: DB_DRIVER=turso (DATABASE_URL + DATABASE_AUTH_TOKEN)
```

### 9.3 Deno Deploy + Turso

```
全部请求 → deno/main.js (dynamic 模式)
  ├─ 静态资源: Deno.readFile() 读取部署包
  ├─ API: createRequire() 复用 server/ 下 CJS 模块
  └─ db: DB_DRIVER=turso
```

### 9.4 Docker

```yaml
services:
  app:
    build: .
    ports: ["3000:3000"]
    environment:
      - AUTH_PASSWORD=your-password
      - DB_DRIVER=sqlite
      - SQLITE_PATH=/app/data/sqlite.db
    volumes: ["./data:/app/data"]
```

---

## 10. 模块开发指南

### 10.1 新增模块三步

1. **创建目录** `js/modules/<name>/`
2. **编写清单** `manifest.js`
3. **编写实现** `module.js` + 可选 `i18n.js` + 可选 `module.css`
4. **登记目录** `js/core/boot.js` 的 `MODULE_DIRS` 数组

**完全无需改动 `index.html` 或任何核心文件** — 侧边栏、路由、懒加载全部由模块注册表自动推导。

### 10.2 模块契约

```javascript
// manifest.js
App.registerModule({
  id: 'mymod',                          // 模块 ID,须与目录名一致
  title: { 'zh-CN': '我的模块', en: 'My Module' },
  icon: 'settings',                     // lucide 图标名
  route: '/mymod',                      // 一级菜单路由
  load: 'module.js',                    // 实现文件(懒加载)
  css: 'module.css',                    // 可选:私有样式
  i18nFile: 'i18n.js',                  // 可选:模块词典
  children: [                           // 可选:子模块
    { id: 'sub', title: {...}, route: '/mymod/sub', load: 'sub/sub.js' },
  ],
});

// module.js
App.defineModule({
  id: 'mymod',
  render: function (route, ctx) {
    // ctx: { path, settings, t, App }
    return '<div>' + ctx.t('mymod.title') + '</div>';
  },
});

// i18n.js
window.__moduleI18n = window.__moduleI18n || {};
window.__moduleI18n['mymod'] = {
  'en': { 'mymod.title': 'My Module' },
  'zh-CN': { 'mymod.title': '我的模块' },
};
```

### 10.3 解耦规则

1. **模块之间禁止互相引用** — 只允许依赖核心层(`App.ui` / `App.icon` / `App.i18n` / `App.settings` / `ctx`)
2. **事件委托** — 全部交互挂在 `document` 上,内容区重渲染后无需重新绑定
3. **模块内聚** — 文案放模块自己的 `i18n.js`,不进核心词典

---

## 11. 日志系统

### 11.1 浏览器端 (`js/core/logger.js`)

```
[One API] ERROR [dashboard] module.js#render:42 加载失败
[One API] DEBUG [settings] module.js#pageProfile:277 渲染子页面: profile
```

- 分级: debug / info / warn / error
- 自动定位: 通过调用栈提取文件 + 函数 + 行号
- 全局捕获: `window.onerror` / `unhandledrejection` 自动上报

### 11.2 服务器端 (`server/logging/logger.js`)

```
08-18 09:27:52 INFO  [api]   POST /api/settings 200 12ms
08-18 09:27:52 ERROR [api]   GET /api/data 500 15ms
```

- 分级: DEBUG / INFO / WARN / ERROR
- 等级过滤: `LOG_LEVEL=debug|info|warn|error`
- 请求日志: 接口 2xx→info, 4xx→warn, 5xx→error; 静态资源→debug

---

## 12. 依赖关系图

```
index.html
  └─ boot.js
       ├─ js/core/logger.js      (零依赖)
       ├─ js/core/i18n.js        (零依赖)
       ├─ js/core/icons-data.js  (零依赖, 大文件)
       ├─ js/core/icons.js       (依赖 icons-data)
       ├─ js/core/settings.js    (依赖 i18n)
       ├─ js/core/api.js         (依赖 auth)
       ├─ js/core/auth.js        (依赖 api, i18n, icons)
       ├─ js/core/ui.js          (依赖 icons)
       ├─ js/core/shell.js       (依赖 ui, icons, i18n, settings)
       ├─ js/core/app.js         (依赖上述所有核心)
       ├─ js/core/interactions.js(依赖 app, settings)
       │
       ├─ js/modules/*/manifest.js  (同步加载, 体积极小)
       └─ js/modules/*/module.js    (懒加载, 首次访问路由时下载)

服务端:
  dev-server.js / worker.js / api/index.js / deno/main.js
    ├─ server/api/             (共享 API 处理器 + 路由注册表)
    │    ├─ routes/auth.js     (登录 / 校验 / 登出)
    │    └─ routes/settings.js (全局设置 KV)
    ├─ server/db/              (驱动工厂 + schema)
    │    ├─ sqlite.js          (本地 SQLite)
    │    ├─ turso.js           (远程 Turso)
    │    └─ d1.js              (Cloudflare D1)
    ├─ server/auth/            (密码校验 + 会话 + 失效时长)
    ├─ server/security/        (AES-256-GCM + 敏感键判定)
    ├─ server/http/            (JSON / MIME / 静态资源)
    ├─ server/logging/         (终端日志)
    └─ server/config/          (.env 加载)
```

---

## 13. 关键设计决策

### 13.1 为什么选择 Hash 路由?

- 支持 `file://` 协议直接打开(无需服务器)
- 兼容所有静态文件服务器
- 无需配置 SPA 兜底规则

### 13.2 为什么零外部依赖?

- 启动速度快(无需 npm install / 构建)
- 部署简单(静态文件直接托管)
- 安全性高(无供应链攻击风险)
- 维护成本低(无版本升级负担)

### 13.3 为什么用 localStorage 而非 SessionStorage?

- 用户期望设置持久化(主题/语言/侧边栏宽度)
- 会话令牌根据用户选择的失效选项决定存储位置
- 数据库作为持久化后备(双向同步)

### 13.4 为什么事件委托在 document 级别?

- 内容区重渲染后无需重新绑定
- 简化模块开发(无需关心事件生命周期)
- 减少内存占用(一个监听器 vs 数百个)

---

## 14. 性能优化

### 14.1 懒加载策略

- **核心模块**: 启动时同步加载(体积极小)
- **模块清单**: 启动时同步加载(仅声明元信息)
- **模块实现**: 首次访问路由时才下载
- **模块词典**: 随实现文件一起懒加载
- **模块样式**: 随实现文件一起懒加载

### 14.2 防抖机制

- 设置同步到数据库: 400ms 防抖(拖拽调宽等高频调用)
- `noRerender` 选项: 输入框逐键更新时避免重渲染抢焦点

### 14.3 缓存控制

- 所有 API 响应: `Cache-Control: no-store`(含敏感数据,禁止缓存)
- `index.html`: `no-store`(入口始终最新)
- `js/` / `assets/`: `public, no-cache` + `ETag` / `Last-Modified`,浏览器经 304 复用,避免重复下载大体积样式与图标

### 14.4 缓存优先与后台刷新

- 启动先读 localStorage 渲染(缓存优先),随后 GET `/api/settings` 与服务端核对
- 仅当服务端设置与本地不同才整页刷新;标签页切回前台时再自动核对一次
- 本地改动防抖 400ms 后 PUT 回数据库,避免逐键请求

---

## 15. 扩展点

### 15.1 新增数据库驱动

1. 创建 `server/db/<driver>.js`
2. 实现 `init(opts)` 返回 `{ query, get, run, initSchema }`
3. 在 `server/db/index.js` 的 `DRIVERS` 对象中注册

### 15.2 新增部署平台

1. 创建入口文件(如 `platform/main.js`)
2. 复用 `server/api/index.js` 的 `createApiHandler`
3. 实现静态资源托管 + API 路由分发

### 15.3 新增业务模块

1. 创建 `js/modules/<name>/` 目录
2. 编写 `manifest.js` + `module.js`
3. 在 `js/core/boot.js` 的 `MODULE_DIRS` 中登记
4. 无需改动任何核心文件

### 15.4 引入第三方库

项目默认零外部依赖,但支持引入**单文件、无子依赖**的第三方 JS 库:

| 库类型 | 放置位置 | 说明 |
|--------|----------|------|
| 前端单文件库 | `js/lib/xxx.js` | 纯浏览器端使用 |
| 后端单文件库 | `server/lib/xxx.js` | Node.js 服务端使用 |
| 有 npm 依赖的库 | `package.json` + `node_modules/` | 走标准包管理 |

**使用方式:**

```javascript
// 前端:在模块中懒加载
loadScript('js/lib/some-library.min.js').then(function () {
  // 库已加载,可以使用
});

// 后端:在 server 文件中 require
const lib = require('./lib/some-library');
```

**注意:** 如果库本身依赖其他 npm 包,请使用 `package.json` 管理,不要放入 `lib/` 目录。

---

## 16. 已知限制

1. **node:sqlite 需要 Node ≥ 22.5** — 旧版本需使用 `turso` 驱动
2. **Cloudflare Workers 需要 ESM 格式** — `worker.js` 使用 `import/export`
3. **Vercel 不支持根目录 server.js** — 文件命名为 `dev-server.js` 避免自动捕获
4. **敏感数据加密密钥丢失不可恢复** — 生产环境请妥善保管 `ENCRYPTION_KEY`
5. **无实时同步** — 设置修改通过防抖异步同步,不支持多设备实时同步

---

*文档生成时间: 2026-08-18*
*项目版本: 1.0.0*
