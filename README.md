# Pure HTML / JS / CSS Admin Template

由 `ssr-vanilla-project-template` 转换而来的**纯前端静态模板**:根目录仅一个 `index.html`,零外部依赖、零构建步骤、零服务器要求。双击 `index.html` 即可运行(基于 Hash 路由,兼容 `file://` 协议)。

## 核心特性

- **单一入口**:根目录只有 `index.html`,其它全部按目录组织
- **模块化目录**:`js/core/` 核心运行时 + `js/modules/` 业务模块
- **完全解耦**:侧边栏每个一级菜单就是一个独立模块;二级菜单是模块内的子模块;模块之间互不引用
- **懒加载**:模块实现首次访问对应路由时才下载(`module.js` / `module.css`)
- **零外部依赖**:无 npm、无 CDN;字体、图标、样式全部本地文件
- **三语言 i18n**(zh-CN / zh-TW / en),文案随模块内聚
- **主题设置面板**:主题模式、侧边栏样式、布局、基础色/强调色、8 套风格、字体、圆角、菜单颜色/外观、重置
- **可拖拽调宽 / 可折叠侧边栏**、毛玻璃顶栏、单一内容滚动区、移动端抽屉
- **工作空间**:侧边栏顶部工作空间切换(默认/工作/学习/生活/娱乐/旅游),可新增并自定义图标与强调色;业务数据按工作空间隔离

## 快速开始

```bash
# 方式一:直接双击 index.html 打开(纯静态,零依赖,无鉴权、无数据库)
# 方式二:任意静态服务器托管本目录(同上)
python -m http.server 8000

# 方式三:完整模式 —— node dev-server.js(静态托管 + 全局 x-auth-password 鉴权 + 数据库持久化)
AUTH_PASSWORD=admin123 node dev-server.js   # AUTH_PASSWORD 即登录密码(必设;缺失时登录直接报错,绝不生成随机密码)
```

所有环境变量(`PORT` / `AUTH_PASSWORD` / `DB_DRIVER` / `SQLITE_PATH` / `DATABASE_URL` / `DATABASE_AUTH_TOKEN`)也支持写入项目根目录的 `.env`(零依赖加载器 `server/config/env.js`,进程环境变量优先;模板见 `.env.example`,`.env` 已 gitignore)。

## 服务器模式与全局鉴权(x-auth-password)

`node dev-server.js` 启动后,应用进入**鉴权门禁**:未登录时渲染整页登录卡片,登录成功后才启动 App Shell。

- **失效选项(2×4 网格)**:3 / 6 / 9 / 12 / 24 小时,7 / 14 / 30 天;最底部单独一行的 **「下一次浏览器打开」**(单独占满一行)。
- **令牌存储**:时长选项 → `localStorage`(持久);「下一次浏览器打开」→ `sessionStorage`(关浏览器即失效)。服务端会话同时存在于 `auth_sessions` 表并带有过期时间,双端校验。
- **密码**:登录密码与 `AUTH_PASSWORD` 环境变量直接做常量时间比较(**不落库、无随机初始密码**);未配置该变量时登录返回明确报错。
- **改密**:密码由部署平台环境变量 `AUTH_PASSWORD` 统一管理,应用内不支持修改——请到平台更新环境变量后重新部署。
- **登出**:顶栏/侧边栏用户菜单的登出按钮 → 删除服务端会话并清除本地令牌,回到登录页;任何接口返回 401 也会自动回到登录页。
- **设置双向同步**:登录成功后从数据库拉取设置(服务端为准)并应用;本地任何修改(主题/外观/显示页开关/拖拽宽度/工作空间…)防抖 400ms 写回数据库。**侧边栏 设置 的全部子菜单选项、右上角主题切换与主题设置面板均同步**到 `app_settings`(个人资料 → `settings:profile`、账号 → `settings:account`、外观/主题面板 → `settings:appearance`、通知 → `settings:notifications`、显示 → `settings:display`、工作空间 → `settings:workspaces` / `settings:activeWorkspace`)。

> 纯静态方式(双击 `index.html`)不经过鉴权,登录页会提示需要服务器 —— 这是预期行为:鉴权与持久化依赖 `dev-server.js`。

## 工作空间

