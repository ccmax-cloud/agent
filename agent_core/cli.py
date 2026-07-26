"""终端交互入口：python -m agent_core.cli 或安装后直接运行 `agent`。"""

from __future__ import annotations

import sys
from typing import Any

from agent_core.agent import Agent
from agent_core.config import AgentConfig
from agent_core.tools.builtin import default_registry

BANNER = """\
╭──────────────────────────────────────────────╮
│  agent-scaffold  ·  Claude Agent 基架        │
│  输入内容开始对话；/clear 清空历史；/exit 退出  │
╰──────────────────────────────────────────────╯"""


def _print_tool_use(name: str, tool_input: dict[str, Any]) -> None:
    args = ", ".join(f"{k}={v!r}" for k, v in tool_input.items())
    print(f"\n  ⚙ 调用工具 {name}({args})", flush=True)


def main() -> None:
    config = AgentConfig.from_env()
    config.workspace.mkdir(parents=True, exist_ok=True)
    agent = Agent(config=config, registry=default_registry(config.workspace))

    print(BANNER)
    print(f"  模型: {config.model} | 工具: {len(agent.registry)} 个 | 工作目录: {config.workspace}\n")

    while True:
        try:
            user_input = input("你> ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n再见！")
            break

        if not user_input:
            continue
        if user_input in ("/exit", "/quit"):
            print("再见！")
            break
        if user_input == "/clear":
            agent.memory.clear()
            print("（历史已清空）\n")
            continue

        print("助手> ", end="", flush=True)
        try:
            agent.run(
                user_input,
                on_text=lambda t: print(t, end="", flush=True),
                on_tool_use=_print_tool_use,
            )
        except Exception as exc:  # noqa: BLE001 — CLI 层兜底，避免整个进程崩掉
            print(f"\n[出错] {type(exc).__name__}: {exc}", file=sys.stderr)
        print("\n")


if __name__ == "__main__":
    main()
