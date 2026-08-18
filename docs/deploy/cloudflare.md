# 部署到 Cloudflare(docs/deploy/cloudflare.md)

本文介绍如何把本模板完整部署到 Cloudflare。模板是**纯静态前端 + 可移植 Node 服务**,在 Cloudflare 上采用 **Workers + 静态资源(Assets)+ D1** 的架构:

```
浏览器
  │
  ├─ /            → 静态资源由 Cloudflare 边缘网络直接托管(index.html / js / assets)
  ├─ /assets/*    → 同上(字体、CSS、图标)
  └─ /api/*       → 进入 worker.js(登录 / 鉴权 / 设置 KV / D1 数据库)
```

- **静态资源**:由 `wrangler.toml` 的 `[assets]` 绑定托管,全球边缘网络分发,不经过 Worker。
- **API**:`worker.js` 处理 `/api/*`(登录、会话校验、登出、设置读写),逻辑与本地 `dev-server.js` 一致。
- **数据库**:Cloudflare D1(SQLite 兼容,免费额度充足);建表在首个请求时自动完成,无需手动执行 SQL。
- **密码与加密**:登录密码与 `AUTH_PASSWORD` secret 直接做常量时间比较(不落库、无随机初始密码、不支持应用内改密);敏感键值(邮箱等)仍为 AES-256-GCM 加密落库,格式与本地互通。

## 三种部署方式一览