侧边栏顶部的弹出菜单即**工作空间切换器**(原「One API」团队菜单已改为工作空间):

- **默认工作空间**:默认 / 工作 / 学习 / 生活 / 娱乐 / 旅游,首次启动自动创建。
- **切换**:点击工作空间名即可切换;当前工作空间 id 存于 `html-template-active-workspace` 并同步到 `settings:activeWorkspace`。
- **新增**:点「新增工作空间」打开弹窗,填写名称、从预设图标中选择图标、从主题面板的 18 种强调色(zinc + 17 种 chart 色)中选择颜色。
- **持久化**:工作空间列表存于 `html-template-workspaces` 并同步到 `settings:workspaces`(JSON 数组)。

**工作空间隔离**:`app_settings` 按 `workspace_id` 分片 —— `workspace_id='global'` 只存 `settings:workspaces` / `settings:activeWorkspace` 两个全局键,其余 `settings:*` 与业务数据都落在当前工作空间;`auth_sessions` 是登录会话基础设施,保持全局。切换工作空间后加载不同数据,互相隔开、互不影响(见「数据库设计」)。

## 目录结构

```
.
├── index.html                # 唯一入口(PREPAINT 首帧脚本 + 引导)
├── README.md
├── assets/
│   ├── css/app.css           # 设计系统(内置编译产物:全部风格 + 调色板 + 字体声明)
│   └── fonts/                # 本地字体(Inter / Manrope woff2)
└── js/
    ├── lib/                  # 第三方单文件库(无子依赖的纯 JS 库)
    ├── core/                 # 核心运行时(不依赖任何模块)
    │   ├── boot.js           # 引导:按序加载核心 + 模块清单 + App.start()
    │   ├── logger.js         # 浏览器日志:分级着色 + 自动定位 文件#函数:行号 + 全局异常捕获
    │   ├── i18n.js           # 三语言词典 + 翻译(模块词典优先)
    │   ├── icons-data.js     # lucide 图标节点数据(lucide v0.525.0,ISC)
    │   ├── icons.js          # 图标渲染(SVG)与设置面板预览图
    │   ├── settings.js       # 设置状态(localStorage,白名单校验)
    │   ├── api.js            # API 客户端(fetch 封装:自动附加 x-auth-token,401 回调)
    │   ├── auth.js           # 全局鉴权:登录页(2×4 失效选项)+ 令牌存储 + 登出
    │   ├── ui.js             # 共享 UI 组件(button/badge/card/radio-group/placeholder/404)
    │   ├── shell.js          # App Shell 渲染(侧边栏/顶栏/设置面板)
    │   ├── app.js            # 应用内核:模块注册表 + Hash 路由 + 事件委托 + 设置双向同步
    │   ├── workspace.js      # 工作空间交互:切换 + 新增弹窗(名称/图标/强调色)
    │   └── interactions.js   # 交互层:拖拽调宽 + 移动端抽屉(自包含,依赖 App 公开 API)
    └── modules/              # 业务模块:一级菜单 = 一个目录
        ├── dashboard/        # 仪表盘(路由 /)
        ├── channels/         # 渠道(路由 /channels)
        ├── tokens/           # 令牌(路由 /tokens)
        ├── logs/             # 日志(路由 /logs)
        ├── docs/             # 文档:含 4 个子模块(二级菜单)
            ├── manifest.js   # 模块清单(元信息 + children + i18n)
            ├── module.css    # 模块私有样式(懒加载)
            └── sub/          # 子模块:每个文件自包含、互不影响
                ├── introduction.js
                ├── get-started.js
                ├── tutorials.js
                └── changelog.js
        └── settings/         # 设置(从 mpages 移植;表单静态,主题/显示可交互)
            ├── manifest.js   # 清单:5 个子模块 + 三语言文案
            ├── module.css    # 模块私有样式(表单/开关/导航等)
            └── module.js     # 父实现:按路由分发 5 个页面
                # 路由:/settings(个人资料) /settings/account /settings/appearance
                #      /settings/notifications /settings/display
```

> 含子模块的父菜单(文档、设置)在侧边栏可**独立展开/收起**;导航进入父模块路由时自动展开其子菜单。

## 从 mpages 移植的 Settings 页面

