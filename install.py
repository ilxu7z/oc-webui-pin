#!/usr/bin/env python3
"""
OpenClaw WebUI 项目锁定补丁 - 自动安装/卸载脚本
用法:
  python3 install.py        # 安装补丁
  python3 install.py --uninstall  # 卸载补丁
"""

import os
import sys

# 补丁文件和目标文件路径
PATCH_DIR = os.path.dirname(os.path.abspath(__file__))
PATCH_FILE = os.path.join(PATCH_DIR, "project-lock-patch-v6.js")

# OpenClaw 安装路径
OPENCLAW_DIST = "/usr/local/lib/node_modules/@qingchencloud/openclaw-zh/dist/control-ui/index.html"

# 补丁标记
MARKER_START = "<!-- Project Lock UI Injection -->"
MARKER_END = "<!-- End Project Lock UI Injection -->"


def read_file(path):
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def write_file(path, content):
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


def install():
    if not os.path.exists(OPENCLAW_DIST):
        print(f"❌ 目标文件不存在: {OPENCLAW_DIST}")
        print("   请确认 OpenClaw 安装路径是否正确")
        sys.exit(1)

    if not os.path.exists(PATCH_FILE):
        print(f"❌ 补丁文件不存在: {PATCH_FILE}")
        sys.exit(1)

    content = read_file(OPENCLAW_DIST)
    
    # 检查是否已安装
    if MARKER_START in content:
        print("⚠️  补丁已安装，跳过（如需重装请先 --uninstall）")
        return

    # 读取补丁内容（去掉最外层的 HTML 注释标签，保留 script 标签）
    patch_content = read_file(PATCH_FILE)

    # 在 </body> 前插入
    if "</body>" in content:
        content = content.replace("</body>", patch_content + "\n  </body>")
        write_file(OPENCLAW_DIST, content)
        print(f"✅ 补丁已安装到: {OPENCLAW_DIST}")
        print("   请硬刷新浏览器（Cmd+Shift+R）")
    else:
        print("❌ 找不到 </body> 标签，无法确定注入位置")
        sys.exit(1)


def uninstall():
    if not os.path.exists(OPENCLAW_DIST):
        print(f"❌ 目标文件不存在: {OPENCLAW_DIST}")
        sys.exit(1)

    content = read_file(OPENCLAW_DIST)
    
    if MARKER_START not in content:
        print("⚠️  未检测到补丁，无需卸载")
        return

    # 移除补丁块（从 MARKER_START 到 MARKER_END，含两端）
    lines = content.split("\n")
    new_lines = []
    in_patch = False
    for line in lines:
        if MARKER_START in line:
            in_patch = True
            continue
        if in_patch:
            if MARKER_END in line:
                in_patch = False
            continue
        new_lines.append(line)

    write_file(OPENCLAW_DIST, "\n".join(new_lines))
    print(f"✅ 补丁已从 {OPENCLAW_DIST} 卸载")
    print("   请硬刷新浏览器")


if __name__ == "__main__":
    if "--uninstall" in sys.argv:
        uninstall()
    else:
        install()
