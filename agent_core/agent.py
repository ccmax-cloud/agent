"""Agent 核心循环。

一次 run() 的完整流程：

    用户输入
      └─> 调用模型（流式）
            ├─ stop_reason == "tool_use"  -> 执行工具 -> 结果回填 -> 再次调用模型
            ├─ stop_reason == "pause_turn" -> 原样回填 assistant 消息继续
            ├─ stop_reason == "refusal"    -> 安全拒绝，结束本轮
            ├─ stop_reason == "max_tokens" -> 输出被截断，结束本轮并提示
            └─ stop_reason == "end_turn"   -> 正常结束，返回最终文本

这是刻意写成显式循环的"教学版"实现——每一步都看得见。
生产中也可以换用 SDK 的 tool_runner（client.beta.messages.tool_runner）。
"""

from __future__ import annotations

from typing import Any, Callable

import anthropic

from agent_core.config import AgentConfig
from agent_core.memory import Memory
from agent_core.tools import ToolRegistry

# 回调类型：流式文本片段 / 工具调用事件，用于 CLI 实时展示
OnText = Callable[[str], None]
OnToolUse = Callable[[str, dict[str, Any]], None]


class Agent:
    def __init__(
        self,
        config: AgentConfig | None = None,
        registry: ToolRegistry | None = None,
        client: anthropic.Anthropic | None = None,
    ) -> None:
        self.config = config or AgentConfig.from_env()
        self.registry = registry or ToolRegistry()
        # client 可注入，方便测试时替换为假客户端
        self.client = client or anthropic.Anthropic()
        self.memory = Memory()

    # ------------------------------------------------------------ 主入口

    def run(
        self,
        user_input: str,
        on_text: OnText | None = None,
        on_tool_use: OnToolUse | None = None,
    ) -> str:
        """处理一条用户消息，驱动完整的 Agent 循环，返回最终回复文本。

        on_text:     每收到一段流式文本时回调（用于终端实时打印）
        on_tool_use: 每次模型调用工具时回调（用于展示工具执行过程）
        """
        self.memory.add_user(user_input)
        final_text_parts: list[str] = []

        for _ in range(self.config.max_iterations):
            response = self._call_model(on_text)

            if response.stop_reason == "refusal":
                # 安全分类器拒绝：content 可能为空，先于读取内容处理
                note = "（本轮请求因安全原因被拒绝）"
                self.memory.add_assistant(note)
                return note

            # 完整 content（含 tool_use / thinking 块）必须原样回填历史
            self.memory.add_assistant(response.content)
            final_text_parts.extend(
                block.text for block in response.content if block.type == "text"
            )

            if response.stop_reason == "tool_use":
                tool_results = self._execute_tools(response.content, on_tool_use)
                self.memory.add_user(tool_results)
                continue

            if response.stop_reason == "pause_turn":
                # 服务端工具循环暂停，直接再请求一次即可续跑
                continue

            if response.stop_reason == "max_tokens":
                final_text_parts.append("\n（输出达到 max_tokens 上限被截断）")
            break  # end_turn / max_tokens / 其它情况：结束本轮

        self.memory.trim()
        return "".join(final_text_parts).strip()

    # ------------------------------------------------------------ 模型调用

    def _call_model(self, on_text: OnText | None) -> Any:
        """发起一次流式请求，边流式回调边收集，返回完整 Message。"""
        kwargs: dict[str, Any] = {
            "model": self.config.model,
            "max_tokens": self.config.max_tokens,
            "system": self.config.system_prompt,
            "messages": self.memory.messages,
            "output_config": {"effort": self.config.effort},
        }
        if len(self.registry):
            kwargs["tools"] = self.registry.to_api_list()

        with self.client.messages.stream(**kwargs) as stream:
            for text in stream.text_stream:
                if on_text:
                    on_text(text)
            return stream.get_final_message()

    # ------------------------------------------------------------ 工具执行

    def _execute_tools(
        self, content: list[Any], on_tool_use: OnToolUse | None
    ) -> list[dict[str, Any]]:
        """执行本轮所有 tool_use 块，所有结果合并进同一条 user 消息返回。"""
        results: list[dict[str, Any]] = []
        for block in content:
            if block.type != "tool_use":
                continue
            if on_tool_use:
                on_tool_use(block.name, block.input)
            output, is_error = self.registry.execute(block.name, block.input)
            result: dict[str, Any] = {
                "type": "tool_result",
                "tool_use_id": block.id,
                "content": output,
            }
            if is_error:
                result["is_error"] = True
            results.append(result)
        return results
