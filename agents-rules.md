## 📌 项目锁定（Project Lock）

防止长对话中任务漂移到错误项目。**每次收到实质性工作请求时执行。**

### 核心原则

Agent 为 Source of Truth。锁定状态由 Agent 通过 `.current-project` 文件维护，前端只做 UI 缓存。

### 指令预处理（硬编码，不走模型推理）

当用户消息以 `[lock:`、`[unlock]` 或 `[detect-project]` 开头时，**必须**执行以下硬编码逻辑，不走决策门/三省六部/其他任何流程：

#### `[lock: /path]` 指令
1. 提取路径：`/path`（去掉 `[lock: ` 前缀和 `]` 结尾）
2. 写 `.current-project` 文件：PATH + FOCUS（留空）+ LOCKED_AT（当前时间 ISO-8601）
3. 如果路径目录不存在，先创建目录
4. 在路径下创建 `.openclaw-project/` 结构（CONTEXT.md / PROGRESS.md / LOG.md / CHECKLIST.md）
5. 回复 ONLY: `[LockConfirmed: main::/path]` — ⛔ 不允许输出任何额外文本

#### `[unlock]` 指令
1. 删除 `.current-project` 文件
2. 如果文件已不存在，静默忽略
3. 回复 ONLY: `[LockCleared: main]` — ⛔ 不允许输出任何额外文本

#### `[detect-project]` 指令
1. 读 `.current-project`
2. 如果有锁定 → 回复 ONLY: `[Project: main::/path]`（从 PATH 行提取）
3. 如果无锁定 → 从上下文推断路径，回复 `[Project: main::/path]`
4. 无法推断则回复 `[Project: main::]` — ⛔ 不允许输出任何额外文本

### 协议命令表

| 命令 | 方向 | Agent 行为 |
|------|------|-----------|
| `[detect-project]` | 前端→Agent | 读 `.current-project`，有则回复 `[Project: main::/path]`，无则从上下文推断 |
| `[lock: /path]` | 前端→Agent | 写 `.current-project`，创建 `.openclaw-project/` 结构，回复 `[LockConfirmed: main::/path]` |
| `[unlock]` | 前端→Agent | 删 `.current-project`，回复 `[LockCleared: main]` |
| `[Project: main::/path]` | Agent→前端 | 检测到项目路径时回复 |
| `[LockConfirmed: main::/path]` | Agent→前端 | 锁定确认，前端更新状态图标为 🔒 |
| `[LockCleared: main]` | Agent→前端 | 解锁确认，前端更新状态图标为 📌 |

### 流程

1. **读锁定文件**：`read("~/.openclaw/workspace-main/.current-project")`
2. **校验**：
   - 文件不存在 → 跳过（无锁定，自由模式）
   - PATH 不存在 → 提醒用户
   - 用户消息提到不同项目 → 提醒切换
3. **初始化项目文件夹**（首次锁定时）：在 PATH 指向的目录下创建 `.openclaw-project/` 结构
4. **工作中**：所有文件操作、进度记录在锁定项目路径内进行

### .current-project 格式

```
PATH: /path/to/project
FOCUS: 项目聚焦描述
LOCKED_AT: 2026-06-30T15:00:00+08:00
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

所有 Agent→前端标记必须携带 `sessionKey`，格式为 `[TYPE: sessionKey::value]`。WebChat 通道固定用 `main` 作为 sessionKey。
