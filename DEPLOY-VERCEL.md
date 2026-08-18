# 部署到 Vercel(DEPLOY-VERCEL.md)

本文介绍如何把本模板部署到 **Vercel**,数据库使用 **Turso**(远程 libSQL)。架构:

```
浏览器
  │
  ├─ /            → 静态资源由 Vercel CDN 托管(dist/: index.html / js / assets)
  └─ /api/*       → Vercel Serverless Function(api/[[...path]].js)
                        │
                        └─ Turso 远程数据库(HTTP v2 pipeline API)
```

- **静态资源**:Vercel 只发布 **Output Directory**(`dist/`)的内容,`dist` 由 `npm run build`(`scripts/vercel-build.js`)生成。
- **API**:`api/[[...path]].js` 承接全部 `/api/*` 请求,复用 `server/api.js` 的处理器——与本地 `dev-server.js` **完全同一份逻辑**。
- **数据库**:Turso(远程 libSQL),`DB_DRIVER=turso` + `DATABASE_URL` + `DATABASE_AUTH_TOKEN`;首次请求自动建表。
- **密码与加密**:与本地一致——scrypt 密码哈希、AES-256-GCM 敏感键加密,`ENCRYPTION_KEY` 与其它环境互通。

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

| 变量 | 值 | 说明 |
|---|---|---|
| `DB_DRIVER` | `turso` | 驱动选择(**必填**;不设会回退到 sqlite,在 serverless 只读文件系统上报 `unable to open database file`。`api/[[...path]].js` 未显式设置时会自动默认 `turso`,但建议显式配置) |
| `DATABASE_URL` | `https://<db>-<org>.turso.io` | Turso 数据库地址 |
| `DATABASE_AUTH_TOKEN` | 上一步生成的令牌 | Turso 访问令牌 |
| `AUTH_PASSWORD` | 自定 | 首次登录管理员密码(密码已在库中则忽略) |
| `ENCRYPTION_KEY` | 64 位 hex | 敏感数据加密密钥,`openssl rand -hex 32` 生成;请固定并妥善保管 |

> 全部为运行期环境变量,建议 Production 与 Preview 环境都添加(Preview 可换独立 Turso 库)。

## 部署方式

三种方式任选其一,最终产物一致。

### 方式一:Vercel 控制台 Git 导入(推荐)

1. 打开 [Vercel](https://vercel.com/new),选择 **Import Git Repository**,授权并选择本仓库。
2. **Framework Preset** 选择 **Other**(或让它自动识别为 Other)。
3. 构建设置:
   - **Build Command**:`npm run build`
   - **Output Directory**:`dist`
   - (仓库根目录即 Root Directory)
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

| GitHub Secret | 值 |
|---|---|
| `VERCEL_TOKEN` | Vercel 账号令牌(Account Settings → Tokens → Create) |
| `VERCEL_ORG_ID` | Vercel 项目 Settings → General 里的 **Vercel org id**(或 `npx vercel whoami` 后查看) |
| `VERCEL_PROJECT_ID` | 项目 Settings → General 里的 **Vercel project id** |

工作流执行 `vercel pull → vercel build → vercel deploy --prebuilt`,运行期环境变量仍在 Vercel 项目里配置(不由 GitHub 管理)。

## 验证部署

1. 打开部署 URL → 出现**登录页**(说明 `dist/` 静态资源正常)。
2. 用 `AUTH_PASSWORD` 登录 → 进入仪表盘(说明函数 + Turso 正常)。
3. 修改任意设置(如主题)→ 刷新后设置保留(说明数据已写入 Turso)。
4. 在 **设置 → 账号** 修改密码。

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
- **Turso 是共享远程库**:本地 `DB_DRIVER=turso` 与线上连的是同一个库,改密/写设置会立即影响线上(反之亦然);想要隔离请为 Preview 环境创建独立 Turso 库。
- Vercel 只公开发布 `dist/` 与 `api/` 函数;`server/`、`.env` 等不会对外(另有 `.vercelignore` 防止敏感文件进入构建环境)。

## 常见问题(FAQ)

**Q:部署后所有请求(包括 `/`、`/favicon.ico`)都报 500,日志是 `unable to open database file`?**
A:两个原因叠加:(1) 根目录的 `server.js` 会被 Vercel 自动捕获为 Node.js 自定义服务器入口,接管全部请求——本仓库已把本地服务器改名为 `dev-server.js` 规避,请**重新部署最新代码**;(2) 环境变量缺少 `DB_DRIVER=turso`,驱动回退到 sqlite 在只读文件系统打不开库文件——在 Vercel 项目 Settings → Environment Variables 添加 `DB_DRIVER=turso` 后重新部署。

**Q:部署后访问 `/` 返回 404?**
A:确认 Output Directory 设为 `dist` 且 Build Command 为 `npm run build`;`dist` 里应有 `index.html`。

**Q:登录提示密码错误 / 不知道初始密码?**
A:确认已配置 `AUTH_PASSWORD` 环境变量;若未配置,首次启动会生成随机密码并打印在 Vercel 函数日志里。密码已存在时 `AUTH_PASSWORD` 会被忽略——重置方法:先在 Vercel 控制台或 CLI 里执行 `DELETE FROM app_settings WHERE key='settings:auth:password'`(用 `turso db shell` 或 SQL 客户端),再更新 `AUTH_PASSWORD`。

**Q:函数日志报缺少 `DATABASE_URL` / `DATABASE_AUTH_TOKEN`?**
A:环境变量未配置或未应用到该环境(Production / Preview 分开配);配置后重新部署。

**Q:邮箱等敏感字段为空?**
A:`ENCRYPTION_KEY` 与写入时不一致(或未设置)。密钥必须固定、与其它环境一致。

**Q:与 Cloudflare 部署的关系?**
A:两套独立方案,任选其一即可;数据可通过同一 `ENCRYPTION_KEY` 互通。Cloudflare 见 [`DEPLOY.md`](./DEPLOY.md)。

## 文件清单

| 文件 | 作用 |
|---|---|
| `api/[[...path]].js` | Vercel 函数入口(全部 `/api/*`),复用 `server/api.js` |
| `vercel.json` | Build Command(`npm run build`)与 Output Directory(`dist`) |
| `package.json` | 声明 `build` / `start` 脚本与 Node 版本要求(Vercel 构建依赖) |
| `scripts/vercel-build.js` | 零依赖构建脚本:把 `index.html` / `js` / `assets` 复制到 `dist/` |
| `dev-server.js` | 本地 / 自托管服务器(已改名:不能叫 `server.js`,否则会被 Vercel 捕获为自定义服务器入口) |
| `.vercelignore` | 阻止本地敏感文件(数据库、密钥、`.env`)上传到构建环境 |
| `.github/workflows/deploy-vercel.yml` | GitHub Actions 自动部署 |
| `DEPLOY-VERCEL.md` | 本文档 |
