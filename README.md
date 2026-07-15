# oc-webui-pin

> ⚠️ **已废弃（Deprecated）**
>
> OpenClaw **2026.7.1+** 已内置项目锁定功能（Project Lock），本插件不再需要。
>
> 内置功能路径：`openclaw.json` → `sessions.groups` + `[lock:]` / `[unlock]` / `[detect-project]` 协议命令
>
> 本仓库保留仅供参考，**不再维护**。

📌 **OpenClaw WebUI 项目锁定补丁**

在 OpenClaw 聊天 UI 中锁定工作目录，防止长对话中任务漂移。通过在 WebUI 工具栏注入项目路径锁定功能实现。

## 功能

| 功能 | 说明 |
|------|------|
| 📌 检测按钮 | 点击自动从 agent 回复中检测项目路径 |
| 路径输入框 | 输入路径按 Enter 锁定，清空后按 Enter 解除 |
| Session 隔离 | 每个 session 使用独立 `sessionStorage` key，per-tab 隔离 |
| WebSocket 消息监听 | 从 WS 消息中直接捕获 `[Project: ...]` 标记 |
| 流式分裂保护 | `accumulateStreamChunk` 缓存未闭合标记，token 分裂也能匹配 |
| 离线同步 | Agent 回复末尾的 `[Project: ...]` 在 sessionStorage 为空时自动同步 |
| 入站命令监听 | 检测发出去的 `[lock:]` / `[unlock]` 命令并等待匹配响应 |
| Shadow DOM 支持 | 穿透 `openclaw-app` web component 的 shadow root |

## 迁移指南（从本插件迁移到内置功能）

OpenClaw 2026.7.1 内置了等效功能，迁移步骤：

1. 卸载本插件（油猴脚本管理器中删除）
2. 内置功能通过 Agent 的 `AGENTS.md` 自动处理 `[lock:]` / `[unlock]` / `[detect-project]` 命令
3. 项目锁定状态存储在 `~/.openclaw/workspace-main/.current-projects.json`（per-session 隔离）
4. 体验与插件一致，无需额外配置

## 历史版本

- v32: fix multi-session isolation + page-load sync
- v31: 1会话=1工作目录 — localStorage + per-session key
- v17: 流式分裂保护 + 离线同步 + 命令超时
