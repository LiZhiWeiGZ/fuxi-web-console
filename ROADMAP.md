# ROADMAP.md

本文件记录 `fuxi-web-console` 的当前维护状态。

## 当前阶段

- 本地知识库网页工作台整理阶段。

## 已完成

- 后端入口已整理到 `server/server.mjs`。
- README 截图已整理到 `docs/images/`。
- README 界面预览图片路径已改为显式相对路径。
- 启动脚本已同步到新的后端入口路径。
- 后端调用知识库 Excel 脚本的路径已同步到 `sgsg_knowledge_base/scripts/excel/`。
- Unix/Linux/macOS 下默认使用 `pwsh` 执行 PowerShell 脚本。
- 后端启动支持 `server/config/instances/*.local.json` 实例配置，可用不同端口同时访问不同知识库。
- 新增 `server/start-all.mjs`，可批量启动多份实例配置。
- 配置入口已统一到 `server/config/`，README 和 AGENTS 规范已同步。
- 已创建 `server/config/instances/fuxi-5177.local.json` 和 `server/config/instances/fuxi-5178.local.json` 两份本地实例配置，两者除端口外保持一致。
- README 安装步骤已同步为复制 `fuxi-5177.local.json` 与 `fuxi-5178.local.json` 两份本地实例配置。

## 进行中

- 无。

## 待办

- 待确认是否需要继续拆分后端单文件逻辑。

## 阻塞

- 无。

## 最近验证

- 2026-07-09：`npm run check` 通过。
- 2026-07-09：确认 `docs/images/document.png`、`docs/images/theme.png`、`docs/images/answer.png` 均为有效 PNG 文件。
- 2026-07-09：`node server/server.mjs --config server/config/instances/fuxi.example.json` 启动成功，`/api/health` 返回实例配置和知识库路径。
- 2026-07-09：`node server/start-all.mjs --config server/config/instances/fuxi.example.json --config /tmp/fuxi-web-console-5178.json` 同时启动 5177 与 5178，两个 `/api/health` 均返回 `ok: true`。
- 2026-07-09：`npm run start:all` 使用 `fuxi-5177.local.json` 和 `fuxi-5178.local.json` 启动成功，`http://127.0.0.1:5177/api/health` 与 `http://127.0.0.1:5178/api/health` 均返回 `ok: true`。
- 2026-07-10：确认 README 多实例安装步骤已与 `fuxi-5177.local.json`、`fuxi-5178.local.json` 当前配置命名保持一致。
- 2026-07-10：`npm run check` 与提交前 `git diff --check` 均通过。
