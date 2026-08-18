# AI工程开发原则

**18 RULES / 5 SECTIONS**

## 核心思想

- 以第一性原理思考问题。理解需求背后的真实目标，而不是直接套用已有模式或技术方案。
- 优先解决本质问题，避免为假设中的未来需求提前设计复杂系统。
- 在保证长期可维护性的前提下，选择当前最简单、可靠、清晰的实现方案。

## 代码质量原则

- 保持模块职责明确，避免一个模块承担过多职责。
- 优先使用成熟、稳定、维护良好的第三方库，而不是重复造轮子。
- 使用项目已有依赖解决问题之前，不要随意新增依赖。
- 在引入新方案前，先检查已有代码、依赖、文档和能力。

## 简洁与设计原则

- 遵循 KISS（Keep It Simple, Stupid）原则：优先选择简单直接的实现，避免不必要的复杂度。
- 遵循 DRY（Don't Repeat Yourself）原则：避免重复逻辑，但不要为了消除少量重复而创建过度抽象。
- 遵循 SOLID 思想：保持职责清晰、降低模块耦合，提高代码可维护性和扩展能力。
- 避免为了“看起来更优雅”而增加实际复杂度。

## 工程决策原则

- 优先选择长期可维护的方案，而不是只能临时运行的解决方案。
- 代码应该服务于业务目标，而不是为了展示技术复杂度。
- 如果简单方案已经满足需求，不要主动升级为复杂方案。

## 架构原则

- 不要为了保持向后兼容而长期保留废弃方案。优先删除过时代码，而不是增加兼容层、fallback 或临时迁移逻辑。
- 不要进行未经验证的架构设计。避免提前引入抽象、配置和间接层。
- 从最小可工作的版本开始，逐步演进系统。每次修改都应该建立在已有可运行系统之上。
- 永远不要用未来可能需要的复杂性，牺牲当前产品的可用性。



## 移植类项目必须遵循的铁律

- UI 布局与结构：与参考项目保持完全一致。
- 样式改造：不照搬原有样式，必须改造为与当前项目统一 UI 风格一致。
- 代码逻辑：函数、参数、调用方式、返回数据结构保持完全移植。
- 移植完成后：再次对前端、后端、路由等进行全面、全量对比，确保完全一致。

## UI 设计规范

- 响应式优先：布局与组件需提前考虑响应式，尽量减少留白，避免信息卡片上、下、左、右出现大量空白（可通过加大字体、补充图标等方式收敛）。
- 组件复用优先：先检查现有可复用组件，避免重复设计；新组件若会被多处使用，应提取为公共组件。
- 统一风格：UI 模仿 shadcn 的 Base UI 风格，采用 Nova 样式与 Zinc 主题，组件观感与 shadcn 保持一致。
- 布局约定：整体采用 sidebar-with-header 布局（侧边栏 + 顶栏），新增模块只允许在剩余 Main 区域实现。
- 滚动约定：仅 Main 区域拥有滚动条（与 shadcn 样式保持一致）。

## Git 提交规范

基于 [Conventional Commits](https://www.conventionalcommits.org/),并强制要求
**正文逐文件说明改动**(到方法/组件级别),便于回溯与 code review。

### 格式

```
<type>(<scope>): <subject>

<body>

[可选] BREAKING CHANGE: <破坏性变更说明>
[可选] Closes #<issue>
```

### type(必填)

| type | 含义 |
|---|---|
| feat | 新功能 |
| fix | 修复 bug |
| docs | 文档(README、注释) |
| style | 样式/格式(不影响逻辑) |
| refactor | 重构(不新增功能、不修 bug) |
| perf | 性能优化 |
| test | 测试相关 |
| build | 构建/依赖/包管理 |
| chore | 杂项(配置、脚本等) |
| ci | CI 配置 |
| revert | 回滚提交 |

### scope(可省略,与仓库目录对应)

| scope | 对应位置 |
|---|---|
| web | apps/web(应用) |
| ui | packages/ui(组件库) |
| config | packages/config(共享配置) |
| root | 根 workspace 配置(含 README/CI 等) |
| deps | 依赖变更(pnpm-lock.yaml/package.json) |
| * | 跨包改动 |

### subject(标题)要求

- 祈使句,动词开头:新增 / 修复 / 重构 / 移除 ...
- 不超过 50 字符,末尾不加句号
- 概括"做了什么",细节放正文

### body(正文)要求 —— 重点

1. 第一段:说明**为什么改、改了什么**(背景 + 结论)。
2. 之后**按文件逐条列出改动,标注到方法/组件/变量级别**:

```
- <相对路径>: <方法/组件/变量> — <具体改动说明>
```

3. 同一文件的多个改动合并为一条,用分号分隔;涉及模板/样式时可注明组件与插槽。

### 示例

```bash
git commit -m "$(cat <<'EOF'
feat(web): 设置面板新增主题风格切换

支持在设置面板中切换 8 套组件风格,状态写入 localStorage 与 cookie,
保证 SSR 与客户端首次渲染一致。

- apps/web/src/lib/settings.ts: createSettings 新增 setAppearance 方法,负责合并外观补丁并写入存储;applyAppearance 将 style/base/chart 等类应用至 html 根节点
- apps/web/src/components/theme-settings.vue: 新增风格选择器,onChange 回调调用 setAppearance({ style })
- apps/web/index.html: PREPAINT 脚本补充 style-* 类恢复逻辑
EOF
)"
```

修复类示例(正文强调根因):

```bash
git commit -m "$(cat <<'EOF'
fix(ui): 修复 Sidebar 在 offcanvas 折叠后宽度未复位

根因:Sidebar.vue 的 onMouseUp 未清理拖拽状态,导致 data-collapsible 切换后 width 残留。

- packages/ui/src/components/ui/sidebar/Sidebar.vue: handleDragEnd 新增 state 复位与 cleanup;onMounted 中补充 removeEventListener
- packages/ui/src/components/ui/sidebar/utils.ts: SIDEBAR_WIDTH_ICON 常量改为 3rem 供复位计算使用
EOF
)"
```

### 规则

- **一个 commit 只做一件事**,跨包改动拆分为多个 commit 或使用 scope=*。
- 提交前必须通过 `pnpm run typecheck`(涉及构建时再跑 `pnpm run build`)。
- 破坏性变更(接口签名、路由、依赖大版本)必须写 `BREAKING CHANGE`。
- 关联 issue 时在正文末尾写 `Closes #<issue>`。
- 正文语言与仓库一致(中文),提交信息整体保持一种语言,不要中英混杂。


