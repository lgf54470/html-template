# 部署到 Deno Deploy(docs/deploy/deno.md)

本文介绍如何把本模板部署到 **Deno Deploy**,数据库使用 **Turso**(远程 libSQL)。架构:

```
浏览器
  │
  ├─ / 与 /js /assets  → dynamic 入口(deno/main.js)直接读取部署包内的静态文件返回
  └─ /api/*            → 同一入口内的 API 处理器(复用 server/api.js)
                              │
                              └─ Turso 远程数据库(HTTP v2 pipeline API)
```

> **平台说明(2026-07-20 起)**:旧平台 Deploy Classic(dash.deno.com)与其配套的 `deployctl` CLI **已下线**,本文全部基于新平台(console.deno.com,内置 `deno deploy` 子命令,要求 Deno ≥ 2.4.2)。新平台的 **dynamic(动态)模式没有独立静态层**,全部请求都进入入口,因此本模板由 `deno/main.js` 一个入口同时承担**静态资源**与 **API**(与本地 `dev-server.js` 的职责完全一致)。

- **API 逻辑零重复**:`deno/main.js` 经 `node:module` 的 `createRequire` 加载 CommonJS 的 `server/api.js`(登录 / 校验 / 登出 / 设置 KV),与本地 `dev-server.js`、Vercel 函数 `api/index.js` **完全同一份实现**;数据库走 `server/db-turso.js` 驱动。
- **数据库**:Turso(远程 libSQL),`DB_DRIVER=turso` + `DATABASE_URL` + `DATABASE_AUTH_TOKEN`;首次请求自动建表。⚠ Deno 运行时没有 `node:sqlite`,**不可用 sqlite 驱动**(未设置 `DB_DRIVER` 时代码会自动默认 `turso`)。
- **密码与加密**:登录密码与 `AUTH_PASSWORD` 环境变量直接做常量时间比较(不落库、无随机初始密码、不支持应用内改密);AES-256-GCM 敏感键加密,`ENCRYPTION_KEY` 与本地 / Vercel / Cloudflare 部署互通。

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

### 2. 需要配置的环境变量(在 Deno Deploy 应用 Settings → Environment variables 中设置)

| 变量 | 值 | 说明 |
|---|---|---|
| `DB_DRIVER` | `turso` | 驱动选择(**必填**;未设置时代码默认 `turso`,但建议显式配置,勿写 `sqlite` —— Deno 无 `node:sqlite`) |
| `DATABASE_URL` | `https://<db>-<org>.turso.io` | Turso 数据库地址;`libsql://` 形式会自动归一化为 `https://`,两种都可用 |
| `DATABASE_AUTH_TOKEN` | 上一步生成的令牌 | Turso 访问令牌(建议标记为 Secret) |
| `AUTH_PASSWORD` | 自定 | 登录密码(**必设**;登录时直接与该环境变量校验,未配置会报错) |
| `ENCRYPTION_KEY` | 64 位 hex | 敏感数据加密密钥,`openssl rand -hex 32` 生成;请固定并妥善保管 |

> 新平台支持 **Production / Development(Preview / 分支)** 独立上下文(各自独立的环境变量与数据库隔离)。建议两个上下文都添加(Preview 可换独立 Turso 库),勾选变量生效的上下文后保存。

## 部署方式

三种方式任选其一,最终产物一致(均以仓库内 `deno.json` 的 `deploy` 配置为准)。

### 方式一:Deno Deploy 控制台 Git 导入(推荐,零 YAML)

