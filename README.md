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

## 快速开始

```bash
# 方式一:直接双击 index.html 打开(推荐,零依赖)
# 方式二:任意静态服务器托管本目录
python -m http.server 8000
# 或
npx serve .
```

## 目录结构

```
.
├── index.html                # 唯一入口(PREPAINT 首帧脚本 + 引导)
├── README.md
├── assets/
│   ├── css/app.css           # 设计系统(内置编译产物:全部风格 + 调色板 + 字体声明)
│   └── fonts/                # 本地字体(Inter / Manrope woff2)
└── js/
    ├── core/                 # 核心运行时(不依赖任何模块)
    │   ├── boot.js           # 引导:按序加载核心 + 模块清单 + App.start()
    │   ├── i18n.js           # 三语言词典 + 翻译(模块词典优先)
    │   ├── icons-data.js     # lucide 图标节点数据(lucide v0.525.0,ISC)
    │   ├── icons.js          # 图标渲染(SVG)与设置面板预览图
    │   ├── settings.js       # 设置状态(localStorage,白名单校验)
    │   ├── ui.js             # 共享 UI 组件(button/badge/card/placeholder/404)
    │   ├── shell.js          # App Shell 渲染(侧边栏/顶栏/设置面板)
    │   └── app.js            # 应用内核:模块注册表 + Hash 路由 + 事件委托
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

`js/modules/settings/` 移植自 `/home/kubuntu/projects/mpages/apps/web` 的侧边栏二级子菜单 Settings(个人资料 / 账号 / 外观 / 通知 / 显示)。表单页仅移植**页面内容**(无提交/校验,控件为本地原生 select / date / radio);**外观页与显示页为可交互功能**:

- **外观页 ↔ 主题设置面板双向同步**:与右上角主题设置弹框同源,两侧读写同一份 `App.settings`(localStorage + html 类)。任一侧点击主题/侧边栏/布局/色板/风格/字体/圆角/菜单选项,另一侧立即同步更新,改动持久化。`重置外观` 仅重置主题/布局/外观(不清语言与宽度);右上角面板底部 `重置全部` 仍为全量重置。
- **显示页 = 侧边栏菜单可见性控制**:点击菜单项即实时隐藏/显示对应侧边栏菜单(勾选状态持久化于 `hidden-nav`),侧边栏立即刷新;`设置` 项锁定不可隐藏(与 mpages `LOCKED_ITEM_ID` 一致)。

**主题设置样式已与 mpages 对齐**:顶部主题切换为胶囊式 radio group(选中项反白填充);设置面板与 Settings → 外观页均使用 radio-group 卡片(选中项 `ring-primary` 描边 + 阴影 + 对勾徽标;色板/风格/字体/圆角为描边卡片,卡片等宽填满网格单元)。样式实现在 `assets/css/app.css`(`.theme-switch` / `.ts-*`)与设置模块 `module.css`(`.sp-opt-*`)。

## 模块契约

### 1. 清单 `js/modules/<name>/manifest.js`

只声明元信息,不含逻辑;引导阶段同步加载(体积极小)。

```js
App.registerModule({
  id: 'mymod',                            // 模块 ID,须与目录名一致
  title: { 'zh-CN': '我的模块', 'zh-TW': '我的模組', en: 'My Module' },
  icon: 'settings',                       // lucide 图标名(见 icons-data.js)
  route: '/mymod',                        // 一级菜单路由(缺省 /<id>)
  load: 'module.js',                      // 实现文件(缺省 module.js,懒加载)
  css: 'module.css',                      // 可选:模块私有样式(懒加载)
  i18n: { 'zh-CN': { ... }, en: { ... } }, // 可选:模块自有文案(不进核心词典)
  children: [                             // 可选:子模块(二级菜单)
    {
      id: 'intro',
      title: { 'zh-CN': '简介', en: 'Intro' },
      route: '/mymod/intro',
      load: 'sub/intro.js',               // 子模块独立实现文件
    },
  ],
});
```

### 2. 实现 `js/modules/<name>/module.js`

首次访问对应路由时才懒加载。`ctx` 提供 `t`(模块词典优先的翻译)、`settings`、`path`、`App`。

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
App.defineModule({ id: 'docs', sub: 'intro', render: function (route, ctx) { /* ... */ } });
```

### 3. 登记

在 `js/core/boot.js` 的 `MODULE_DIRS` 数组中追加目录名:

```js
var MODULE_DIRS = ['dashboard', 'channels', 'tokens', 'logs', 'docs', 'mymod'];
```

**新增一个模块不需要修改 `index.html` 或任何核心文件** —— 侧边栏、路由、懒加载全部由模块注册表自动推导。

## 解耦与安全约定

1. **模块之间禁止互相引用**;只允许依赖核心层(`App.ui` / `App.icon` / `App.i18n` / `App.settings` / `ctx`)
2. 文案遵循 **模块内聚**:模块文案放各自 `manifest.js` 的 `i18n`,只有 App Shell / 设置面板等公共文案进核心词典
3. **存储值白名单校验**:`settings.js` 对 localStorage 读入值一律校验,非法值回退默认
4. **事件委托**:全部交互挂在 `document` 上,内容区重渲染后无需重新绑定
5. 路由表有 404 兜底,未知路径渲染 404 页面
6. `index.html` 内置 CSP 与首帧主题脚本,保证无闪烁、无外部请求

## 设计系统说明

`assets/css/app.css` 是原模板 Tailwind 构建产物的内置副本(352KB,含 8 套组件风格、调色板、深浅主题与本地字体声明)。模块内如需额外样式,写在模块自己的 `module.css` 并加入清单的 `css` 字段;如需改动设计系统,替换该文件或在其后追加覆盖规则(`index.html` 中追加 `<link>` 即可)。
