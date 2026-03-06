# Gamma GUI v3 — 部署文档

## 部署方式概览

| 方式 | 适用场景 |
|------|----------|
| [Alpine Linux 裸机部署](#alpine-linux-部署) | 轻量服务器、容器内 |
| [Docker 部署（Alpine 镜像）](#docker-部署alpine-镜像) | 容器化环境、一键启动 |
| [Nginx 反向代理](#nginx-反向代理) | 生产环境，统一入口 / HTTPS |

---

## Alpine Linux 部署

### 1. 系统准备

```sh
# 更新包索引
apk update && apk upgrade

# 安装运行时依赖
# Node.js 20 LTS + npm
apk add --no-cache nodejs-current npm
apk add --no-cache ca-certificates
apk add --no-cache bash git

# 验证版本
node -v   # 应 >= 20.x
npm -v    # 应 >= 9.x
```

> **注意**：`@anthropic-ai/claude-agent-sdk` 内部会以子进程方式调用 Claude Code CLI，
> 它依赖若干 glibc 兼容层。Alpine 默认使用 musl libc，需额外安装：

```sh
apk add --no-cache libc6-compat gcompat libstdc++
```

如果 SDK 仍报 `not found` 或 `exec format error`，可改用 Debian/Ubuntu 基础镜像，
或在 Alpine 上通过 Docker multi-stage build 解决（见下文）。

### 2. 部署应用

#### 方式 A：Mac 上构建，上传产物到 Alpine（推荐）

`node_modules` 中包含平台相关的原生二进制（如 `@next/swc-darwin-arm64`、`claude-agent-sdk` CLI），
**不能**直接将 Mac 的 `node_modules/` 上传到 Alpine。正确做法是只上传构建产物，在 Alpine 上重新安装依赖。

```sh
# ── Mac 开发机 ───────────────────────────────────────
npm install
npm run build

# 打包上传到服务器（排除 node_modules）
# rsync -av --exclude='node_modules' --exclude='.env.local' \
#   .next/ public/ package.json package-lock.json \
#   user@server:/opt/gamma/

# 或用 scp
scp -r .next package.json package-lock.json root@10.2.113.98:/opt/gamma/
scp -r .next root@10.2.113.98:/opt/gamma/
```

```sh
# ── Alpine 服务器 ────────────────────────────────────
cd /opt/gamma

# 在 Alpine 上重新安装依赖（会下载 Alpine 兼容的原生二进制）
npm ci --omit=dev

# 创建环境变量文件
cat > .env.local <<'EOF'
ANTHROPIC_AUTH_TOKEN=your-api-key-here
ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic
ANTHROPIC_MODEL=deepseek-chat
ANTHROPIC_DEFAULT_HAIKU_MODEL=deepseek-chat
ANTHROPIC_DEFAULT_SONNET_MODEL=deepseek-chat
EOF

chmod 600 .env.local

# 启动（默认监听 3000 端口）
node_modules/.bin/next start -p 3000
```

> **原理**：`.next/` 目录是纯 JS/CSS，与平台无关，可以直接复用。
> `npm ci --omit=dev` 会在 Alpine 上下载适配 musl/x86_64 的原生模块。

#### 方式 B：服务器上直接构建

```sh
cd /opt/gamma
npm ci --omit=dev   # 仅安装生产依赖

# 如果需要 devDependencies（Tailwind PostCSS 构建时需要）
npm install
npm run build
npm run start
```

### 3. 后台运行（进程守护）

Alpine 使用 **OpenRC** 而非 systemd。推荐使用 `s6-overlay` 或直接写 OpenRC service。

#### 使用 pm2（最简单）

```sh
npm install -g pm2

cd /opt/gamma
pm2 start node_modules/.bin/next --name gamma -- start -p 3000
pm2 save
pm2 startup openrc   # 生成开机自启脚本，按提示执行输出的命令
```

#### 使用 OpenRC service

```sh
# 创建 service 脚本
cat > /etc/init.d/gamma <<'EOF'
#!/sbin/openrc-run

name="gamma-gui"
description="Gamma xray Plugin AI Assistant"
command="/usr/bin/node"
command_args="/opt/gamma/node_modules/.bin/next start -p 3000"
directory="/opt/gamma"
pidfile="/run/${RC_SVCNAME}.pid"
command_background=true
output_log="/var/log/gamma.log"
error_log="/var/log/gamma-err.log"

depend() {
    need net
}
EOF

chmod +x /etc/init.d/gamma

# 启动并设置开机自启
rc-service gamma start
rc-update add gamma default

# 查看运行状态
rc-service gamma status
tail -f /var/log/gamma.log
```

### 4. 防火墙

```sh
# 如果使用 iptables（Alpine 默认不开启防火墙，视情况配置）
apk add --no-cache iptables
iptables -A INPUT -p tcp --dport 3000 -j ACCEPT

# 如果配合 Nginx 反向代理，只需开放 80/443
iptables -A INPUT -p tcp --dport 80 -j ACCEPT
iptables -A INPUT -p tcp --dport 443 -j ACCEPT
```

---

## Docker 部署（Alpine 镜像）

在项目根目录创建 `Dockerfile`：

```dockerfile
# ── Stage 1: 构建 ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

# 安装构建时 glibc 兼容层（claude-agent-sdk 需要）
RUN apk add --no-cache libc6-compat gcompat

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# 构建时不需要 .env.local，环境变量运行时注入
RUN npm run build

# ── Stage 2: 运行 ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

RUN apk add --no-cache libc6-compat gcompat libstdc++

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# 只复制运行时必要文件
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
```

> **注意**：standalone 输出模式需在 `next.config.mjs` 中开启：
> ```js
> const nextConfig = { output: 'standalone' };
> export default nextConfig;
> ```

构建并运行：

```sh
# 构建镜像
docker build -t gamma-gui:latest .

# 运行容器（通过 -e 注入环境变量，不要把 .env.local 打进镜像）
docker run -d \
  --name gamma \
  -p 3000:3000 \
  -e ANTHROPIC_AUTH_TOKEN=your-api-key \
  -e ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic \
  -e ANTHROPIC_MODEL=deepseek-chat \
  -e ANTHROPIC_DEFAULT_HAIKU_MODEL=deepseek-chat \
  -e ANTHROPIC_DEFAULT_SONNET_MODEL=deepseek-chat \
  --restart unless-stopped \
  gamma-gui:latest
```

或使用 `docker-compose.yml`：

```yaml
version: "3.9"
services:
  gamma:
    image: gamma-gui:latest
    build: .
    ports:
      - "3000:3000"
    environment:
      - ANTHROPIC_AUTH_TOKEN=${ANTHROPIC_AUTH_TOKEN}
      - ANTHROPIC_BASE_URL=${ANTHROPIC_BASE_URL}
      - ANTHROPIC_MODEL=${ANTHROPIC_MODEL}
      - ANTHROPIC_DEFAULT_HAIKU_MODEL=${ANTHROPIC_MODEL}
      - ANTHROPIC_DEFAULT_SONNET_MODEL=${ANTHROPIC_MODEL}
    restart: unless-stopped
```

```sh
# 使用 .env 文件注入（不要命名为 .env.local，docker-compose 读取 .env）
cp .env.local.example .env
# 编辑 .env 填入真实值

docker compose up -d
docker compose logs -f
```

---

## Nginx 反向代理

### 安装 Nginx

```sh
apk add --no-cache nginx
```

### 配置反向代理（HTTP）

```sh
cat > /etc/nginx/http.d/gamma.conf <<'EOF'
server {
    listen 80;
    server_name your-domain.com;   # 改为你的域名或 IP

    # SSE 长连接必须关闭缓冲
    proxy_buffering          off;
    proxy_cache              off;
    proxy_read_timeout       300s;
    proxy_connect_timeout    10s;
    proxy_send_timeout       60s;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
}
EOF

# 测试配置
nginx -t

# 启动 Nginx
rc-service nginx start
rc-update add nginx default
```

> 关键：`proxy_buffering off` 和 `proxy_read_timeout 300s` 是 SSE 流式响应正常工作的必要配置，
> 缺少则会导致 AI 回复出现长时间空白或连接超时。

### 配置 HTTPS（Let's Encrypt + certbot）

```sh
apk add --no-cache certbot certbot-nginx

# 申请证书（替换域名和邮箱）
certbot --nginx -d your-domain.com --email you@example.com --agree-tos --non-interactive

# certbot 会自动修改 nginx 配置并添加 SSL 块
# 查看自动续期 cron
cat /etc/periodic/daily/certbot
```

---

## 环境变量注入方式对比

| 方式 | 安全性 | 适合场景 |
|------|--------|----------|
| `.env.local` 文件 | ⚠️ 需注意文件权限（600） | 裸机单机部署 |
| `docker run -e` | ✅ 不写入镜像 | 容器临时运行 |
| `docker compose` + host `.env` | ✅ 与代码仓库分离 | compose 标准做法 |
| Kubernetes Secret | ✅✅ | K8s 集群 |

无论哪种方式，**绝对不要将真实 API Key 提交到 git 仓库**。`.env.local` 已在 `.gitignore` 中排除。

---

## 健康检查

```sh
# 检查 Next.js 是否正常响应
curl -f http://localhost:3000/api/chat
# 期望返回：{"ok":true,"model":"deepseek-chat"} 或 {"ok":false,"model":null}

# 检查 API Key 是否配置
curl http://localhost:3000/api/chat | python3 -m json.tool
```

---

## 常见问题

### `exec format error` / `not found` 启动失败

**原因**：`@anthropic-ai/claude-agent-sdk` 包含预编译的二进制（Claude Code CLI），Alpine musl libc 无法直接执行 glibc 动态链接的二进制。

**解决**：
```sh
# 安装 glibc 兼容层
apk add --no-cache libc6-compat gcompat libstdc++

# 若仍失败，切换到 node:20-debian 基础镜像
```

### SSE 流没有内容 / 消息截断

**原因**：反向代理缓冲了 SSE 响应。

**解决**：确认 Nginx 配置中包含：
```nginx
proxy_buffering off;
proxy_read_timeout 300s;
```

### 内存不足

Next.js 生产模式内存占用约 300–500 MB，Alpine 最低配置建议 512 MB RAM，推荐 1 GB 以上。

```sh
# 查看内存使用
free -m
ps aux | grep node
```

### 端口 3000 已被占用

```sh
# 查看端口占用
netstat -tlnp | grep 3000  # 或: ss -tlnp | grep 3000

# 修改 Next.js 监听端口
next start -p 4000
# 同步修改 Nginx proxy_pass 端口
```
