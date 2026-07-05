# 部署说明

本文说明如何把 `fuxi-web-console` 部署到服务器，并兼容普通 Node 运行和 Docker Compose 运行。

## 推荐资源

如果只调用外部大模型 API，不在服务器上跑本地大模型：

```text
最低：1 核 CPU / 1 GB 内存 / 15 GB 硬盘
推荐：2 核 CPU / 2 GB 内存 / 30 GB SSD
多人访问或大量图片预览：2 核 CPU / 4 GB 内存 / 40 GB+ SSD
```

知识库图片较多时，部署过程需要同时存放压缩包和解压目录。建议预留 10GB 以上临时空间。

## 部署结构

推荐结构：

```text
/opt/fuxi/
  fuxi-web-console/
  ai-lib/
    knowledge-base/
```

网站容器或 Node 进程只读取 `knowledge-base`，不会修改它。默认读取目录：

```text
knowledge-base/wiki/imported-excel
knowledge-base/raw/excel-md-with-images
knowledge-base/raw/excel-images
knowledge-base/wiki/topics
knowledge-base/wiki/entities
```

## 普通 Node 部署

安装 Node.js 18+ 后：

```bash
cd /opt/fuxi/fuxi-web-console
cp .env.example .env.local
cp server/config/model.config.example.json server/config/model.config.local.json
```

编辑 `.env.local`：

```env
HOST=127.0.0.1
PORT=5177
KB_PROJECT_ROOT=/opt/fuxi/ai-lib
KB_ROOT=/opt/fuxi/ai-lib/knowledge-base
BASIC_AUTH=admin:change-this-password
```

如果只在内网测试，可以把 `BASIC_AUTH` 留空。公网部署建议开启。

编辑模型配置：

```bash
vi server/config/model.config.local.json
```

启动：

```bash
npm start
```

如果需要后台常驻，建议用 `systemd`、`pm2` 或者直接使用 Docker Compose。

## Docker Compose 部署

复制配置：

```bash
cd /opt/fuxi/fuxi-web-console
cp .env.docker.example .env
cp server/config/model.config.example.json server/config/model.config.local.json
```

编辑 `.env`：

```env
BIND_ADDR=0.0.0.0
PUBLIC_PORT=5177
KB_ROOT_HOST=/opt/fuxi/ai-lib/knowledge-base
BASIC_AUTH=admin:change-this-password
```

编辑模型配置：

```bash
vi server/config/model.config.local.json
```

启动：

```bash
docker compose up -d --build
```

旧版 Compose 使用：

```bash
docker-compose up -d --build
```

查看日志：

```bash
docker compose logs -f
```

旧版 Compose：

```bash
docker-compose logs -f
```

重启：

```bash
docker compose restart
```

如果修改了 `.env` 或 `docker-compose.yml`，建议重建容器：

```bash
docker compose up -d --build --force-recreate
```

旧版 Compose：

```bash
docker-compose up -d --build --force-recreate
```

## 健康检查

未开启 Basic Auth：

```bash
curl http://127.0.0.1:5177/api/health
curl http://127.0.0.1:5177/api/docs/tree | head -c 500
```

已开启 Basic Auth：

```bash
curl -u admin:change-this-password http://127.0.0.1:5177/api/health
curl -u admin:change-this-password http://127.0.0.1:5177/api/docs/tree | head -c 500
```

如果使用了 `head`，可能看到 `curl: (23) Failure writing output to destination`，这是管道提前关闭导致的，不代表服务异常。

## 反向代理

如果使用 Nginx、Caddy 或宝塔等反代，建议让服务只监听本机：

```env
BIND_ADDR=127.0.0.1
PUBLIC_PORT=5177
```

Nginx 示例：

```nginx
server {
    listen 80;
    server_name example.com;

    location / {
        proxy_pass http://127.0.0.1:5177;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Authorization $http_authorization;
    }
}
```

公网建议配置 HTTPS。

## 更新知识库

把新的 `knowledge-base` 同步到服务器后：

1. 如果只是新增或修改 Markdown、图片，直接在网页点击“刷新知识库”。
2. 如果替换了整个 `knowledge-base` 目录，保持宿主机路径不变后刷新网页。
3. 不需要重建 Docker 镜像。

## 限制

当前 Docker 镜像是轻量 Linux Node 镜像，不包含 Windows PowerShell 和 Excel COM 能力。

因此公网容器里建议只展示已经生成好的内容。Excel 导入、图片锚点生成、AI 整理流程仍建议在本地知识库工程里跑完，再同步生成结果到服务器。
