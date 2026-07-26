"""agent-scaffold: 一个简洁、可扩展的 Claude Agent 基架。

核心模块：
- config    运行配置（模型、token 上限、思考深度等）
- tools     工具注册表 + @tool 装饰器（自动生成 JSON Schema）
- memory    多轮对话历史管理
- agent     Agent 循环（模型调用 -> 工具执行 -> 结果回填 -> 循环）
- cli       终端交互入口
"""

from agent_core.agent import Agent
from agent_core.config import AgentConfig
from agent_core.tools import Tool, ToolRegistry, tool

__all__ = ["Agent", "AgentConfig", "Tool", "ToolRegistry", "tool"]