`js/modules/settings/` 移植自 `/home/kubuntu/projects/mpages/apps/web` 的侧边栏二级子菜单 Settings(个人资料 / 账号 / 外观 / 通知 / 显示)。**五个子页全部可交互并与数据库双向同步**(通过 `data-setting` 表单字段绑定 + 事件委托,改动即写 localStorage 并防抖写入 `app_settings`):

- **外观页 ↔ 主题设置面板双向同步**:与右上角主题设置弹框同源,两侧读写同一份 `App.settings`(localStorage + html 类)。任一侧点击主题/侧边栏/布局/色板/风格/字体/圆角/菜单选项,另一侧立即同步更新,改动持久化。`重置外观` 仅重置主题/布局/外观(不清语言与宽度);右上角面板底部 `重置全部` 仍为全量重置。
- **显示页 = 侧边栏菜单可见性控制**:点击菜单项即实时隐藏/显示对应侧边栏菜单(勾选状态持久化于 `hidden-nav`),侧边栏立即刷新;`设置` 项锁定不可隐藏(与 mpages `LOCKED_ITEM_ID` 一致)。
- **个人资料/账号/通知页**:表单控件(输入框/下拉/日期/开关/单选/复选)均绑定真实状态并同步 `settings:profile` / `settings:account` / `settings:notifications`;个人资料含邮箱 → 落库前自动加密。`提交` 按钮保持移植原样(数据为实时同步,无需提交)。

**主题设置样式已与 mpages 对齐**:顶部主题切换为胶囊式 radio group(选中项反白填充);设置面板与 Settings → 外观页均使用 radio-group 卡片(选中项 `ring-primary` 描边 + 阴影 + 对勾徽标;色板/风格/字体/圆角为描边卡片,卡片等宽填满网格单元)。样式实现在 `assets/css/app.css`(`.theme-switch` / `.ts-*`)与设置模块 `module.css`(`.sp-opt-*`)。

## 模块契约

### 1. 清单 `js/modules/<name>/manifest.js`

只声明元信息,不含逻辑;引导阶段同步加载(体积极小)。

```js
App.registerModule({
  id: 'mymod', // 模块 ID,须与目录名一致
  title: { 'zh-CN': '我的模块', 'zh-TW': '我的模組', en: 'My Module' },
  icon: 'settings', // lucide 图标名(见 icons-data.js)
  route: '/mymod', // 一级菜单路由(缺省 /<id>)
  load: 'module.js', // 实现文件(缺省 module.js,懒加载)
  css: 'module.css', // 可选:模块私有样式(懒加载)
  i18nFile: 'i18n.js', // 可选:模块词典懒加载文件,文案不进核心词典
  children: [
    // 可选:子模块(二级菜单)
    {
      id: 'intro',
      title: { 'zh-CN': '简介', en: 'Intro' },
      route: '/mymod/intro',
      load: 'sub/intro.js', // 子模块独立实现文件
    },
  ],
});
```

### 2. 实现:模块词典 `i18n.js` + 实现 `module.js`

词典与实现均在**首次访问对应路由时才懒加载**(不随启动加载)。`ctx` 提供 `t`(模块词典优先的翻译)、`settings`、`path`、`App`。词典文件把三语文案写入全局注册表:

```js
window.__moduleI18n = window.__moduleI18n || {};
window.__moduleI18n['mymod'] = { 'zh-CN': { 'mymod.desc': '...' }, en: { 'mymod.desc': '...' } };
```

```js
App.defineModule({
  id: 'mymod',
  render: function (route, ctx) {
    return App.ui.placeholderCard(ctx.t, 'settings', ctx.t('mymod.title'), ctx.t('mymod.desc'));
  },
});
```

子模块实现文件同理,多传一个 `sub` 字段:

```js
App.defineModule({
  id: 'docs',
  sub: 'intro',
  render: function (route, ctx) {
    /* ... */
  },
});
```

### 3. 登记

在 `js/core/boot.js` 的 `MODULE_DIRS` 数组中追加目录名:

```js
var MODULE_DIRS = ['dashboard', 'channels', 'tokens', 'logs', 'docs', 'mymod'];
```

