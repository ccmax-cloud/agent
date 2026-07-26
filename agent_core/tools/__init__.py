"""工具系统：@tool 装饰器 + 工具注册表。

用法：

    from agent_core.tools import tool, ToolRegistry

    @tool
    def get_weather(city: str) -> str:
        \"\"\"查询指定城市的天气。

        Args:
            city: 城市名，如 "北京"
        \"\"\"
        return "晴，25°C"

    registry = ToolRegistry()
    registry.register(get_weather)

装饰器会根据函数签名（类型注解 + docstring）自动生成
Claude API 所需的 JSON Schema，无需手写。
"""

from __future__ import annotations

import inspect
import re
from dataclasses import dataclass, field
from typing import Any, Callable

# Python 类型 -> JSON Schema 类型
_TYPE_MAP: dict[type, str] = {
    str: "string",
    int: "integer",
    float: "number",
    bool: "boolean",
}


def _parse_docstring(doc: str | None) -> tuple[str, dict[str, str]]:
    """从 docstring 中提取工具描述和各参数的说明。

    约定使用 Google 风格：正文为描述，"Args:" 段落下每行 "参数名: 说明"。
    """
    if not doc:
        return "", {}
    doc = inspect.cleandoc(doc)
    parts = re.split(r"\n\s*Args:\s*\n", doc, maxsplit=1)
    description = parts[0].strip()
    param_docs: dict[str, str] = {}
    if len(parts) == 2:
        for line in parts[1].splitlines():
            m = re.match(r"\s*(\w+)\s*(?:\([^)]*\))?\s*:\s*(.+)", line)
            if m:
                param_docs[m.group(1)] = m.group(2).strip()
    return description, param_docs


def _build_schema(fn: Callable[..., Any]) -> tuple[str, dict[str, Any]]:
    """根据函数签名生成 (description, input_schema)。"""
    description, param_docs = _parse_docstring(fn.__doc__)
    sig = inspect.signature(fn)

    properties: dict[str, Any] = {}
    required: list[str] = []
    for name, param in sig.parameters.items():
        annotation = param.annotation
        json_type = _TYPE_MAP.get(annotation, "string")
        prop: dict[str, Any] = {"type": json_type}
        if name in param_docs:
            prop["description"] = param_docs[name]
        properties[name] = prop
        if param.default is inspect.Parameter.empty:
            required.append(name)

    schema = {
        "type": "object",
        "properties": properties,
        "required": required,
    }
    return description, schema


@dataclass
class Tool:
    """一个已注册的工具：函数本体 + 提供给模型的 Schema。"""

    fn: Callable[..., Any]
    name: str
    description: str
    input_schema: dict[str, Any]

    def to_api_dict(self) -> dict[str, Any]:
        """转换成 Claude API tools 参数所需的格式。"""
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": self.input_schema,
        }


def tool(fn: Callable[..., Any]) -> Tool:
    """把一个普通函数变成 Tool。描述来自 docstring，参数类型来自注解。"""
    description, schema = _build_schema(fn)
    return Tool(fn=fn, name=fn.__name__, description=description, input_schema=schema)


@dataclass
class ToolRegistry:
    """工具注册表：持有全部工具，负责查找和执行。"""

    _tools: dict[str, Tool] = field(default_factory=dict)

    def register(self, t: Tool | Callable[..., Any]) -> Tool:
        if not isinstance(t, Tool):
            t = tool(t)
        if t.name in self._tools:
            raise ValueError(f"工具重名: {t.name}")
        self._tools[t.name] = t
        return t

    def to_api_list(self) -> list[dict[str, Any]]:
        """全部工具的 API 格式列表（顺序稳定，利于 prompt cache 命中）。"""
        return [t.to_api_dict() for t in sorted(self._tools.values(), key=lambda t: t.name)]

    def execute(self, name: str, tool_input: dict[str, Any]) -> tuple[str, bool]:
        """执行工具，返回 (结果文本, 是否出错)。

        出错时不抛异常，而是把错误信息返回给模型，让它自行调整策略。
        """
        t = self._tools.get(name)
        if t is None:
            return f"错误：未知工具 {name!r}", True
        try:
            result = t.fn(**tool_input)
            return str(result), False
        except Exception as exc:  # noqa: BLE001 — 工具异常统一回传给模型
            return f"错误：{type(exc).__name__}: {exc}", True

    def __len__(self) -> int:
        return len(self._tools)

    def __contains__(self, name: str) -> bool:
        return name in self._tools
