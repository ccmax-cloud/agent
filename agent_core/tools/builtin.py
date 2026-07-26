"""内置示例工具：计算器、文件读写、时间查询。

这些工具展示了三种典型形态：
- 纯计算（calculator）
- 有安全边界的副作用操作（文件读写，限制在 workspace 内）
- 环境信息查询（current_time）

新增工具时照着这里的写法即可：普通函数 + 类型注解 + Google 风格 docstring。
"""

from __future__ import annotations

import ast
import operator
from datetime import datetime
from pathlib import Path

from agent_core.tools import Tool, ToolRegistry, tool

# ---------------------------------------------------------------- 计算器

_BIN_OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
}
_UNARY_OPS = {ast.UAdd: operator.pos, ast.USub: operator.neg}


def _safe_eval(node: ast.AST) -> float:
    """只允许数字和四则运算的表达式求值，杜绝任意代码执行。"""
    if isinstance(node, ast.Expression):
        return _safe_eval(node.body)
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return node.value
    if isinstance(node, ast.BinOp) and type(node.op) in _BIN_OPS:
        return _BIN_OPS[type(node.op)](_safe_eval(node.left), _safe_eval(node.right))
    if isinstance(node, ast.UnaryOp) and type(node.op) in _UNARY_OPS:
        return _UNARY_OPS[type(node.op)](_safe_eval(node.operand))
    raise ValueError(f"不支持的表达式节点: {type(node).__name__}")


@tool
def calculator(expression: str) -> str:
    """计算一个数学表达式，支持 + - * / // % ** 和括号。

    Args:
        expression: 数学表达式，例如 "2 + 3 * (4 - 1)"
    """
    result = _safe_eval(ast.parse(expression, mode="eval"))
    return str(result)


# ---------------------------------------------------------------- 时间


@tool
def current_time() -> str:
    """获取当前的日期和时间。"""
    return datetime.now().astimezone().strftime("%Y-%m-%d %H:%M:%S %Z")


# ---------------------------------------------------------------- 文件工具（沙箱化）


def make_file_tools(workspace: Path) -> list[Tool]:
    """生成绑定到指定工作目录的文件工具。

    所有路径先 resolve 再校验必须落在 workspace 内，
    防止模型通过 ../ 或绝对路径逃出沙箱。
    """
    workspace = workspace.resolve()

    def _resolve(relative_path: str) -> Path:
        p = (workspace / relative_path).resolve()
        if not p.is_relative_to(workspace):
            raise PermissionError(f"路径越界，只允许访问工作目录内的文件: {relative_path}")
        return p

    @tool
    def read_file(path: str) -> str:
        """读取工作目录内一个文本文件的内容。

        Args:
            path: 相对于工作目录的文件路径，如 "notes.txt"
        """
        return _resolve(path).read_text(encoding="utf-8")

    @tool
    def write_file(path: str, content: str) -> str:
        """在工作目录内创建或覆盖一个文本文件。

        Args:
            path: 相对于工作目录的文件路径
            content: 要写入的完整文件内容
        """
        p = _resolve(path)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content, encoding="utf-8")
        return f"已写入 {path}（{len(content)} 字符）"

    @tool
    def list_files(path: str = ".") -> str:
        """列出工作目录内某个子目录下的文件和文件夹。

        Args:
            path: 相对于工作目录的子目录路径，默认为工作目录本身
        """
        p = _resolve(path)
        if not p.exists():
            return "（目录不存在）"
        entries = sorted(p.iterdir(), key=lambda e: (e.is_file(), e.name))
        if not entries:
            return "（空目录）"
        return "\n".join(f"{'[目录] ' if e.is_dir() else ''}{e.name}" for e in entries)

    return [read_file, write_file, list_files]


def default_registry(workspace: Path) -> ToolRegistry:
    """组装默认工具集。新项目可以从这里增删工具。"""
    registry = ToolRegistry()
    registry.register(calculator)
    registry.register(current_time)
    for t in make_file_tools(workspace):
        registry.register(t)
    return registry