**新增一个模块不需要修改 `index.html` 或任何核心文件** —— 侧边栏、路由、懒加载全部由模块注册表自动推导。

## 敏感数据保护

数据库**不以明文存放任何敏感数据**,两条防线:

1. **会话令牌**:`auth_sessions` 只存令牌的 **SHA-256 哈希**(`token_hash` 列),明文令牌仅在登录响应中返回给客户端;登录/校验/登出均按哈希匹配。
2. **敏感键值加密**:写库前对敏感键用 **AES-256-GCM** 加密(存储格式 `enc:v1:<iv>:<tag>:<密文>`,12 字节随机 IV + 16 字节认证标签,每次加密 IV 随机),读取时由服务端解密后返回给已登录客户端。
   - 加密密钥:`ENCRYPTION_KEY` 环境变量(64 位 hex);本地开发未设置时首次启动自动生成并保存到 `server/.secret-key`(已 gitignore)。**生产环境务必显式设置,丢失/更换将无法解密既有数据**。
   - 判定为敏感键的规则:键名含 `password / email / apikey / api_key / secret / token / credential / access_key` 之一,或整体为含敏感字段的配置块(`settings:profile` 含邮箱)。
   - `settings:auth:*` 保留键(历史遗留,如 `settings:auth:password`)另有防线:通用 KV 接口读写均拒绝、GET 不返回。

**模块数据表同样适用**:任何模块表(如笔记 `notes_data`)的敏感列(邮箱/apikey/token/密钥)必须用同样方案加密落库,禁止明文;密钥管理统一走 `server/security/`。

## 数据库设计

数据库驱动采用**统一接口**(`query` / `run` 两个方法),通过环境变量切换,业务代码零改动:

| 环境变量                               | 值             | 说明                                                                                                                                            |
| -------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `DB_DRIVER`                            | `sqlite`(默认) | 本地 SQLite,`node:sqlite` 内置模块(需 Node ≥ 22.5,推荐 ≥ 23.4),零第三方依赖                                                                     |
| `DB_DRIVER`                            | `turso`        | 远程 Turso / libSQL HTTP API(需 `DATABASE_URL` + `DATABASE_AUTH_TOKEN`)                                                                         |
| `DB_DRIVER`                            | `d1`           | Cloudflare D1(Worker 内用原生 binding;本地走 D1 REST API,需 `D1_ACCOUNT_ID` / `D1_DATABASE_ID` / `D1_API_TOKEN`;详见 docs/deploy/cloudflare.md) |
| `ENCRYPTION_KEY`                       | 64 位 hex      | 敏感数据 AES-256-GCM 加密密钥(生产必设;缺省时自动生成到 `server/.secret-key`)                                                                   |
| `SQLITE_PATH`                          | 路径           | 本地 sqlite 文件位置(默认 `sqlite.db`,已加入 .gitignore)                                                                                        |
| `DATABASE_URL` / `DATABASE_AUTH_TOKEN` | —              | turso 远程数据库连接信息                                                                                                                        |

### 表结构

```sql
-- 设置:键值对表,按工作空间分片(workspace_id + key 复合主键)
CREATE TABLE app_settings (
  workspace_id TEXT NOT NULL,          -- 'global' 仅存工作空间注册表 / 当前指针,其余为具体工作空间 id
  key          TEXT NOT NULL,          -- 命名规范见下
  value        TEXT NOT NULL,          -- 值统一为文本(JSON 字符串或普通字符串)
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (workspace_id, key)
);

-- 会话表:登录成功后写入,登出/过期时删除(登录会话基础设施,与工作空间无关)
-- 只存令牌 SHA-256 哈希,绝不存明文令牌
CREATE TABLE auth_sessions (
  token_hash TEXT PRIMARY KEY,          -- sha256(令牌),由请求头 x-auth-token 携带并哈希匹配
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT,                      -- ISO 时间;过期即失效
  note       TEXT                       -- 失效选项标记(如 '24h' / 'browser')
);
```

### 键值命名规范(app_settings)

