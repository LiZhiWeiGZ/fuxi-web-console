# fuxi-web-console

`fuxi-web-console` 是一个独立的知识库网页工作台，用来浏览本地 Markdown 知识库，并通过后端调用大模型完成问答。

项目本身不包含知识库内容，也不把知识库打进代码仓库。运行时通过 `KB_ROOT` 指向外部 `knowledge-base` 目录。

## 界面预览

以下截图已做模糊脱敏处理，仅展示布局与交互形态。

![文档浏览](document.png)

![专题页](theme.png)

![知识库问答](answer.png)

## 功能

- 文档浏览：展示整理版 Markdown 和原始带图 Markdown。
- 专题页：展示往回编织后的主题页、实体页。
- 问答：ChatGPT 风格界面，后端读取知识库并调用 OpenAI-compatible API。
- 本地历史：对话历史保存在当前浏览器 `localStorage`。
- 知识库刷新：知识库文件变化后，可在网页中刷新目录。
- 移动端适配：手机端使用抽屉式目录。

## 目录关系

推荐把网站和知识库作为两个独立目录放在同一级：

```text
fuxi/
  fuxi-web-console/
  ai-lib/
    knowledge-base/
```

网站默认读取：

```text
../ai-lib/knowledge-base
```

如果你的知识库放在其他位置，请修改 `.env.local` 或 Docker 的 `.env`。

## 知识库目录要求

默认配置会读取以下目录：

```text
knowledge-base/wiki/imported-excel
knowledge-base/raw/excel-md-with-images
knowledge-base/raw/excel-images
knowledge-base/wiki/topics
knowledge-base/wiki/entities
```

路径配置文件在：

```text
server/config/kb.paths.example.json
```

如果需要自定义路径，复制一份本地配置：

```bash
cp server/config/kb.paths.example.json server/config/kb.paths.local.json
```

`server/config/kb.paths.local.json` 已被 `.gitignore` 排除，不应提交到仓库。

## 普通 Node 安装

要求：

- Node.js 18+

启动步骤：

```bash
git clone https://github.com/LiZhiWeiGZ/fuxi-web-console.git
cd fuxi-web-console
cp .env.example .env.local
cp server/config/model.config.example.json server/config/model.config.local.json
```

编辑 `.env.local`：

```env
HOST=127.0.0.1
PORT=5177
KB_PROJECT_ROOT=../ai-lib
KB_ROOT=../ai-lib/knowledge-base
BASIC_AUTH=
```

编辑 `server/config/model.config.local.json`，填写大模型配置。

启动：

```bash
npm start
```

默认访问：

```text
http://127.0.0.1:5177
```

## Docker 安装

要求：

- Docker
- Docker Compose v2，或旧版 `docker-compose`

确认 Compose 命令：

```bash
docker compose version
# 如果上面不可用，再试：
docker-compose --version
```

推荐目录结构：

```text
/opt/fuxi/
  fuxi-web-console/
  ai-lib/
    knowledge-base/
```

其中 `knowledge-base` 是外部知识库目录，不属于本仓库。Docker 容器会把它只读挂载到：

```text
/data/ai-lib/knowledge-base
```

安装步骤：

```bash
mkdir -p /opt/fuxi
cd /opt/fuxi
git clone https://github.com/LiZhiWeiGZ/fuxi-web-console.git
cd fuxi-web-console
```

确认知识库目录存在：

```bash
ls -lah /opt/fuxi/ai-lib/knowledge-base
ls -lah /opt/fuxi/ai-lib/knowledge-base/wiki/imported-excel
```

复制配置文件：

```bash
cp .env.docker.example .env
cp server/config/model.config.example.json server/config/model.config.local.json
```

编辑 `.env`，至少确认 `KB_ROOT_HOST` 指向服务器上的知识库目录：

```env
BIND_ADDR=0.0.0.0
PUBLIC_PORT=5177
KB_ROOT_HOST=/opt/fuxi/ai-lib/knowledge-base
BASIC_AUTH=admin:change-this-password
```

编辑后端模型配置：

```bash
vi server/config/model.config.local.json
```

需要填写：

```json
{
  "defaultProvider": "openaiCompatible",
  "providers": {
    "openaiCompatible": {
      "baseUrl": "https://api.openai.com/v1",
      "apiKey": "YOUR_API_KEY_HERE",
      "model": "gpt-4.1-mini",
      "temperature": 0.2,
      "maxTokens": 4096,
      "stream": false,
      "timeoutMs": 60000
    }
  }
}
```

启动服务：

```bash
docker compose up -d --build
```

如果服务器是旧版 Compose：

```bash
docker-compose up -d --build
```

查看容器状态：

```bash
docker compose ps
```

查看日志：

```bash
docker compose logs -f
```

旧版 Compose 对应命令：

```bash
docker-compose ps
docker-compose logs -f
```

健康检查：

```bash
curl -u admin:change-this-password http://127.0.0.1:5177/api/health
```

如果 `BASIC_AUTH` 留空，则使用：

```bash
curl http://127.0.0.1:5177/api/health
```

浏览器访问：

```text
http://服务器IP:5177
```

如果修改了 `.env` 或 `docker-compose.yml`，建议重建容器：

```bash
docker compose up -d --build --force-recreate
```

旧版 Compose：

```bash
docker-compose up -d --build --force-recreate
```

## 常用命令

检查语法：

```bash
npm run check
```

健康检查：

```bash
curl http://127.0.0.1:5177/api/health
```

如果开启了 Basic Auth：

```bash
curl -u admin:change-this-password http://127.0.0.1:5177/api/health
```
