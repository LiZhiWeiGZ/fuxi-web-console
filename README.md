# fuxi-web-console

`fuxi-web-console` 是一个独立的知识库网页工作台，用来浏览本地 Markdown 知识库，并通过后端调用大模型完成问答。

项目本身不包含知识库内容。运行时通过 `KB_ROOT` 指向外部 `knowledge-base` 目录。

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

路径配置说明：

- 程序会优先读取 `server/config/kb.paths.local.json`；如果不存在，则读取 `server/config/kb.paths.example.json`。
- 所有 `path` 都是相对于 `KB_ROOT` 的路径，`KB_ROOT` 在 `.env.local` 中配置。
- `navigation.label` 是左侧文档区的名称。
- `navigation.primaryTab` 指定文档页默认打开哪个页签，对应 `tabs[].key`。
- `navigation.titleFrom` 指定标题提取顺序，默认依次读取 frontmatter 的 `title`、一级标题、文件名。
- `tabs` 配置“文档”页里的内容来源。默认包含：
  - `arranged`：整理版，读取 `wiki/imported-excel`。
  - `imageMd`：原始文件，读取 `raw/excel-md-with-images`。
- `woven` 配置“专题”页。默认包含：
  - `topics`：主题页，读取 `wiki/topics`。
  - `entities`：实体页，读取 `wiki/entities`。
- `assets.imageRoot` 配置图片资源目录，默认读取 `raw/excel-images`。

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