- **设置键**:`settings:<域>` —— 如 `settings:appearance`(主题/风格/字体/圆角等)、`settings:display`(侧边栏宽度/变体/隐藏菜单)、`settings:profile`(用户资料)。除 `settings:workspaces`(工作空间列表)与 `settings:activeWorkspace`(当前工作空间 id)两个全局键外,均落在当前工作空间;值统一为 JSON 字符串。
- **鉴权保留键**:`settings:auth:*`(历史遗留,如 `settings:auth:password`;登录密码已改为与 `AUTH_PASSWORD` 环境变量直接校验,不再写入数据库)。**禁止**通过通用 KV 接口读写:PUT/DELETE 返回 403,GET 不返回。
- **模块数据表**:`<模块名>_<用途>` —— 如笔记模块 `notes_tags`、`notes_data`;数据表与全局设置表分离,模块表不混入 `app_settings`。
- **工作空间隔离**:`app_settings` 本身按 `workspace_id` 分片(`global` 作用域仅存 `settings:workspaces` / `settings:activeWorkspace`);`auth_sessions` 是登录会话基础设施,保持全局;所有业务数据表必须包含 `workspace_id` 列,写入时带上当前工作空间 id、查询时按 `WHERE workspace_id = ?` 过滤,不同工作空间的数据互相隔开、互不影响。

### API 一览

| 方法   | 路径               | 说明                                                                                                   |
| ------ | ------------------ | ------------------------------------------------------------------------------------------------------ |
| POST   | `/api/auth/login`  | `{ password, expiry }` → `{ token, expiresAt, expiry }`(无需鉴权)                                      |
| GET    | `/api/auth/verify` | 校验会话有效性                                                                                         |
| POST   | `/api/auth/logout` | 删除当前会话                                                                                           |
| GET    | `/api/settings`    | 返回全局注册表 + 当前工作空间设置(可用 `?workspace=<id>` 指定;不含 `settings:auth:*`;敏感键解密后返回) |
| PUT    | `/api/settings`    | `{ settings: { key: value } }` 批量写入(拒绝 `settings:auth:*`;敏感键加密后落库)                       |
| DELETE | `/api/settings`    | `{ keys: [...] }` 删除(拒绝 `settings:auth:*`)                                                         |

除登录外,所有 `/api/*` 均要求请求头 `x-auth-token`。

### 部署到 Cloudflare / Vercel / Deno / Docker 等平台

模板是纯静态 + 可移植 Node 服务,可整体部署。四套完整方案均已就绪:

- **Cloudflare Workers + D1**(推荐):`worker.js`(Worker 入口)+ `server/db-d1.js`(D1 适配器)+ `wrangler.toml` + `.assetsignore`;静态资源由边缘网络托管,`/api/*` 由同一 Worker 处理,数据存 D1。支持 GitHub Actions / 控制台 Git 集成 / `wrangler` 命令行三种方式,**详见 [`docs/deploy/cloudflare.md`](./docs/deploy/cloudflare.md)**。
- **Vercel + Turso**:`api/index.js`(无服务器函数,`vercel.json` 用 rewrites 把 `/api/*` 转发给它,复用 `server/api.js` 处理器)+ `npm run build` 输出 `dist/` 静态目录,`DB_DRIVER=turso` 指向 Turso 数据库。支持控制台 Git 导入 / `vercel` CLI / GitHub Actions 三种方式,**详见 [`docs/deploy/vercel.md`](./docs/deploy/vercel.md)**。
- **Deno Deploy + Turso**:`deno/main.js`(dynamic 模式入口,静态资源 + 全部 `/api/*`,经 `createRequire` 复用 `server/api.js`)+ `deno.json`(deploy 配置)+ GitHub Actions(`.github/workflows/deploy-deno.yml`)。支持控制台 Git 导入(零 YAML)/ GitHub Actions / `deno deploy` 命令行三种方式,**详见 [`docs/deploy/deno.md`](./docs/deploy/deno.md)**。
- **Docker(自托管)**:`Dockerfile`(`debian:latest` 基础 + 官方 Node 22 LTS,零 npm 依赖)+ `docker-compose.yml`(端口映射 / 环境变量 / 数据卷 `/app/data`)+ `.dockerignore`;`docker compose up -d --build` 一键启动完整服务,本地 SQLite 落盘数据卷,容器重建不丢数据,**详见 [`docs/deploy/docker.md`](./docs/deploy/docker.md)**。
- **本地 Node 直连 D1**:`DB_DRIVER=d1` + `D1_ACCOUNT_ID` / `D1_DATABASE_ID` / `D1_API_TOKEN`,走官方 D1 REST API(见 docs/deploy/cloudflare.md)。
- **常规服务器 / 本地开发**:直接 `node dev-server.js`(内置静态托管),`DB_DRIVER=turso` 即可让数据库远程化。

