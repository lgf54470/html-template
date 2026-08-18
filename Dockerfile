# ============================================================
# Dockerfile — 自托管部署(静态资源 + 鉴权 API + 本地 SQLite)
# ------------------------------------------------------------
# 基础镜像:debian:latest(本地已拉取;Debian 13 仓库自带的 nodejs ≥ 22.5,
# 含内置 node:sqlite 模块,满足本项目数据库驱动要求,无需任何第三方依赖)。
# 构建:docker build -t html-template .
# 运行与数据持久化见 docs/deploy/docker.md。
# ============================================================
FROM debian:latest

# 安装 Node.js(Debian 官方仓库;本项目零运行时依赖,无需 npm install)
RUN apt-get update \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

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
