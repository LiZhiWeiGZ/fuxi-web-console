# fuxi-web-console

`fuxi-web-console` 是一个独立的知识库网页工作台，用来浏览本地 Markdown 知识库，并通过后端调用大模型完成问答。

项目本身不包含知识库内容。运行时通过 `KB_ROOT` 指向外部 `knowledge-base` 目录。

## 界面预览

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
      raw/
      wiki/
```

网站默认读取：

```text
../ai-lib/knowledge-base
```

如果知识库放在其他位置，请修改 `.env.local`。

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

配置示例：

```jsonc
{
  "kbRoot": "", // 知识库根目录。留空时使用 .env.local 里的 KB_ROOT。
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

`npm start` 是前台运行。终端关闭后，服务也会停止。

Linux/macOS 后台运行：

```bash
mkdir -p logs
nohup npm start > logs/fuxi-web-console.log 2>&1 &
```

Windows PowerShell 后台运行：

```powershell
New-Item -ItemType Directory -Force logs | Out-Null
Start-Process -WindowStyle Hidden powershell -ArgumentList '-NoProfile', '-Command', 'npm start *> logs/fuxi-web-console.log'
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
