"""最小上手示例：注册一个自定义工具，跑一次 Agent 循环。

运行前先设置 ANTHROPIC_API_KEY，然后：

    python examples/quickstart.py
"""

from pathlib import Path

from agent_core import Agent, AgentConfig, tool
from agent_core.tools.builtin import default_registry


# 自定义工具就是一个普通函数：类型注解生成参数 Schema，docstring 生成描述
@tool
def get_weather(city: str) -> str:
    """查询指定城市的当前天气（示例数据）。

    Args:
        city: 城市名，如 "上海"
    """
    fake_db = {"北京": "晴，26°C", "上海": "小雨，22°C", "深圳": "多云，29°C"}
    return fake_db.get(city, f"{city}：暂无数据")


def main() -> None:
    config = AgentConfig.from_env()
    config.workspace = Path("./workspace")
    config.workspace.mkdir(exist_ok=True)

    registry = default_registry(config.workspace)
    registry.register(get_weather)

    agent = Agent(config=config, registry=registry)
    answer = agent.run(
        "上海今天天气怎么样？顺便帮我算一下 365 * 24 等于多少。",
        on_text=lambda t: print(t, end="", flush=True),
        on_tool_use=lambda name, args: print(f"\n[工具] {name}({args})"),
    )
    print("\n\n最终回复：", answer)


if __name__ == "__main__":
    main()
