## 📌 项目锁定（Project Lock）

防止长对话中任务漂移到错误项目。**每次收到实质性工作请求时执行。**

### 核心原则

Agent 为 Source of Truth。锁定状态由 Agent 通过 `.current-projects.json` 文件维护（per-session 存储，避免跨会话覆盖），前端只做 UI 缓存。

### 指令预处理（硬编码，不走模型推理）

当用户消息以 `[lock:`、`[unlock]` 或 `[detect-project]` 开头时，**必须**执行以下硬编码逻辑，不走决策门/三省六部/其他任何流程：

#### `[lock: /path]` 指令
1. 提取路径：`/path`（去掉 `[lock: ` 前缀和 `]` 结尾）
2. 获取当前 sessionKey（通过 `session_status` 获取完整 key）
3. 读 `~/.openclaw/workspace-main/.current-projects.json`（不存在则创建 `{}`）
4. 写入 per-session 记录：`{ "<sessionKey>": { "path": "<路径>", "focus": "", "lockedAt": "<ISO-8601>" } }`
5. 如果路径目录不存在，先创建目录
6. 在路径下创建 `.openclaw-project/` 结构（CONTEXT.md / PROGRESS.md / LOG.md / CHECKLIST.md）
7. 回复 ONLY: `[LockConfirmed: main::/path]` — ⛔ 不允许输出任何额外文本

#### `[unlock]` 指令
1. 获取当前 sessionKey
2. 读 `~/.openclaw/workspace-main/.current-projects.json`
3. 从 JSON 中删除当前 sessionKey 的记录
4. 写回文件
5. 回复 ONLY: `[LockCleared: main]` — ⛔ 不允许输出任何额外文本

#### `[detect-project]` 指令
1. 获取当前 sessionKey
2. 读 `~/.openclaw/workspace-main/.current-projects.json`
3. 如果当前 sessionKey 有锁定项目 → 提取 path 值，回复 ONLY: `[Project: main::/path]`
4. 如果无锁定 → 从上下文推断路径，回复 `[Project: main::/path]`
5. 无法推断则回复 `[Project: main::]` — ⛔ 不允许输出任何额外文本

### 协议命令表

| 命令 | 方向 | Agent 行为 |
|------|------|-----------|
| `[detect-project]` | 前端→Agent | 读 `.current-projects.json`，当前 session 有则回复 `[Project: main::/path]`，无则从上下文推断 |
| `[lock: /path]` | 前端→Agent | 写 `.current-projects.json`（per-session），创建 `.openclaw-project/` 结构，回复 `[LockConfirmed: main::/path]` |
| `[unlock]` | 前端→Agent | 从 `.current-projects.json` 删除当前 session 记录，回复 `[LockCleared: main]` |
| `[Project: main::/path]` | Agent→前端 | 检测到项目路径时回复 |
| `[LockConfirmed: main::/path]` | Agent→前端 | 锁定确认，前端更新状态图标为 🔒 |
| `[LockCleared: main]` | Agent→前端 | 解锁确认，前端更新状态图标为 📌 |

### 流程

1. **读锁定文件**：`read("~/.openclaw/workspace-main/.current-projects.json")`
2. **获取当前 sessionKey**：通过 `session_status` 获取完整 sessionKey
3. **查找当前 session 的锁定**：从 JSON 中查找当前 sessionKey 对应的记录
4. **校验**：
   - 文件不存在或当前 session 无记录 → 跳过（无锁定，自由模式）
   - PATH 不存在 → 提醒用户
   - 用户消息提到不同项目 → 提醒切换
5. **初始化项目文件夹**（首次锁定时）：在 PATH 指向的目录下创建 `.openclaw-project/` 结构
6. **工作中**：所有文件操作、进度记录在锁定项目路径内进行

### .current-projects.json 格式

```json
{
  "agent:main:explicit:xxx": {
    "path": "/Users/chee/Projects/AIMarketingSystem",
    "focus": "AIMarketingSystem 开发",
    "lockedAt": "2026-07-03T10:00:00+08:00"
  },
  "agent:main:explicit:yyy": {
    "path": "/Volumes/Chee_2/OpenClaw/任务/20260630WhatsApp插件",
    "focus": "WhatsApp 插件开发",
    "lockedAt": "2026-07-03T00:08:00+08:00"
  }
}
```

### .openclaw-project/ 目录结构

```
.openclaw-project/
├── CONTEXT.md      ← 项目背景、需求、约束
├── PROGRESS.md     ← 当前进度
├── LOG.md          ← 工作日志
└── CHECKLIST.md    ← 4步验证清单
```

### 4步工作法

```
□ 1. 理解 — 读 CONTEXT.md + 相关文件，输出理解摘要
□ 2. 诊断 — 读代码/文件，定位具体问题
□ 3. 方案 — 输出解决流程，等用户确认
□ 4. 落地 — 执行修改 + 验证 + 更新 PROGRESS.md + 追加 LOG.md
```

**可跳过步骤的条件**：用户明确说「直接做」「不用确认」「快改」等。

### 标记格式说明

所有 Agent→前端标记必须携带 `sessionKey`，格式为 `[TYPE: sessionKey::value]`。

**⚠️ sessionKey 两种用途必须区分：**

1. **`.current-projects.json` 存储 key**：用 `session_status` 返回的完整 sessionKey（如 `agent:main:dashboard:33018615-xxx`）。**绝对不要用 `main` 做 storage key！**
2. **Agent→前端标记格式**：WebChat 通道固定用 `main`。其他通道用完整 sessionKey。
