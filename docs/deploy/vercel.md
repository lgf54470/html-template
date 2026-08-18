# 部署到 Vercel(docs/deploy/vercel.md)

本文介绍如何把本模板部署到 **Vercel**,数据库使用 **Turso**(远程 libSQL)。架构:

```
浏览器
  │
  ├─ /            → 静态资源由 Vercel CDN 托管(dist/: index.html / js / assets)
  └─ /api/*       → Vercel Serverless Function(api/index.js,由 vercel.json rewrites 转发)
                        │
                        └─ Turso 远程数据库(HTTP v2 pipeline API)
```

- **静态资源**:Vercel 只发布 **Output Directory**(`dist/`)的内容,`dist` 由 `npm run build`(`scripts/vercel-build.js`)生成。
- **API**:`api/index.js` 承接全部 `/api/*` 请求(`vercel.json` 里用 `rewrites` 把 `/api/:path*` 转发到该函数,见下文「关于路由」),复用 `server/api/index.js` 的处理器——与本地 `dev-server.js` **完全同一份逻辑**。
- **数据库**:Turso(远程 libSQL),`DB_DRIVER=turso` + `DATABASE_URL` + `DATABASE_AUTH_TOKEN`;首次请求自动建表。
- **密码与加密**:登录密码与 `AUTH_PASSWORD` 环境变量直接做常量时间比较(不落库、无随机初始密码、不支持应用内改密);AES-256-GCM 敏感键加密,`ENCRYPTION_KEY` 与其它环境互通。

## 前置准备

### 1. 创建 Turso 数据库

```bash
# 安装并登录 Turso CLI
curl -sSfL https://get.turso.tech/setup.sh | bash
turso auth login

# 创建数据库并获取连接信息
turso db create html-template-db
turso db show html-template-db         # 记下 url(形如 https://<db>-<org>.turso.io)
turso db tokens create html-template-db  # 生成长期访问令牌(或 turso db auth list)
```

