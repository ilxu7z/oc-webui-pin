# oc-webui-pin

📌 **OpenClaw WebUI 项目锁定补丁**

在 OpenClaw 聊天 UI 中锁定工作目录，防止长对话中任务漂移。通过在 WebUI 工具栏注入项目路径锁定功能实现。

## 功能

| 功能 | 说明 |
|------|------|
| 📌 检测按钮 | 点击自动从 agent 回复中检测项目路径 |
| 路径输入框 | 输入路径按 Enter 锁定，清空后按 Enter 解除 |
| 自动标记 | 每条发送消息自动追加 `[Project: /path]` |
| Agent 隔离 | 不同 agent 使用独立 localStorage key，互不干扰 |
| WebSocket 拦截 | 从 agent 流式响应中捕获 `[Project: ...]` |
| Shadow DOM 支持 | 穿透 `openclaw-app` web component 的 shadow root |
| SPA 导航感知 | Monkey-patch `pushState/replaceState` 响应 Agent 切换 |
| 启动保护期 | 3.5 秒保护期，防止历史消息覆盖当前锁定 |

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

3. 在 `</body>` **之前**插入 `project-lock-patch.js` 的全部内容

4. 硬刷新浏览器（`Cmd+Shift+R` / `Ctrl+Shift+R`）

### 卸载

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

**前端（本补丁）：**
- 📌 按钮点击 → 发送 `[detect-project]` → agent 回复 `[Project: /path]` → 自动填入输入框
- 路径输入框手动锁定/解除
- 发消息时自动追加 `[Project: /path]` 标记
- WebSocket 拦截 + DOM MutationObserver 双向检测

**后端（Agent AGENTS.md 规则）：**
- 读取 `.current-project` 文件 → 校验路径 → 约束文件操作范围
- 收到 `[detect-project]` 时回复项目路径
- 收到 `[Project: /path]` 标记时同步更新 `.current-project`

## 排查

| 问题 | 解决方案 |
|------|----------|
| 📌 点击后没有反应 | 打开 DevTools Console，检查是否有报错 |
| 路径检测到了但没填入 | Console 搜 `[ProjectLock]`，确认是否触发了 `Detected` |
| 切换 agent 后路径消失 | 正常——每个 agent 独立存储，切换后需重新锁定 |
| 补丁注入后页面白屏 | 检查 JS 语法是否完整（可能复制时截断了 `<script>` 标签） |
| 更新后补丁丢失 | 重新运行 `python3 install.py` |

## 许可

MIT
