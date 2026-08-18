# ============================================================
# Dockerfile — 自托管部署(静态资源 + 鉴权 API + 本地 SQLite)
# ------------------------------------------------------------
# 基础镜像:debian:latest(本地已拉取,构建无需再拉取基础镜像)。
# Node.js:Debian 仓库自带的 nodejs 版本过低(< 22.5,不含内置 node:sqlite),
#         故从 nodejs.org 官方下载固定版本 Node 22 LTS tarball(可复现,
#         下载后做 SHA-256 校验,并在构建期验证 node:sqlite 可用)。
# 构建:docker build -t html-template .
# 运行与数据持久化见 docs/deploy/docker.md。
# ============================================================
FROM debian:latest

# Node.js 22 LTS 版本(官方 tarball;升级时改这里或用 --build-arg NODE_VERSION=xx.yy.z)
ARG NODE_VERSION=22.23.2

RUN set -eu; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates curl xz-utils; \
    curl -fsSLO "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz"; \
    curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt" \
      | grep "node-v${NODE_VERSION}-linux-x64.tar.xz$" > SHASUMS256.txt; \
    sha256sum -c SHASUMS256.txt; \
    tar -xJf "node-v${NODE_VERSION}-linux-x64.tar.xz" -C /usr/local --strip-components=1; \
    rm -f "node-v${NODE_VERSION}-linux-x64.tar.xz" SHASUMS256.txt; \
    node -v; \
    node -e "require('node:sqlite'); console.log('node:sqlite OK')"; \
    rm -rf /var/lib/apt/lists/*

# 工作目录即静态资源根目录(dev-server.js 以 cwd 为根,index.html / js / assets 在此)
WORKDIR /app

# 复制应用(排除项见 .dockerignore:本地数据库 / 环境变量 / CI / 文档均不入镜像)
COPY . .

# 非 root 运行(最小权限;数据卷挂载点见 compose)
RUN useradd -r -u 1001 appuser \
    && chown -R appuser:appuser /app
USER appuser

ENV PORT=3000
ENV DB_DRIVER=sqlite
EXPOSE 3000

# 健康检查:探测未鉴权接口,进程存活即视为健康
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/auth/verify').then(r=>process.exit(r.status===401||r.status===200?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dev-server.js"]