| 方式 | 适用场景 | 自动化 | 章节 |
|---|---|---|---|
| GitHub Actions | 已有 GitHub 仓库,想要 push 即自动部署 | 全自动 | [方式一](#1-github-actions-自动部署推荐) |
| 控制台 Git 集成 | 不想配置 CI,在 Cloudflare 后台连仓库 | 全自动 | [方式二](#2-cloudflare-控制台-git-集成免-ci) |
| 本地 wrangler 命令 | 首次部署 / 手动发布 / 本地调试 | 手动 | [方式三](#3-本地-wrangler-命令) |

> 三种方式最终效果一致(同一个 Worker + 同一个 D1),可混合使用。建议先用方式三跑通,再启用 CI。

---

## 0. 前置准备(三种方式通用)

### 0.1 账号

- 注册 [Cloudflare](https://dash.cloudflare.com) 账号,**免费套餐即可**。
- 部署后访问地址为 `https://html-template.<你的子域>.workers.dev`(账号唯一的 `workers.dev` 子域)。
- 绑定自定义域名(可选):Workers & Pages → 你的 Worker → **Settings → Domains & Routes** → Add Custom Domain。

### 0.2 创建 D1 数据库

```bash
# 安装 / 登录 wrangler(无需全局安装,直接用 npx)
npx wrangler@latest login        # 浏览器弹窗授权
npx wrangler@latest d1 create html-template-db
```

输出会给出一段配置,把其中的 **`database_id`** 填入项目根目录 `wrangler.toml` 的 `[[d1_databases]]`(注意新版 wrangler 要求**数组形式**,写成 `[d1_databases]` 会报 `should be an array` 错误):

```toml
[[d1_databases]]
binding = "DB"
database_name = "html-template-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"   # ← 替换成你的 ID
```

> 也可以在控制台创建:Workers & Pages → **D1** → **Create database** → 复制 ID。表结构无需手动创建,Worker 首次请求会自动建表。
>
> **三种部署方式(GitHub Actions / 控制台 Git 集成 / wrangler 命令行)都依赖 `wrangler.toml` 中的 `database_id`**——它是 D1 绑定的唯一来源,`wrangler deploy`(无论由谁执行)都会读取它;不填或填错,任何方式的部署都会失败。此步只需做一次,之后三种方式通用。

### 0.3 生成加密密钥 ENCRYPTION_KEY

敏感数据(如 `settings:profile` 的邮箱)以 AES-256-GCM 加密落库,加密密钥必须固定并妥善保管——**丢失或更换将无法解密已加密数据**:

```bash
openssl rand -hex 32
# 或
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 0.4 设置两个必填 secret

Worker 运行在无文件系统环境,**首次部署前必须设置**:

| Secret | 作用 | 说明 |
|---|---|---|
| `AUTH_PASSWORD` | 登录密码(**必设**) | 登录时直接与 secret 比较;未设置时登录返回明确报错,绝不生成随机密码 |
| `ENCRYPTION_KEY` | 敏感数据加密密钥 | 0.3 生成的 64 位 hex |

设置方式(任选其一,与部署方式对应):

- **CLI**(方式三):`npx wrangler secret put AUTH_PASSWORD` / `ENCRYPTION_KEY`
- **GitHub Secrets**(方式一):仓库 Settings → Secrets and variables → Actions,部署时自动同步
- **控制台**(方式二):Worker → **Settings → Variables and Secrets → Add → Secret**

> 不要把 secret 写进 `wrangler.toml`(明文入库,且会随仓库泄露);本地调试用 `.dev.vars`(见 3.2)。

---

## 1. GitHub Actions 自动部署(推荐)

### 1.1 配置 GitHub Secrets

仓库 **Settings → Secrets and variables → Actions → New repository secret**,共 4 个:

| 名称 | 值 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | API Token(创建方式见下) |
| `CLOUDFLARE_ACCOUNT_ID` | 账号 ID(控制台首页右侧可查) |
| `AUTH_PASSWORD` | 首次登录管理员密码(自定义) |
| `ENCRYPTION_KEY` | 0.3 生成的 64 位 hex |

**API Token 创建**:控制台右上角头像 → **My Profile → API Tokens → Create Token** → 模板选 **Edit Cloudflare Workers**,确认权限包含:

- Account → **Workers Scripts → Edit**
- Account → **D1 → Edit**
- Account → **Account Settings → Read**

### 1.2 提交即部署

仓库已内置工作流 `.github/workflows/deploy-cloudflare.yml`:

- **触发**:push 到 `main` 分支,或 Actions 页面手动 `Run workflow`。
- **动作**:`cloudflare/wrangler-action@v4` 执行 `wrangler deploy`,并把 `AUTH_PASSWORD` / `ENCRYPTION_KEY` 同步为 Worker secret。
- **查看结果**:Actions 页面的部署日志会打印最终 URL。

> 首次运行前务必完成 0.2(把 `database_id` 填入 `wrangler.toml`),否则部署会因 D1 binding 无效而失败。

---

## 2. Cloudflare 控制台 Git 集成(免 CI)

Workers 支持直接连接 GitHub / GitLab 仓库,推送即自动构建部署,无需任何 CI 配置。

1. 控制台 → **Workers & Pages → Create → Workers → Import a repository**(首次需授权 Cloudflare 访问你的 GitHub / GitLab)。
2. 选择本仓库,按下面填写构建设置(之后可在项目 **Settings → Builds** 修改):
   - **构建命令(Build command)**:留空——本项目零构建步骤;若界面必填,填 `echo "no build step"`。
   - **部署命令(Deploy command)**:`npx wrangler deploy`——**必填,不能留空**(界面默认值就是它)。部署时 Cloudflare 会在仓库根目录执行该命令,自动读取 `wrangler.toml`,带上 `[assets]` 静态资源与 D1 binding。
   - **根目录(Root directory)**:留空(仓库根目录)。
   - **非生产分支部署命令**:保持默认 `npx wrangler versions upload`(非 `main` 分支生成预览版本,不占用生产路由)。
3. 首次部署前确认 `wrangler.toml` 中 `database_id` 已填好(0.2)——Git 集成同样读取它,缺了会部署失败。
4. 设置 secret:项目 **Settings → Variables and Secrets → Add → Secret**,添加 `AUTH_PASSWORD` 与 `ENCRYPTION_KEY`。
5. 之后每次 push 到 `main` 自动部署;构建状态会显示在 GitHub 的 commit / PR 上。

- 更换 / 解绑仓库:项目 **Settings → Builds → Git Repository → Manage**。
- 非 `main` 分支默认只生成 **preview 部署**(不占用生产路由),可在 Settings → Builds 调整。
- 其它 Git 托管(Bitbucket 等)?不支持——Git 集成目前仅支持 GitHub / GitLab;其它平台请用[方式一](#1-github-actions-自动部署推荐)的 GitHub Actions。

---

## 3. 本地 wrangler 命令

### 3.1 首次部署

```bash
npx wrangler@latest login                        # 浏览器授权
npx wrangler@latest d1 create html-template-db        # 并把 database_id 填入 wrangler.toml(0.2)
npx wrangler@latest secret put AUTH_PASSWORD     # 输入登录密码(与线上保持一致)
npx wrangler@latest secret put ENCRYPTION_KEY    # 输入 64 位 hex(0.3)
npx wrangler@latest deploy
```

部署完成输出 `https://html-template.<你的子域>.workers.dev`,打开后即可用 `AUTH_PASSWORD` 登录。

### 3.2 本地调试(wrangler dev)

```bash
cp .dev.vars.example .dev.vars     # 填上本地调试用的密码与密钥
npx wrangler@latest dev            # 本地模拟 Worker + 静态资源 + D1
```

- 本地 D1 数据存放在 `.wrangler/state`,与线上隔离。
- 数据库建表在首个请求时自动完成;首个请求可能稍慢(建表)。
- 想要重置本地数据库:删除 `.wrangler/state` 后重启 `wrangler dev`。

### 3.3 常用命令速查

```bash
npx wrangler deploy                                         # 发布
npx wrangler tail                                           # 查看线上实时日志
npx wrangler secret list / put <名称>                       # 管理 Worker secrets
npx wrangler d1 execute html-template-db --remote --command "SELECT * FROM app_settings"   # 查线上库
npx wrangler d1 execute html-template-db --local  --command "SELECT * FROM app_settings"   # 查本地库
npx wrangler dev                                            # 本地调试
```

---

## 4. 验证部署

部署后按顺序确认:

1. 打开部署 URL → 出现**登录页**(说明静态资源正常)。
2. 用 `AUTH_PASSWORD` 登录 → 进入仪表盘(说明 Worker + D1 正常)。
3. 修改任意设置(如主题)→ 刷新页面设置保留(说明设置已写入 D1)。
4. (可选)想改密码:更新 `AUTH_PASSWORD` secret 后重新部署即可(见[第 5 节](#5-登录与修改密码))。

---

## 5. 登录与修改密码

1. 打开部署 URL,输入 `AUTH_PASSWORD` 登录。
2. 密码由该 secret 统一管理,**应用内不支持修改**:改密 = 更新 `AUTH_PASSWORD` secret 后重新部署(旧的已签发会话会在过期 / 登出后自然失效)。
3. 未设置 `AUTH_PASSWORD` 时,登录接口返回明确报错(不会生成随机密码)。

---

## 6. 数据迁移:本地 SQLite → D1(可选)

如果本地 `sqlite.db` 已有数据,可按下面方式迁移到 D1:

**方式 A(推荐):本地 Node 服务器以 REST 模式直连 D1**

在 `.env` 中配置(模板见 `.env.example`):

```env
DB_DRIVER=d1
D1_ACCOUNT_ID=<账号 ID>
D1_DATABASE_ID=<D1 数据库 ID>
D1_API_TOKEN=<API Token,权限:D1 Read / D1 Write>
AUTH_PASSWORD=<与线上相同的登录密码>
ENCRYPTION_KEY=<与线上相同的密钥>
```

启动本地服务器,首次启动即通过 D1 REST API 自动建表:

```bash
node dev-server.js
```

> 需 Node ≥ 22.5(项目运行要求);REST 模式与 Worker 内 binding 模式共用同一套 SQL 与加密格式,数据互通。

**方式 B:wrangler 导入 SQL**

```bash
# 导出本地数据库(结构 + 数据)
sqlite3 sqlite.db ".dump" > dump.sql
# 手工清理不兼容语句(如 PRAGMA、BEGIN/COMMIT 事务边界),再导入
npx wrangler d1 execute html-template-db --remote --file=dump.sql
```

注意事项:

- **加密数据必须使用相同的 `ENCRYPTION_KEY`**,否则迁移后邮箱等敏感字段无法解密。
- 登录密码由 `AUTH_PASSWORD` 统一校验,本地与线上配置同一个值即可,不涉及密码哈希迁移。
- 迁移后建议用 `AUTH_PASSWORD` 登录一次验证读写正常。

---

## 7. 纯静态部署(可选,无鉴权 / 无数据库)

如果只需要展示模板、不需要登录与持久化,可把 `index.html` / `js` / `assets` 部署为纯静态站点:

```bash
# 先整理一个只含静态文件的目录(避免把 sqlite.db / .env 等传上去)
mkdir -p dist && cp -r index.html js assets dist/
npx wrangler pages deploy dist --project-name=html-template-static
```

或控制台 **Workers & Pages → Create → Pages → Upload assets / Connect to Git**。

> 静态模式没有鉴权与数据库:登录页会提示「需要服务器」,设置不会持久化——这是预期行为。

---

## 8. 常见问题(FAQ)

**Q:打开 URL 显示 404 / 样式加载不出来?**
A:检查 `.assetsignore` 是否误排除 `index.html` / `js` / `assets`;确认用的是仓库根目录部署(不要只上传 `server/`)。

**Q:登录提示密码错误 / 登录接口报「未配置 AUTH_PASSWORD」?**
A:密码始终取自 `AUTH_PASSWORD` secret(`wrangler secret list` 查看);未设置时登录会返回明确报错(不会生成随机密码)。改密 = 更新 secret 后重新部署,见[第 5 节](#5-登录与修改密码)。

**Q:部署报错 `binding "DB" not found` 或 `invalid database_id`?**
A:`wrangler.toml` 的 `database_id` 未填或填错。执行 `npx wrangler d1 create html-template-db`(或控制台 D1 页)获取正确 ID 后重新部署。

**Q:邮箱等敏感字段为空或读不出来?**
A:`ENCRYPTION_KEY` 与写入时不一致,或从未设置。密钥必须固定、与写入时一致,并妥善备份。

**Q:修改 `AUTH_PASSWORD` secret 后密码没变?**
A:登录密码始终取自 `AUTH_PASSWORD` secret:更新后**重新部署**即生效;旧会话会在过期 / 登出后失效(见[第 5 节](#5-登录与修改密码))。

**Q:免费套餐会不会触发 CPU 限制?**
A:登录仅做常量时间字符串比较,几乎不占 CPU;静态资源由边缘网络直接返回,不经过 Worker;日常 API 都是轻量查询,免费额度足够。

**Q:控制台 Git 集成时提示「部署命令不能留空」,填什么?**
A:填 `npx wrangler deploy`(界面默认值);构建命令留空即可(本项目零构建)。详见[第 2 节](#2-cloudflare-控制台-git-集成免-ci)。

**Q:想同时保留本地 dev-server.js 开发流程?**
A:完全可以。本地 `node dev-server.js`(sqlite)与 Cloudflare(Worker + D1)并行,两套入口逻辑一致;本地调试远程库用 `DB_DRIVER=d1`(第 6 节)。

---

## 9. 文件清单

| 文件 | 作用 |
|---|---|
| `wrangler.toml` | Worker 配置:入口、静态资源绑定、D1 binding |
| `worker.js` | Worker 入口:静态资源兜底 + `/api/*` 鉴权 API |
| `server/db-d1.js` | D1 适配器:Worker 内原生 binding / 本地 REST 两种模式 |
| `.assetsignore` | 静态资源排除清单(本地文件、文档、CI 不上传) |
| `.github/workflows/deploy-cloudflare.yml` | GitHub Actions 自动部署 |
| `.dev.vars.example` | `wrangler dev` 本地调试环境变量模板 |
| `docs/deploy/cloudflare.md` | 本文档 |

## 10. 安全提示

- **不要把真实密钥提交到仓库**:`AUTH_PASSWORD` / `ENCRYPTION_KEY` / API Token 一律走 secret 机制。
- `server/` 目录(含本地 `.secret-key` 兜底文件)已由 `.assetsignore` 排除,不会作为静态资源公开。
- 生产环境务必同时设置 `AUTH_PASSWORD` 与 `ENCRYPTION_KEY` 两个 secret;`ENCRYPTION_KEY` 请离线备份。