1. 打开 [console.deno.com](https://console.deno.com),创建 / 进入一个组织(组织名出现在 URL 路径中,如 `console.deno.com/<org>`)。**注意:组织名与 slug 创建后不可更改**。
2. 点击 **+ New App** → 选择本 GitHub 仓库(若仓库未出现,先授权 Deno Deploy GitHub App 访问该仓库)。
3. 构建配置:**仓库已内置 `deno.json` 的 `deploy` 配置**(dynamic 模式 + 入口 `deno/main.js`),**源码配置优先于控制台**,控制台无需手动填写;若创建页要求选择,选 **No Preset**、运行模式 **Dynamic**、入口 `deno/main.js`、Install / Build 命令留空。
4. 在 **Environment variables** 中添加前置准备里的 5 个变量(选择 Production 上下文;Secret 类勾选 Secret)。
5. 点击 **Create App** 开始首次构建,构建日志在控制台实时滚动(Prepare → Install → Build → Warm up → Route)。之后**每次 push 到 `main` 自动部署**(分支自动生成 Preview 部署);提交信息含 `[skip ci]` / `[skip deploy]` 可跳过本次部署。

> GitHub 集成的构建完全托管在 Deno Deploy(无需 GitHub Actions YAML);构建日志、回滚、日志与链路追踪都在控制台查看。

### 方式二:GitHub Actions

仓库已内置工作流 `.github/workflows/deploy-deno.yml`,在 GitHub 仓库 Settings → Secrets and variables → Actions 配置后即可用:

| GitHub Secret / Variable | 值 |
|---|---|
| `DENO_DEPLOY_TOKEN`(Secret) | Deno Deploy 访问令牌:console.deno.com → 账号 → **Access Tokens** → New Access Token(组织令牌亦可,均通过 `DENO_DEPLOY_TOKEN` 环境变量传给 CLI) |
| `DENO_DEPLOY_ORG`(Variable) | 组织名(console.deno.com 网址路径中的名称) |
| `DENO_DEPLOY_APP`(Variable) | 应用名(**必须先存在**:首次用方式一或方式三创建) |

工作流先用 `deno deploy switch` 把组织 / 应用写入 `deno.json`(CLI 发布要求 deploy 段含 `org` / `app`,见 FAQ),再执行 `deno deploy --org … --app … --prod`,并用 `--ignore` 排除本地敏感文件(`sqlite.db*` / `.env*` / `.dev.vars` / `server/.secret-key`)不上传;运行期环境变量仍在 Deno Deploy 应用里配置(不由 GitHub 管理)。

### 方式三:本地 deno deploy 命令

```bash
# 1. 安装 Deno(≥ 2.4.2,自带 deno deploy 子命令;旧 deployctl 已下线勿用)
curl -fsSL https://deno.land/install.sh | sh

# 2. 写入部署目标:CLI 发布前会解析 deno.json 的 deploy 段,要求其中已含 org / app
#   (否则报 "Failed to parse deploy configuration: missing field org"),先执行:
deno deploy switch --org lgf5481 --app html-template

# 3. 首次:创建应用 + 首次部署(会打开浏览器授权一次;完成后 deno.json 写入 deploy.org / deploy.app)
deno deploy create \
  --org lgf5481 --app html-template \
  --source local \
  --runtime-mode dynamic --entrypoint deno/main.js \
  --build-timeout 5 --build-memory-limit 1024 --region global

# 4. 配置环境变量(也可全程在控制台操作)
deno deploy env add DB_DRIVER turso
deno deploy env add DATABASE_URL "https://<db>-<org>.turso.io"
deno deploy env add DATABASE_AUTH_TOKEN "<令牌>" --secret
deno deploy env add AUTH_PASSWORD "<登录密码>" --secret
deno deploy env add ENCRYPTION_KEY "<64位hex>" --secret

# 5. 之后每次部署(排除本地敏感文件;--org/--app 可省略,deno.json 已记录)
deno deploy --org lgf5481 --app html-template --prod \
  --ignore sqlite.db --ignore sqlite.db-wal --ignore sqlite.db-shm \
  --ignore .env --ignore .env.local --ignore .dev.vars --ignore server/.secret-key
```

- `deno deploy`(不带 `--prod`)生成 **Preview 部署**(独立 URL,不影响生产,可先验证再发布);`--prod` 直接发布生产。
- 常用管理命令:`deno deploy switch --org <ORG> --app <APP>`(记住默认组织 / 应用)、`deno deploy env list` / `deno deploy env update-value <变量> <新值>`、`deno deploy logs`(流式查看日志)。
- 已在别处创建应用时,执行 `deno deploy switch --org <ORG> --app <APP>`(或直接在 `deno.json` 的 `deploy` 段写入 `org` / `app`)后即可 `deno deploy --prod`。

## 验证部署

1. 打开部署 URL → 出现**登录页**(说明入口 + 静态资源正常)。
2. 用 `AUTH_PASSWORD` 登录 → 进入仪表盘(说明 API + Turso 正常)。
3. 修改任意设置(如主题)→ 刷新后设置保留(说明数据已写入 Turso)。
4. (可选)想改密码:更新 `AUTH_PASSWORD` 环境变量后重新部署即可。

## 本地验证(不部署即可跑通全流程)

```bash
# 方式 A:本地 Node 服务器 + 真实 Turso(与线上同构;最快)
cp .env.example .env     # 填入 DB_DRIVER=turso / DATABASE_URL / DATABASE_AUTH_TOKEN / AUTH_PASSWORD / ENCRYPTION_KEY
node dev-server.js

# 方式 B:本地直接用 Deno 跑部署入口(行为与 Deno Deploy 一致;默认端口 8000)
DB_DRIVER=turso \
DATABASE_URL="https://<db>-<org>.turso.io" \
DATABASE_AUTH_TOKEN="<令牌>" \
AUTH_PASSWORD="<登录密码>" \
ENCRYPTION_KEY="<64位hex>" \
  deno run --allow-net --allow-read --allow-env deno/main.js
```

## 数据与安全

- **加密互通**:`ENCRYPTION_KEY` 与 Cloudflare / Vercel / 本地一致时,同一份数据可在各环境间迁移解密。
- **Turso 是共享远程库**:本地 `DB_DRIVER=turso` 与线上连的是同一个库,写设置会立即影响线上(反之亦然);想要隔离请为 Preview 环境创建独立 Turso 库。
- **部署包只含仓库文件**:`deno deploy` 上传本地目录(遵循 `.gitignore`),部署命令再以 `--ignore` 显式排除本地敏感文件(`sqlite.db*` / `.env*` / `.dev.vars` / `server/.secret-key`);`server/` 目录本身会随代码上传(它是 API 实现,必须上传)。
- 登录密码不落库(与 `AUTH_PASSWORD` 常量时间比较);会话令牌只存 SHA-256 哈希;敏感键值 AES-256-GCM 加密落库。

## 常见问题(FAQ)

**Q:部署后 `/` 或静态资源 404?**
A:dynamic 模式没有独立静态层,静态文件由入口 `deno/main.js` 自托管。确认 (1) 部署的是最新代码;(2) `index.html` / `js` / `assets` 在仓库根目录;(3) 构建配置的入口是 `deno/main.js`(仓库 `deno.json` 已内置,源码配置优先于控制台)。

**Q:CLI 发布时报 `Failed to parse "deploy" configuration: missing field org`?**
A:CLI 发布前会解析 `deno.json` 的 `deploy` 段,要求其中**已含 `org` / `app`**(命令行 `--org/--app` 参数不满足该解析)。在项目根目录执行 `deno deploy switch --org <ORG> --app <APP>` 把组织 / 应用写入 `deno.json`(幂等,应用已创建也可直接补写),再重新部署即可;或手动在 `deno.json` 的 `deploy` 段补上 `"org"` / `"app"` 两个字段。GitHub Actions 工作流已内置该 `switch` 步骤。

**Q:登录提示密码错误?**
A:密码始终取自 `AUTH_PASSWORD` 环境变量(常量时间比较),不落库、不生成随机密码。确认应用 Settings → Environment variables 里 `AUTH_PASSWORD` 已配置、生效上下文包含 **Production**,且与输入的密码一致;修改后**重新部署**(控制台 Deploy Default Branch 或重新 push)生效。

**Q:登录接口报「未配置 AUTH_PASSWORD 环境变量」?**
A:环境变量未配置或未应用到 Production 上下文;在控制台添加后重新部署即可。

**Q:接口报 `fetch failed` 或 `无法连接 …/v2/pipeline`?**
A:连不上 Turso。最常见原因是 `DATABASE_URL` 用了 `libsql://` 开头(驱动已自动归一化为 `https://`);若仍失败,检查 URL 拼写、`DATABASE_AUTH_TOKEN` 是否有效(无效会报 `HTTP 401` 而非 `fetch failed`)。

**Q:日志里出现 sqlite / `node:sqlite` 相关错误?**
A:Deno 运行时没有 `node:sqlite` 模块,`DB_DRIVER` **必须为 `turso`**。确认环境变量没有写成 `sqlite`(未设置时代码已默认 `turso`,无需担心)。

**Q:邮箱等敏感字段为空?**
A:`ENCRYPTION_KEY` 与写入时不一致(或未设置)。密钥必须固定、与其它环境一致。

**Q:GitHub Actions 首次执行失败,提示应用不存在 / not found?**
A:应用必须先存在。首次请用方式一(控制台 Git 导入)或方式三(`deno deploy create`)创建应用,并把 `DENO_DEPLOY_APP` 设为该应用名。

**Q:与 Vercel / Cloudflare 部署的关系?**
A:三套独立方案,任选其一即可;数据可通过同一 `ENCRYPTION_KEY` 互通。Vercel 见 [`vercel.md`](./vercel.md),Cloudflare 见 [`cloudflare.md`](./cloudflare.md)。

## 文件清单

| 文件 | 作用 |
|---|---|
| `deno/main.js` | Deno Deploy 入口(dynamic 模式:静态资源 + 全部 `/api/*`,经 `createRequire` 复用 `server/api.js`) |
| `deno.json` | `deploy` 配置(dynamic + 入口 `deno/main.js`,源码优先于控制台;`deploy.org` / `deploy.app` 由 `deno deploy switch` 或首次 CLI 部署自动写入) |
| `.github/workflows/deploy-deno.yml` | GitHub Actions 自动部署(方式二) |
| `docs/deploy/deno.md` | 本文档 |