## 日志系统

### 服务器终端日志(`server/logger.js`)

分级 **DEBUG / INFO / WARN / ERROR**,终端彩色输出(不同等级不同前景/背景色 + 加粗徽标 + 时间戳 + 作用域),错误自动打印完整堆栈。作用域约定:`server`(启动)/ `db`(数据库)/ `auth`(鉴权)/ `api`(接口)/ `http`(静态)/ `crypto`(加密)。

- 接口请求自动记录:`INFO [api] POST /api/settings 200 12ms`(2xx→info、4xx→warn、5xx→error;静态资源仅 debug,默认不刷屏)
- 等级过滤:`LOG_LEVEL=debug|info|warn|error`(默认 `info`)
- 用法:`log.info('db', '数据库已连接')`、`log.error('api', '接口异常', err)`、`log.request(method, path, status, ms, { api: true })`

### 浏览器控制台日志(`js/core/logger.js`)

分级 **debug / info / warn / error**,控制台按等级着色(彩色徽标 + 项目名 + 模块标签)。**自动定位错误位置**:通过调用栈提取调用者文件、函数与行号,输出形如:

```
[One API] ERROR [dashboard] js/modules/dashboard/module.js#render:42 加载失败
[One API] DEBUG [settings] js/modules/settings/module.js#render:277 渲染子页面: profile
```

- **全局捕获**:`window.onerror` / `unhandledrejection` 自动上报 —— 任何未捕获异常与未处理的 Promise 拒绝都会带文件/函数/行号与完整堆栈出现在控制台
- 传入 `Error` 对象时,控制台额外打印完整可点击的堆栈(定位到具体行)
- 等级过滤:`App.logger.setLevel('warn')`(默认 `debug`)
- 用法:`App.logger.error('dashboard', '渲染失败', err)`、`App.logger.info('auth', '登录成功')`;模块/文件/行号**自动提取,无需手填**

## 解耦与安全约定

1. **模块之间禁止互相引用**;只允许依赖核心层(`App.ui` / `App.icon` / `App.i18n` / `App.settings` / `ctx`)
1. **数据库不以明文存敏感数据**:会话令牌存哈希;邮箱/apikey/token/secret 等敏感键值 AES-256-GCM 加密落库(见「敏感数据保护」)
1. 文案遵循 **模块内聚**:模块文案放各自懒加载的 `i18n.js`(manifest 仅声明 `i18nFile`),只有 App Shell / 设置面板等公共文案进核心词典
1. **存储值白名单校验**:`settings.js` 对 localStorage 读入值一律校验,非法值回退默认
1. **事件委托**:全部交互挂在 `document` 上,内容区重渲染后无需重新绑定
1. 路由表有 404 兜底,未知路径渲染 404 页面
1. `index.html` 内置 CSP 与首帧主题脚本,保证无闪烁、无外部请求

## 设计系统说明

`assets/css/app.css` 是原模板 Tailwind 构建产物的内置副本(352KB,含 8 套组件风格、调色板、深浅主题与本地字体声明)。模块内如需额外样式,写在模块自己的 `module.css` 并加入清单的 `css` 字段;如需改动设计系统,替换该文件或在其后追加覆盖规则(`index.html` 中追加 `<link>` 即可)。

## 第三方库

项目默认零外部依赖,但支持引入**单文件、无子依赖**的第三方 JS 库:

| 库类型          | 放置位置                         |
| --------------- | -------------------------------- |
| 前端单文件库    | `js/lib/xxx.js`                  |
| 后端单文件库    | `server/lib/xxx.js`              |
| 有 npm 依赖的库 | `package.json` + `node_modules/` |

使用 `loadScript('js/lib/xxx.js')` 懒加载前端库;后端直接 `require('./lib/xxx')`。如果库依赖其他 npm 包,请使用 `package.json` 管理。
