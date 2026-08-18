# 部署到 Docker 自托管(docs/deploy/docker.md)

本文介绍如何把本模板打包为 **Docker 镜像**并部署到任意服务器(自托管),数据库使用**容器内本地 SQLite**(数据卷持久化;亦可 `DB_DRIVER=turso` 连远程库)。架构:

```
浏览器
  │
  ├─ / 与 /js /assets  → dev-server.js 直接读取镜像内静态文件返回
  └─ /api/*            → 同一进程内的 API 处理器(server/api/)
                              │
                              └─ SQLite(sqlite.db,挂载于数据卷 /app/data)
```

- **零依赖镜像**:项目无任何 npm 运行时依赖,基础镜像 `debian:latest` + 官方 **Node.js 22 LTS**(nodejs.org 固定版本 tarball,含 SHA-256 校验;Debian 仓库自带的 nodejs 版本过低,不含内置 `node:sqlite`),无需 `npm install`、无需构建步骤。
- **与本地完全同构**:镜像内跑的就是根目录 `dev-server.js`(静态托管 + 登录 / 校验 / 登出 / 设置 KV),行为与 `node dev-server.js` 一致。
- **非 root 运行**:镜像内以 `appuser`(UID 1001)运行,数据卷目录需可写。

## 前置准备

1. 服务器安装 **Docker**(含 Compose 插件;`docker compose version` 可验证)。
2. 本地/服务器已有 **`debian:latest`** 基础镜像(`docker pull debian:latest` 或 `docker images` 确认),构建时无需再从网络拉取基础镜像。
3. 准备两个必设/强烈建议的变量(见下方环境变量表):
   - `AUTH_PASSWORD`:登录密码(**必设**;未配置时登录接口直接报错,绝不生成随机密码)
   - `ENCRYPTION_KEY`:敏感数据加密密钥,`openssl rand -hex 32` 生成(**生产必设**,理由见「数据持久化与安全」)

## 构建镜像

```bash
cd <项目根目录>
docker build -t html-template .
```

- 构建上下文排除项见 `.dockerignore`(本地数据库 / `.env*` / CI / 其它平台代码 / 文档均不入镜像)。
- 镜像内 Node 版本 = 固定版 **Node 22 LTS**(`Dockerfile` 的 `ARG NODE_VERSION`,默认 22.23.2;构建时已自动验证 `node:sqlite` 可用),可用 `docker run --rm html-template node -v` 确认。升级 Node:`docker build --build-arg NODE_VERSION=xx.yy.z -t html-template .` 或直接改 `Dockerfile` 里的默认值。
- 想改端口:镜像内默认 `PORT=3000`,运行时用 `-e PORT=xxxx` 覆盖即可。

## 发布到 GitHub Container Registry(GHCR)

仓库内置工作流 `.github/workflows/publish-docker-ghcr.yml`,**push `v*` 标签**(如 `git tag v1.0.0 && git push --tags`)或手动触发时,自动构建镜像并推送到 **GHCR**:**`ghcr.io/<owner>/<repo>`**(GitHub 仓库 Settings → Packages 可看到,无需额外配置 Secret,用仓库自带的 `GITHUB_TOKEN`)。

- 打 `v1.2.3` 标签 → 标签 `1.2.3` / `1.2` / `1` / `latest` + `sha-<commit>`(语义化版本)
- `workflow_dispatch` 手动触发 → 按当前分支名打标签 + `sha-<commit>`,方便发布前自行验证

发布后任何服务器拉取即可运行:

```bash
docker pull ghcr.io/<owner>/<repo>:main
docker run -d --name html-template --restart unless-stopped \
  -p 3000:3000 \
  -e AUTH_PASSWORD=你的登录密码 \
  -e ENCRYPTION_KEY=$(openssl rand -hex 32) \
  -e SQLITE_PATH=/app/data/sqlite.db \
  -v html-data:/app/data \
  ghcr.io/<owner>/<repo>:main
```

## 运行

### 方式一:docker compose(推荐)

```bash
# 首次:构建 + 启动(数据卷 html-data 自动创建)
AUTH_PASSWORD=你的登录密码 ENCRYPTION_KEY=$(openssl rand -hex 32) docker compose up -d --build

# 查看日志 / 停止 / 卸载(卷保留)
docker compose logs -f
docker compose down
```

`docker-compose.yml` 已内置:端口映射(`${PORT:-3000}:3000`)、环境变量、数据卷 `/app/data`(sqlite 落在 `/app/data/sqlite.db`)、`restart: unless-stopped`、健康检查。未设 `AUTH_PASSWORD` 时 compose 直接报错提示,不会带默认密码启动。

### 方式二:docker run(单容器)

```bash
docker run -d --name html-template --restart unless-stopped \
  -p 3000:3000 \
  -e AUTH_PASSWORD=你的登录密码 \
  -e ENCRYPTION_KEY=$(openssl rand -hex 32) \
  -e SQLITE_PATH=/app/data/sqlite.db \
  -v html-data:/app/data \
  html-template
```

## 环境变量

