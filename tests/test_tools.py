"""工具系统测试：Schema 生成、注册表执行、内置工具的安全边界。"""

from pathlib import Path

import pytest

from agent_core.tools import ToolRegistry, tool
from agent_core.tools.builtin import calculator, default_registry, make_file_tools


def test_schema_generation():
    @tool
    def sample(name: str, count: int = 3) -> str:
        """示例工具的描述。

        Args:
            name: 名称参数
            count: 数量参数
        """
        return name * count

    assert sample.name == "sample"
    assert sample.description == "示例工具的描述。"
    schema = sample.input_schema
    assert schema["properties"]["name"] == {"type": "string", "description": "名称参数"}
    assert schema["properties"]["count"]["type"] == "integer"
    assert schema["required"] == ["name"]  # count 有默认值，不是必填


def test_registry_execute():
    registry = ToolRegistry()

    @tool
    def echo(text: str) -> str:
        """原样返回输入。"""
        return text

    registry.register(echo)
    output, is_error = registry.execute("echo", {"text": "hi"})
    assert (output, is_error) == ("hi", False)

    # 未知工具与执行异常都不抛出，而是把错误回传给模型
    output, is_error = registry.execute("nope", {})
    assert is_error and "未知工具" in output


def test_registry_rejects_duplicates():
    registry = ToolRegistry()
    registry.register(calculator)
    with pytest.raises(ValueError):
        registry.register(calculator)


def test_calculator():
    assert calculator.fn(expression="2 + 3 * (4 - 1)") == "11"
    with pytest.raises(ValueError):
        # 拒绝任何非算术表达式，防止代码注入
        calculator.fn(expression="__import__('os').system('ls')")


def test_file_tools_sandbox(tmp_path: Path):
    read_file, write_file, list_files = make_file_tools(tmp_path)

    write_file.fn(path="a/b.txt", content="hello")
    assert read_file.fn(path="a/b.txt") == "hello"
    assert "b.txt" in list_files.fn(path="a")

    # 越界路径必须被拒绝
    with pytest.raises(PermissionError):
        read_file.fn(path="../outside.txt")
    with pytest.raises(PermissionError):
        write_file.fn(path="/etc/evil", content="x")


def test_default_registry(tmp_path: Path):
    registry = default_registry(tmp_path)
    assert "calculator" in registry
    assert "read_file" in registry
    # API 列表顺序稳定（按名称排序），有利于 prompt cache 命中
    names = [t["name"] for t in registry.to_api_list()]
    assert names == sorted(names)
