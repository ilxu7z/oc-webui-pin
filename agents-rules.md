## 📌 项目锁定（Project Lock）

防止长对话中任务漂移到错误项目。**每次收到实质性工作请求时执行。**

### 流程

1. **读锁定文件**：`read("~/.openclaw/workspace-main/.current-project")`
2. **校验**：
   - 文件不存在 → 跳过（无锁定，自由模式）
   - PATH 不存在 → 提醒用户「项目路径无效，请确认」
   - 用户消息明确提到不同项目 → 提醒「当前锁定的是 [PATH]，你提到的似乎是另一个项目，要切换吗？」
3. **初始化项目文件夹**（首次锁定时）：在 PATH 指向的目录下创建 `.openclaw-project/` 结构（见下方）
4. **工作中**：所有文件操作、进度记录在锁定项目路径内进行；每完成一个动作追加 LOG.md、更新 PROGRESS.md

### .current-project 格式

```
PATH: /Volumes/Chee_2/OpenClaw/任务/202604产品画册/B端画册
FOCUS: B端产品画册设计优化
LOCKED_AT: 2026-04-22T13:43:00+08:00
```

### WebUI 消息中的项目标记

WebUI 输入框锁定项目后，每条消息末尾会附带 `[Project: /path]` 标记。收到此标记时：
- 如果与 `.current-project` 的 PATH 一致 → 正常工作
- 如果不一致 → 以消息中的标记为准，更新 `.current-project`（用户已切换项目）

### [detect-project] 指令

用户点击 📌 按钮时会发送 `[detect-project]`。收到此指令时：
1. 读 `.current-project`
2. 如果有锁定项目 → 回复 `[Project: /path/to/project]`（UI 会自动捕获并填入输入框）
3. 如果无锁定 → 回复当前正在操作的项目路径（从对话上下文推断），格式同样是 `[Project: /path]`
4. 不要输出其他内容，只输出 `[Project: path]`

### .openclaw-project/ 目录结构

在锁定项目根目录下自动创建：

```
.openclaw-project/
├── CONTEXT.md      ← 项目背景、需求、约束（首次由 agent 根据任务生成，用户可编辑）
├── PROGRESS.md     ← 当前进度：已完成 / 进行中 / 待开始
├── LOG.md          ← 工作日志：每次动作追加（时间戳 + 动作 + 结果）
└── CHECKLIST.md    ← 4步验证清单（见下方）
```

### 4步工作法

每个实质性任务按以下流程执行，并在 CHECKLIST.md 中勾选：

```
□ 1. 理解 — 读 CONTEXT.md + 相关文件，输出理解摘要（给用户确认）
□ 2. 诊断 — 读代码/文件，定位具体问题，列出发现
□ 3. 方案 — 输出解决流程（步骤清单），等用户确认
□ 4. 落地 — 执行修改 + 验证（运行/截图/对比） + 更新 PROGRESS.md + 追加 LOG.md
   → 必要时循环：验证不通过 → 回到步骤 2
```

**仅限以下情况可跳过步骤 1-3**：用户明确说「直接做」「不用确认」「快改」等。
