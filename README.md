# fuxi-web-console

`fuxi-web-console` 是一个独立的知识库网页工作台，用来浏览本地 Markdown 知识库，并通过后端调用大模型完成问答。

项目本身不包含知识库内容。运行时通过实例配置里的 `kbRoot` 指向外部 `knowledge-base` 目录。

## 界面预览

![文档浏览](./docs/images/document.png)

![专题页](./docs/images/theme.png)

![知识库问答](./docs/images/answer.png)

## 功能

- 文档浏览：展示整理版 Markdown 和原始带图 Markdown。
- 专题页：展示往回编织后的主题页、实体页。
- 问答：ChatGPT 风格界面，后端读取知识库并调用 OpenAI-compatible API。
- 本地历史：对话历史保存在当前浏览器 `localStorage`。
- 知识库刷新：知识库文件变化后，可在网页中刷新目录。
- 移动端适配：手机端使用抽屉式目录。

## 项目结构

```text
fuxi-web-console/
  public/
    index.html
    styles.css
    app.js
  server/
    server.mjs
    start-all.mjs
    config/
      instances/
        fuxi.example.json
      kb.paths.example.json
      model.config.example.json
  docs/
    images/
      document.png
      theme.png
      answer.png
  logs/
  README.md
  ROADMAP.md
  AGENTS.md
```

`public/` 是前端静态页面；`server/server.mjs` 是后端服务，负责读取知识库、提供 API、鉴权和调用大模型。

## 目录关系

推荐把网站和知识库作为两个独立目录放在同一级：

```text
fuxi/
  fuxi-web-console/
  sgsg_knowledge_base/
    knowledge-base/
      raw/
      wiki/
```

网站默认读取：

```text
../sgsg_knowledge_base/knowledge-base
```

如果知识库放在其他位置，请修改 `server/config/instances/*.local.json`。相对路径按 `fuxi-web-console/` 项目根目录解析。

## 知识库目录要求

网页默认读取以下内容：

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

如果需要自定义路径，可以复制一份本地配置：

```bash
cp server/config/kb.paths.example.json server/config/kb.paths.local.json
```

`kb.paths.example.json` 是标准 JSON，不带注释。README 中的示例是带注释的说明片段，实际配置请以 `server/config/kb.paths.example.json` 为准。

配置示例：

```jsonc
{
  "kbRoot": "", // 知识库根目录。留空时使用实例配置里的 kbRoot。
  "navigation": {
    "label": "文档",
    "primaryTab": "arranged", // 文档页默认打开的页签，需要对应 tabs[].key。
    "titleFrom": ["frontmatter.title", "h1", "filename"], // 标题提取顺序。
    // ...
  },
  "tabs": [
    {
      "key": "arranged",
      "label": "整理版",
      "path": "wiki/imported-excel", // 文档页页签读取的目录，路径相对于 KB_ROOT。
      // ...
    },
    {
      "key": "imageMd",
      "label": "原始文件",
      "path": "raw/excel-md-with-images",
      // ...
    }
  ],
  "woven": {
    "label": "专题",
    "groups": [
      {
        "key": "topics",
        "label": "主题页",
        "path": "wiki/topics", // 专题页分组读取的目录，路径相对于 KB_ROOT。
        // ...
      },
      {
        "key": "entities",
        "label": "实体页",
        "path": "wiki/entities",
        // ...
      }
    ]
  },
  "assets": {
    "imageRoot": "raw/excel-images" // 原始文件 Markdown 中图片资源的根目录，路径相对于 KB_ROOT。
  }
}
```

## 普通 Node 安装

要求：

- Node.js 18+
- 如需网页内重新生成 Excel 预览或图片版 Markdown，需要安装 PowerShell 7+，命令为 `pwsh`。

启动步骤：

```bash
git clone https://github.com/LiZhiWeiGZ/fuxi-web-console.git
cd fuxi-web-console
mkdir -p server/config/instances
cp server/config/instances/fuxi.example.json server/config/instances/fuxi-5177.local.json
cp server/config/instances/fuxi.example.json server/config/instances/fuxi-5178.local.json
cp server/config/kb.paths.example.json server/config/kb.paths.local.json
cp server/config/model.config.example.json server/config/model.config.local.json
```

编辑 `server/config/instances/fuxi-5177.local.json`：

```json
{
  "name": "fuxi",
  "host": "127.0.0.1",
  "port": 5177,
  "kbProjectRoot": "../sgsg_knowledge_base",
  "kbRoot": "../sgsg_knowledge_base/knowledge-base",
  "kbPathsConfig": "server/config/kb.paths.local.json",
  "modelConfig": "server/config/model.config.local.json",
  "basicAuth": ""
}
```

再编辑 `server/config/instances/fuxi-5178.local.json`，保持其他字段一致，只把 `port` 改成 `5178`。

编辑 `server/config/model.config.local.json`，填写大模型配置。

配置文件说明：

- `server/config/instances/*.local.json`：每个 Web 实例的监听地址、端口、知识库根目录、路径映射、模型配置和 Basic Auth。
- `server/config/model.config.local.json`：大模型 `baseUrl`、`apiKey`、模型名和生成参数。
- `server/config/kb.paths.local.json`：知识库目录映射；不配置时使用 `server/config/kb.paths.example.json`。
- `powershellBin`：可选。Unix/Linux/macOS 默认使用 `pwsh`，Windows 默认使用 `powershell`。
- `.env.local`：旧版兼容配置，仍可读取；新配置推荐统一放在 `server/config/` 下。

启动单个实例：

```bash
npm start -- --config server/config/instances/fuxi-5177.local.json
```

`npm start` 是前台运行。终端关闭后，服务也会停止。

同时启动多个实例：

```bash
npm run start:all
```

`npm run start:all` 默认读取 `server/config/instances/*.local.json`。每个 `.local.json` 应使用不同的 `port`，例如：

```text
server/config/instances/fuxi-5177.local.json  -> http://127.0.0.1:5177
server/config/instances/fuxi-5178.local.json  -> http://127.0.0.1:5178
```

Linux/macOS 后台运行：

```bash
mkdir -p logs
nohup npm start -- --config server/config/instances/fuxi-5177.local.json > logs/fuxi-web-console.log 2>&1 &
```

默认访问：

```text
http://127.0.0.1:5177
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
