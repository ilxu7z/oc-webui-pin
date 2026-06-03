# oc-webui-pin

📌 **OpenClaw WebUI Project Lock Patch**

Pin your working directory in the OpenClaw chat UI. Prevents task drift across long conversations by injecting a project path lock into the WebUI toolbar.

## Features

| Feature | Description |
|---------|-------------|
| 📌 Detect Button | Click to auto-detect project path from agent response |
| Path Input | Type a path + Enter to lock, clear + Enter to unlock |
| Auto Tag | Appends `[Project: /path]` to every outgoing message |
| Agent Isolation | Each agent uses independent localStorage key |
| WebSocket Intercept | Captures `[Project: ...]` from agent streaming responses |
| Shadow DOM Support | Penetrates `openclaw-app` web component shadow root |
| SPA Navigation | Monkey-patches `pushState/replaceState` for agent switching |
| Grace Period | 3.5s protection against historical message overwrites |

## Compatibility

- **OpenClaw**: `@qingchencloud/openclaw-zh 2026.5.x` (zh edition)
- **Tested**: 2026.5.28-zh.1
- **CSS selectors**: `.agent-chat__toolbar`, `.agent-chat__input-btn`, `.chat-bubble`, `openclaw-app`
- **Protocol**: WebSocket (no SSE dependency)

## Install

### Method 1: Auto Install (Recommended)

```bash
git clone git@github-ilxu7z:ilxu7z/oc-webui-pin.git
cd oc-webui-pin
python3 install.py
```

### Method 2: Manual Injection

1. Open target file:
   ```bash
   # macOS/Linux
   sudo nano /usr/local/lib/node_modules/@qingchencloud/openclaw-zh/dist/control-ui/index.html
   ```

2. Find `</body>` tag (usually near the end of file)

3. Insert the full content of `project-lock-patch.js` before `</body>`

4. Hard refresh browser (`Cmd+Shift+R` / `Ctrl+Shift+R`)

### Uninstall

```bash
python3 install.py --uninstall
```

## Re-install After OpenClaw Update

`npm update -g` or `openclaw update` will overwrite `dist/control-ui/index.html` and the patch will be lost. Simply re-run:

```bash
python3 install.py
```

## Files

| File | Description |
|------|-------------|
| `project-lock-patch.js` | Main patch script (inject into `index.html`) |
| `install.py` | Auto install/uninstall script |
| `agents-rules.md` | AGENTS.md rules snippet for agent-side project lock protocol |
| `current-project-template` | Template for `.current-project` file |

## How It Works

The patch is purely injective — it doesn't modify any OpenClaw core code. It operates in two layers:

**Frontend (this patch):**
- 📌 button → sends `[detect-project]` → agent replies `[Project: /path]` → auto-fills input
- Path input box for manual lock/unlock
- Auto-appends `[Project: /path]` tag to outgoing messages
- WebSocket interception + DOM MutationObserver for bidirectional detection

**Backend (agent AGENTS.md rules):**
- Reads `.current-project` file → validates path → constrains file operations
- Responds to `[detect-project]` with project path
- Syncs `[Project: /path]` message tags to `.current-project`

## Troubleshooting

| Issue | Solution |
|-------|----------|
| 📌 Click does nothing | Open DevTools Console, check for errors |
| Path detected but not filled | Console search `[ProjectLock]`, check if `Detected` fires |
| Path disappears on agent switch | Normal — each agent stores independently, re-lock after switch |
| White screen after injection | Check JS syntax integrity (possible truncation during copy) |
| Patch lost after update | Re-run `python3 install.py` |

## License

MIT