也可以直接到 [Turso 控制台](https://console.turso.io) 创建数据库并复制 **URL** 与 **Token**。

### 2. 需要配置的环境变量(在 Vercel 项目 Settings → Environment Variables 中设置)

| 变量                  | 值                            | 说明                                                                                                                                                               |
| --------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DB_DRIVER`           | `turso`                       | 驱动选择(**必填**;不设会回退到 sqlite,在 serverless 只读文件系统上报 `unable to open database file`。`api/index.js` 未显式设置时会自动默认 `turso`,但建议显式配置) |
| `DATABASE_URL`        | `https://<db>-<org>.turso.io` | Turso 数据库地址;`libsql://` 形式会自动归一化为 `https://`,两种都可用                                                                                              |
| `DATABASE_AUTH_TOKEN` | 上一步生成的令牌              | Turso 访问令牌                                                                                                                                                     |
| `AUTH_PASSWORD`       | 自定                          | 登录密码(**必设**;登录时直接与该环境变量校验,未配置会报错)                                                                                                         |
| `ENCRYPTION_KEY`      | 64 位 hex                     | 敏感数据加密密钥,`openssl rand -hex 32` 生成;请固定并妥善保管                                                                                                      |

> 全部为运行期环境变量,建议 Production 与 Preview 环境都添加(Preview 可换独立 Turso 库)。

## 部署方式

三种方式任选其一,最终产物一致。

### 方式一:Vercel 控制台 Git 导入(推荐)

1. 打开 [Vercel](https://vercel.com/new),选择 **Import Git Repository**,授权并选择本仓库。
2. **Framework Preset** 选择 **Other**(或让它自动识别为 Other)。
3. 构建设置:仓库 `vercel.json` 已内置 **Build Command** `npm run build` 与 **Output Directory** `dist`(还有 `/api/*` 的 rewrites),控制台可留空不填;若手动填写,务必与 `vercel.json` 保持一致(Root Directory 留空)。
4. 在 **Environment Variables** 中添加前置准备里的 4 个变量。
5. 点击 **Deploy**。之后每次 push 到 `main` 自动部署,PR 自动生成 Preview。

### 方式二:vercel CLI

```bash
npx vercel login                       # 浏览器授权
npx vercel link                        # 关联/创建项目(首次)
npx vercel env add DATABASE_URL production
npx vercel env add DATABASE_AUTH_TOKEN production
npx vercel env add AUTH_PASSWORD production
npx vercel env add ENCRYPTION_KEY production
npx vercel --prod                      # 构建并发布(自动执行 npm run build,输出 dist)
```

本地预览:`npx vercel dev`(本地模拟 Vercel 环境,含函数与静态目录)。

### 方式三:GitHub Actions

仓库已内置工作流 `.github/workflows/deploy-vercel.yml`,在 GitHub 仓库配置 Secrets 后即可用:

| GitHub Secret       | 值                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------ |
| `VERCEL_TOKEN`      | Vercel 账号令牌(Account Settings → Tokens → Create)                                  |
| `VERCEL_ORG_ID`     | Vercel 项目 Settings → General 里的 **Vercel org id**(或 `npx vercel whoami` 后查看) |
| `VERCEL_PROJECT_ID` | 项目 Settings → General 里的 **Vercel project id**                                   |

**触发**:push `v*` 标签(如 `git tag v1.0.0 && git push --tags`)自动部署,或 Actions 页面手动 `Run workflow`。

工作流执行 `vercel pull → vercel build → vercel deploy --prebuilt`,运行期环境变量仍在 Vercel 项目里配置(不由 GitHub 管理)。

## 验证部署

1. 打开部署 URL → 出现**登录页**(说明 `dist/` 静态资源正常)。
2. 用 `AUTH_PASSWORD` 登录 → 进入仪表盘(说明函数 + Turso 正常)。
3. 修改任意设置(如主题)→ 刷新后设置保留(说明数据已写入 Turso)。
4. (可选)想改密码:更新 `AUTH_PASSWORD` 环境变量后重新部署即可。

## 本地验证(不部署即可跑通全流程)

```bash
# 方式 A:本地 Node 服务器 + 真实 Turso(与线上同构)
cp .env.example .env     # 填入 DB_DRIVER=turso / DATABASE_URL / DATABASE_AUTH_TOKEN / AUTH_PASSWORD / ENCRYPTION_KEY
node dev-server.js

# 方式 B:本地 Node 服务器 + 本地 sqlite(无需 Turso)
node dev-server.js

# 方式 C:本地模拟 Vercel 环境(需要已登录 vercel)
npx vercel dev
```

## 数据与安全

- **加密互通**:`ENCRYPTION_KEY` 与 Cloudflare / 本地一致时,同一份数据可在各环境间迁移解密。
- **Turso 是共享远程库**:本地 `DB_DRIVER=turso` 与线上连的是同一个库,写设置会立即影响线上(反之亦然);想要隔离请为 Preview 环境创建独立 Turso 库。
- Vercel 只公开发布 `dist/` 与 `api/` 函数;`server/`、`.env` 等不会对外(另有 `.vercelignore` 防止敏感文件进入构建环境)。

## 常见问题(FAQ)

**Q:部署后所有请求(包括 `/`、`/favicon.ico`)都报 500,日志是 `unable to open database file`?**
A:两个原因叠加:(1) 根目录的 `server.js` 会被 Vercel 自动捕获为 Node.js 自定义服务器入口,接管全部请求——本仓库已把本地服务器改名为 `dev-server.js` 规避,请**重新部署最新代码**;(2) 环境变量缺少 `DB_DRIVER=turso`,驱动回退到 sqlite 在只读文件系统打不开库文件——在 Vercel 项目 Settings → Environment Variables 添加 `DB_DRIVER=turso` 后重新部署。

**Q:部署后访问 `/` 返回 404?**
A:确认 Output Directory 设为 `dist` 且 Build Command 为 `npm run build`;`dist` 里应有 `index.html`。

**Q:登录提示密码错误?**
A:密码始终取自 `AUTH_PASSWORD` 环境变量(常量时间比较),不落库、不生成随机密码。确认 Vercel 项目 Settings → Environment Variables 里 `AUTH_PASSWORD` 已配置且与输入的密码一致;修改后**重新部署**生效。若密码确认无误仍报错,先确认部署的是最新代码(旧版 `server/db/turso.js` 解析不了 Turso 新版 `/v2/pipeline` 响应,任何 SELECT 都读到空行,会导致登录永远失败——新版已兼容,见下一条 FAQ)。

**Q:登录失败,浏览器报 `POST /api/auth/login → 404`,但静态页面正常?**
A:这是路由问题——**Vercel 的 `api/` 目录不支持括号 catch-all 文件名**(实测 `api/[[...path]].js` / `api/[...path].js` 都会被编译成单段匹配 `^/api/([^/]+)$`,`/api/auth/login` 这类双段路径永远 404)。本仓库已改用 **`api/index.js` + `vercel.json` rewrites**(`/api/:path*` → `/api/index`)的方案,函数内从 `?path=` 查询参数还原原始路径。请**拉取最新代码并重新部署**;仍 404 时,在 Vercel 部署页的 Functions 列表确认存在 `api/index.js`,并检查是否部署的是旧代码。

**Q:函数日志报 `fetch failed` 或 `无法连接 …/v2/pipeline`?**
A:函数连不上 Turso。最常见原因是 `DATABASE_URL` 用了 `libsql://` 开头(Node 的 fetch 不认该协议)——本仓库驱动已自动把 `libsql://` 归一化为 `https://`;若仍失败,检查 URL 是否拼写正确、`DATABASE_AUTH_TOKEN` 是否有效(无效会报 `HTTP 401` 而非 `fetch failed`)。

**Q:登录接口报「未配置 AUTH_PASSWORD 环境变量」?**
A:密码由 `AUTH_PASSWORD` 环境变量统一管理,未配置时登录返回该报错(不会生成随机密码)。在 Vercel 项目 Settings → Environment Variables 添加 `AUTH_PASSWORD` 后重新部署即可。

**Q:函数日志报缺少 `DATABASE_URL` / `DATABASE_AUTH_TOKEN`?**
A:环境变量未配置或未应用到该环境(Production / Preview 分开配);配置后重新部署。

**Q:邮箱等敏感字段为空?**
A:`ENCRYPTION_KEY` 与写入时不一致(或未设置)。密钥必须固定、与其它环境一致。

**Q:与 Cloudflare 部署的关系?**
A:两套独立方案,任选其一即可;数据可通过同一 `ENCRYPTION_KEY` 互通。Cloudflare 见 [`cloudflare.md`](./cloudflare.md)。

## 文件清单

| 文件                                  | 作用                                                                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `api/index.js`                        | Vercel 函数入口(全部 `/api/*`,经 rewrites 转发),复用 `server/api/index.js`                                          |
| `vercel.json`                         | `framework=null` + Build Command(`npm run build`)+ Output Directory(`dist`)+ rewrites(`/api/:path*` → `/api/index`) |
| `package.json`                        | 声明 `build` / `start` 脚本与 Node 版本要求(Vercel 构建依赖)                                                        |
| `scripts/vercel-build.js`             | 零依赖构建脚本:把 `index.html` / `js` / `assets` 复制到 `dist/`                                                     |
| `dev-server.js`                       | 本地 / 自托管服务器(已改名:不能叫 `server.js`,否则会被 Vercel 捕获为自定义服务器入口)                               |
| `.vercelignore`                       | 阻止本地敏感文件(数据库、密钥、`.env`)上传到构建环境                                                                |
| `.github/workflows/deploy-vercel.yml` | GitHub Actions 自动部署                                                                                             |
| `docs/deploy/vercel.md`               | 本文档                                                                                                              |