| 变量                                   | 值                    | 说明                                                                             |
| -------------------------------------- | --------------------- | -------------------------------------------------------------------------------- |
| `AUTH_PASSWORD`                        | 自定                  | 登录密码(**必设**;登录时与该环境变量常量时间比较,不落库、无随机初始密码)         |
| `ENCRYPTION_KEY`                       | 64 位 hex             | 敏感数据加密密钥,`openssl rand -hex 32` 生成;**生产必设**(见下方安全说明)        |
| `DB_DRIVER`                            | `sqlite`(默认)        | 本地 SQLite;设 `turso` + `DATABASE_URL` / `DATABASE_AUTH_TOKEN` 可改用远程 Turso |
| `SQLITE_PATH`                          | `/app/data/sqlite.db` | 本地 sqlite 文件位置(compose 已默认指向数据卷)                                   |
| `PORT`                                 | `3000`                | HTTP 端口(compose 已默认映射)                                                    |
| `DATABASE_URL` / `DATABASE_AUTH_TOKEN` | —                     | 仅 `DB_DRIVER=turso` 时需要                                                      |

> 也可以复用项目根目录 `.env`(compose 的 `env_file` 已配置为可选加载;进程环境变量优先,`.env` 只补充缺失项)。

## 数据持久化与安全

- **数据库**:sqlite 文件默认写入 `sqlite.db`(工作目录);compose / run 示例把 `SQLITE_PATH` 指向数据卷 `/app/data/sqlite.db`,**容器重建、升级镜像都不丢数据**。数据卷删除(`docker compose down -v` 或 `docker volume rm`)才会清空。
- **加密密钥**:`ENCRYPTION_KEY` 未设置时,`server/security/index.js` 会自动生成密钥并写入镜像内 `server/.secret-key` —— 容器重建后该文件消失,已加密数据(邮箱等敏感键)**将无法解密**。因此生产环境**必须显式设置 `ENCRYPTION_KEY` 并妥善保管**;与 Cloudflare / Vercel / Deno 部署使用同一密钥时,数据可互通迁移。
- **会话与密码**:登录密码不落库(与 `AUTH_PASSWORD` 常量时间比较);会话令牌只存 SHA-256 哈希。
- **镜像最小权限**:`USER appuser` 非 root 运行;如需在数据卷内建目录,确保宿主目录属主为 UID 1001 或容器内可写。

## 验证部署

```bash
# 1. 容器健康
docker compose ps                 # STATUS 应为 Up (healthy)
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/   # 200:静态页正常

# 2. 登录 → 取 token
curl -s -X POST http://127.0.0.1:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"password":"你的登录密码","expiry":"24h"}'
# → {"token":"...","expiresAt":"...","expiry":"24h"}

# 3. 写设置(用上一步的 token)
curl -s -X PUT http://127.0.0.1:3000/api/settings \
  -H "x-auth-token: <token>" -H 'Content-Type: application/json' \
  -d '{"settings":{"settings:appearance":"{\"theme\":\"dark\"}"}}'
# → {"ok":true,"written":1}

# 4. 重启容器后数据仍在(数据卷持久化)
docker compose restart
curl -s http://127.0.0.1:3000/api/settings -H "x-auth-token: <token>"
```

## 升级 / 更新

```bash
# 自建镜像
cd <项目根目录>
git pull                                    # 拉到新代码
docker compose up -d --build                # 重新构建并滚动重建(数据卷不动,数据保留)

# 或用 GHCR 已发布镜像
docker compose pull && docker compose up -d # 需先把 compose 的 build 换成 image: ghcr.io/<owner>/<repo>:main
```

## 常见问题(FAQ)

**Q:启动报 `Error: Cannot find module 'node:sqlite'`?**
A:镜像内 Node 版本过低(< 22.5)。`docker run --rm html-template node -v` 检查;本镜像默认内置 Node 22 LTS,若你用 `--build-arg NODE_VERSION=…` 自定义过版本,请确保 ≥ 22.5 并重新构建。

**Q:重启容器后设置丢失?**
A:数据库没落数据卷。确认 `SQLITE_PATH=/app/data/sqlite.db` 且 `html-data:/app/data` 挂载存在(compose 已内置);`docker compose down -v` 才会真正清空。

**Q:重启后邮箱等敏感字段为空?**
A:`ENCRYPTION_KEY` 与写入时不一致(或从未设置、依赖镜像内自动生成的 `server/.secret-key`)。生产环境必须显式设置并固定 `ENCRYPTION_KEY`。

**Q:登录提示密码错误 / 未配置 AUTH_PASSWORD?**
A:密码始终取自 `AUTH_PASSWORD` 环境变量。确认启动命令里已传入且拼写一致;compose 未设该变量会直接报错退出。

**Q:数据卷目录权限问题(容器无法写 sqlite.db)?**
A:镜像以 UID 1001(`appuser`)运行。绑定宿主目录时请 `chown -R 1001:1001 <目录>`(或改用命名卷 `html-data`,无需关心属主)。

**Q:与 Cloudflare / Vercel / Deno 部署的关系?**
A:四套独立方案,任选其一;数据可通过同一 `ENCRYPTION_KEY` 互通。Cloudflare 见 [`cloudflare.md`](./cloudflare.md),Vercel 见 [`vercel.md`](./vercel.md),Deno 见 [`deno.md`](./deno.md)。

## 文件清单

| 文件                                        | 作用                                                                                |
| ------------------------------------------- | ----------------------------------------------------------------------------------- |
| `Dockerfile`                                | 镜像构建(基础镜像 `debian:latest` + 官方 Node 22 LTS tarball;非 root 运行;健康检查) |
| `.dockerignore`                             | 构建上下文排除(本地数据库 / `.env*` / CI / 其它平台代码 / 文档)                     |
| `docker-compose.yml`                        | 一键启动:端口 / 环境变量 / 数据卷 / 自动重启                                        |
| `.github/workflows/publish-docker-ghcr.yml` | GitHub Actions:自动构建并发布镜像到 GHCR                                            |
| `docs/deploy/docker.md`                     | 本文档                                                                              |
