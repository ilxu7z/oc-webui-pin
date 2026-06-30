# oc-webui-pin

📌 **OpenClaw WebUI 项目锁定补丁（v17）**

在 OpenClaw 聊天 UI 中锁定工作目录，防止长对话中任务漂移。通过在 WebUI 工具栏注入项目路径锁定功能实现。

## 功能

| 功能 | 说明 |
|------|------|
| 📌 检测按钮 | 点击自动从 agent 回复中检测项目路径 |
| 路径输入框 | 输入路径按 Enter 锁定，清空后按 Enter 解除 |
| Session 隔离 | 每个 session 使用独立 `sessionStorage` key，per-tab 隔离 |
| WebSocket 消息监听 | 从 WS 消息中直接捕获 `[Project: ...]` 标记（不劫持原型） |
| 流式分裂保护 | `accumulateStreamChunk` 缓存未闭合标记，token 分裂也能匹配 |
| 离线同步 | Agent 回复末尾的 `[Project: ...]` 在 sessionStorage 为空时自动同步 |
| 入站命令监听 | 检测发出去的 `[lock:]` / `[unlock]` 命令并等待匹配响应 |
| 命令超时保护 | Lock 15s / Unlock 15s / Detect 15s 超时窗口 |
| 残留/重复清理 | 定期检查并清理多余或残留的组件实例 |
| Shadow DOM 支持 | 穿透 `openclaw-app` web component 的 shadow root |
| SPA 导航感知 | Monkey-patch `pushState/replaceState` 响应 Agent 切换 |

## v17 修复内容

| 问题 | 修复 |
|------|------|
| 流式响应标记分裂 | `accumulateStreamChunk` 缓存未闭合 token 直到完整标记出现 |
| `[Project:]` 离线不同步 | `_pendingDetect` 窗口外也能接受（sessionStorage 为空时兜底） |
| `[lock:]` / `[unlock]` 无响应超时 | 15s 超时 + console.log 日志 |
| `localStorage` 跨 tab 冲突 | `sessionStorage` per-tab 隔离 |
| 冗余 WS 原型劫持 | 轻量 WS 消息监听 + accumulate 回调，最小化侵入 |
| Agent 端依赖模型推理 | AGENTS.md 硬编码指令预处理（回复 ONLY 标记，无额外文本） |
| 会话隔离 | storage key 使用完整 session key（如 `agent:main:explicit:xxx`），同一浏览器窗口不同?session=标签互不干扰 |

## 兼容性

- **OpenClaw**: `@qingchencloud/openclaw-zh 2026.5.x`（中文版）
- **已测试**: 2026.5.28-zh.1
- **CSS 选择器**: `.agent-chat__toolbar`、`.agent-chat__input-btn`、`.chat-bubble`、`openclaw-app`
- **通信协议**: WebSocket（不依赖 SSE）

## 安装

### 方法一：自动安装（推荐）

```bash
git clone git@github-ilxu7z:ilxu7z/oc-webui-pin.git
cd oc-webui-pin
python3 install.py
```

### 方法二：手动注入

1. 打开目标文件：
   ```bash
   # macOS/Linux
   sudo nano /usr/local/lib/node_modules/@qingchencloud/openclaw-zh/dist/control-ui/index.html
   ```

2. 找到 `</body>` 标签（通常在文件末尾）

3. 在 `</body>` **之前**插入 `project-lock-patch.js` 中的 `<script>...</script>` 块

4. 硬刷新浏览器（`Cmd+Shift+R` / `Ctrl+Shift+R`）

## 卸载

```bash
python3 install.py --uninstall
```

## OpenClaw 更新后重新安装

`npm update -g` 或 `openclaw update` 会覆盖 `dist/control-ui/index.html`，补丁会丢失。重新运行即可：

```bash
python3 install.py
```

## 文件说明

| 文件 | 说明 |
|------|------|
| `project-lock-patch.js` | 主补丁脚本（注入到 `index.html`） |
| `install.py` | 自动安装/卸载脚本 |
| `agents-rules.md` | Agent 侧项目锁定规则（嵌入 AGENTS.md 用） |
| `current-project-template` | `.current-project` 模板文件 |

## 工作原理

补丁是纯注入式的，不修改任何 OpenClaw 核心代码。前后端两层配合：

**前端（本补丁，v16）：**
- 📌 按钮点击 → 发送 `[detect-project]` → agent 回复 `[Project: main::/path]` → 自动填入输入框
- 路径输入框手动锁定/解除
- `[lock: /path]` 发送后 OpenClaw 原型级 WS 监听 + accumulateStreamChunk 双通道捕获响应标记
- 流式分裂保护: 未闭合的 `[LockConfirmed:` / `[Project:` token 跨帧缓存

**后端（Agent AGENTS.md 规则）：**
- 读取 `.current-project` 文件 → 校验路径 → 约束文件操作范围
- 收到 `[detect-project]` 时回复 `[Project: main::/path]`
- 收到 `[lock: /path]` 时写文件 + 回复 `[LockConfirmed: main::/path]`
- 收到 `[unlock]` 时删除文件 + 回复 `[LockCleared: main]`

## 排查

| 问题 | 解决方案 |
|------|----------|
| 📌 点击后没有反应 | 打开 DevTools Console，检查是否有报错 |
| 路径检测到了但没填入 | Console 搜 `[ProjectLock]`，确认是否触发了 `Detected` 或 `Offline sync` |
| 切 session 后路径消失 | 正常——每个 session 独立存储，切后需重新锁定 |
| 补丁注入后页面白屏 | 检查 JS 语法是否完整（可能复制时截断了 `<script>` 标签） |
| 更新后补丁丢失 | 重新运行 `python3 install.py` |
| lock 后图标不变 🔒 | Console 搜 `Lock confirmed`，确认 WS 标记是否到达 |
| 流式响应长标记不匹配 | v16 的 `accumulateStreamChunk` 已修复此问题 |

## 许可

MIT
