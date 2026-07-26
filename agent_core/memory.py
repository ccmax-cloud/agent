"""多轮对话历史管理。

Claude API 是无状态的，每次请求要带上完整历史。
这里做最简单可靠的事：持有 messages 列表，超长时按"轮"裁剪最旧的对话。

进阶方向（README 中有说明）：
- 服务端 compaction（beta compact-2026-01-12）自动摘要旧上下文
- context editing 清理过期的 tool_result
"""

from __future__ import annotations

from typing import Any


class Memory:
    def __init__(self, max_messages: int = 200) -> None:
        self.messages: list[dict[str, Any]] = []
        self.max_messages = max_messages

    def add_user(self, content: Any) -> None:
        self.messages.append({"role": "user", "content": content})

    def add_assistant(self, content: Any) -> None:
        self.messages.append({"role": "assistant", "content": content})

    def trim(self) -> None:
        """超出上限时从最旧的消息裁起。

        必须保证裁剪后第一条是 user 消息，且不能把 tool_use 和
        对应的 tool_result 拆开（tool_result 总是紧跟在 assistant
        的 tool_use 之后的 user 消息里），所以按位置向后找安全切点。
        """
        if len(self.messages) <= self.max_messages:
            return
        start = len(self.messages) - self.max_messages
        # 向后移动切点，直到落在一条"纯文本 user 消息"上
        while start < len(self.messages):
            msg = self.messages[start]
            if msg["role"] == "user" and isinstance(msg["content"], str):
                break
            start += 1
        self.messages = self.messages[start:]

    def clear(self) -> None:
        self.messages.clear()

    def __len__(self) -> int:
        return len(self.messages)
