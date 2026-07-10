# AGENTS.md

本文件给在 `fuxi-web-console` 中工作的 AI 代理、脚本代理和后续协作者使用。

## 项目定位

`fuxi-web-console` 是独立的知识库网页工作台，不包含知识库正文。

它通过后端读取外部 `knowledge-base/` 目录，并在网页中提供：

- 文档浏览：`wiki/imported-excel` 与 `raw/excel-md-with-images`
- 专题浏览：`wiki/topics` 与 `wiki/entities`
- 知识库问答：后端检索 Markdown，再调用 OpenAI-compatible API
- 前端本地会话历史：仅保存在浏览器 `localStorage`

不要把这个项目和 `sgsg_knowledge_base` 知识库混在一起维护。知识库内容、Excel 导入、AI 整理和往回编织属于 `sgsg_knowledge_base`。

## 技术边界

- 前端在 `public/`，使用原生 HTML/CSS/JS。
- 后端入口是 `server/server.mjs`，使用 Node.js 标准库。
- 项目要求 Node.js 18+。
- 当前不使用 Docker，也不要新增 Docker 相关文件，除非用户明确要求。
- 不要引入构建系统、前端框架或新依赖，除非现有实现无法合理完成需求。

## 配置规则

本地配置统一放在 `server/config/` 下。推荐使用实例配置启动，每个 Web 实例一份配置：

```text
server/config/instances/*.local.json
server/config/model.config.local.json
server/config/kb.paths.local.json
```

示例配置文件：

```text
server/config/instances/*.example.json
server/config/model.config.example.json
server/config/kb.paths.example.json
```

规则：

- `server/config/instances/*.local.json` 是实例入口，包含 `host`、`port`、`kbRoot`、`kbPathsConfig`、`modelConfig` 和可选 Basic Auth。
- `model.config.local.json` 可能包含 API Key，不能提交。
- `kb.paths.local.json` 可能包含本地或服务器路径，不能提交。
- `.env.local` 是旧版兼容配置，不作为新增配置的推荐入口。
- `kb.paths.example.json` 必须保持标准 JSON，不要加入 `//` 注释。
- README 中可以用 `jsonc` 代码块解释配置，但实际配置文件必须能被标准 `JSON.parse` 读取。
- `kbRoot` 指向外部 `knowledge-base/`；所有知识库相对路径都从 `kbRoot` 开始。

## 知识库目录假设

默认读取：

```text
knowledge-base/wiki/imported-excel
knowledge-base/raw/excel-md-with-images
knowledge-base/raw/excel-images
knowledge-base/wiki/topics
knowledge-base/wiki/entities
```

如果这些目录调整，需要同步检查：

- `server/config/kb.paths.example.json`
- README 中的目录说明
- 前端文档页签和专题页显示逻辑
- `/api/docs/tree`
- `/api/woven/tree`
- `/api/files`

## 问答规则

后端问答逻辑应保持以下原则：

- 优先使用 `wiki/topics/` 和 `wiki/entities/` 作为综合结论来源。
- `wiki/imported-excel/` 是单源整理页，用于回溯具体 Excel。
- `raw/excel-md-with-images/` 和图片资源用于核对原始文件，不应作为默认问答主来源。
- 如果问题与知识库无关，或资料未明确说明，应回答“知识库未明确说明”，不要编造。
- 回答中涉及数值、概率、次数、等级、消耗、奖励、服务端判定时，应保留来源路径。

## 前端维护规则

- 保持文档页、专题页、问答页三个主工作区清晰分离。
- 左侧目录和主内容区都要适配移动端。
- 不要把 API Key、模型配置或设置页放到前端。
- 问答历史只保存在浏览器本地，不需要后端持久化。
- 改动 UI 后，至少检查桌面和手机宽度下是否有文字溢出、按钮重叠或目录不可滚动。
- 图片预览通过后端 `/api/files` 读取，路径必须限制在配置的图片根目录下。

## 后端维护规则

- 所有知识库文件访问必须经过路径校验，禁止读取当前实例 `kbRoot` 外部文件。
- Basic Auth 开启时，API 和静态页面都应受保护。
- 不要把整个知识库正文长期无界缓存到内存。
- 搜索和问答上下文应限制文档数量和正文长度。
- 大模型调用配置只读后端配置文件，不从前端传入 API Key。

## 常用命令

```bash
npm run check
npm start -- --config server/config/instances/fuxi-5177.local.json
npm run start:all
```

健康检查：

```bash
curl http://127.0.0.1:5177/api/health
```

如果启用 Basic Auth：

```bash
curl -u admin:change-this-password http://127.0.0.1:5177/api/health
```

## 文件处理

- Markdown 和源码使用 UTF-8。
- 终端默认编码可能显示中文乱码；判断文件内容时优先用 Node.js 读取 UTF-8。
- 不要删除用户已有改动。
- 不要提交 `logs/`、`.env.local`、`server/config/env.local`、`model.config.local.json`、`kb.paths.local.json`、`server/config/instances/*.local.json`。
