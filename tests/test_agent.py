"""Agent 循环测试：用假客户端模拟 API，验证 工具调用 -> 结果回填 -> 收尾 的完整链路。"""

from types import SimpleNamespace
from typing import Any

from agent_core.agent import Agent
from agent_core.config import AgentConfig
from agent_core.tools import ToolRegistry, tool


class FakeStream:
    """模拟 client.messages.stream() 返回的上下文管理器。"""

    def __init__(self, message: Any):
        self._message = message
        self.text_stream = iter(
            block.text for block in message.content if block.type == "text"
        )

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def get_final_message(self):
        return self._message


class FakeClient:
    """按预设脚本依次返回响应，并记录每次请求参数。"""

    def __init__(self, responses: list[Any]):
        self._responses = iter(responses)
        self.requests: list[dict[str, Any]] = []
        self.messages = SimpleNamespace(stream=self._stream)

    def _stream(self, **kwargs):
        # messages 传入的是 Memory 内部列表的引用，之后还会被追加，
        # 这里存快照才能断言"当时"的请求内容
        self.requests.append({**kwargs, "messages": list(kwargs["messages"])})
        return FakeStream(next(self._responses))


def text_block(text: str):
    return SimpleNamespace(type="text", text=text)


def tool_use_block(block_id: str, name: str, tool_input: dict):
    return SimpleNamespace(type="tool_use", id=block_id, name=name, input=tool_input)


def message(content: list, stop_reason: str):
    return SimpleNamespace(content=content, stop_reason=stop_reason)


def make_agent(responses: list[Any], registry: ToolRegistry | None = None) -> tuple[Agent, FakeClient]:
    client = FakeClient(responses)
    agent = Agent(config=AgentConfig(), registry=registry or ToolRegistry(), client=client)
    return agent, client


def test_simple_turn_without_tools():
    agent, client = make_agent([message([text_block("你好！")], "end_turn")])
    assert agent.run("hi") == "你好！"
    # 无工具时请求里不应带 tools 参数
    assert "tools" not in client.requests[0]
    # 历史：user + assistant
    assert [m["role"] for m in agent.memory.messages] == ["user", "assistant"]


def test_tool_use_loop():
    registry = ToolRegistry()

    @tool
    def add(a: int, b: int) -> str:
        """加法。"""
        return str(a + b)

    registry.register(add)

    responses = [
        message(
            [text_block("我来算一下。"), tool_use_block("tu_1", "add", {"a": 2, "b": 3})],
            "tool_use",
        ),
        message([text_block("结果是 5。")], "end_turn"),
    ]
    agent, client = make_agent(responses, registry)

    seen_tools: list[str] = []
    result = agent.run("2+3=?", on_tool_use=lambda name, _: seen_tools.append(name))

    assert "结果是 5" in result
    assert seen_tools == ["add"]
    # 第二次请求应包含 tool_result，且 id 与 tool_use 对应
    second_request_messages = client.requests[1]["messages"]
    tool_result = second_request_messages[-1]["content"][0]
    assert tool_result["type"] == "tool_result"
    assert tool_result["tool_use_id"] == "tu_1"
    assert tool_result["content"] == "5"


def test_tool_error_is_returned_to_model():
    registry = ToolRegistry()

    @tool
    def boom() -> str:
        """总是失败。"""
        raise RuntimeError("炸了")

    registry.register(boom)

    responses = [
        message([tool_use_block("tu_1", "boom", {})], "tool_use"),
        message([text_block("工具失败了，我换个方式。")], "end_turn"),
    ]
    agent, client = make_agent(responses, registry)
    agent.run("试试")

    tool_result = client.requests[1]["messages"][-1]["content"][0]
    assert tool_result["is_error"] is True
    assert "炸了" in tool_result["content"]


def test_refusal_is_handled_before_reading_content():
    agent, _ = make_agent([message([], "refusal")])
    result = agent.run("...")
    assert "拒绝" in result


def test_streaming_callback_receives_text():
    agent, _ = make_agent([message([text_block("流式输出")], "end_turn")])
    chunks: list[str] = []
    agent.run("hi", on_text=chunks.append)
    assert "".join(chunks) == "流式输出"
