"""运行配置：全部支持环境变量覆盖，方便部署时调整。"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

DEFAULT_SYSTEM_PROMPT = """\
你是一个乐于助人的 AI 助手，可以调用工具来完成任务。

- 需要计算、读写文件、查询时间时，优先使用对应的工具而不是凭记忆猜测。
- 文件操作被限制在工作目录内，这是安全边界，不要尝试绕过。
- 回答简洁清晰，用用户使用的语言回复。"""


@dataclass
class AgentConfig:
    """Agent 的运行配置。

    所有字段都可以用环境变量覆盖（见 from_env）。
    """

    model: str = "claude-opus-5"
    # 流式请求下 max_tokens 同时约束思考 + 正文，给足余量
    max_tokens: int = 16000
    # 思考深度：low / medium / high / xhigh / max（claude-opus-5 默认思考开启）
    effort: str = "high"
    system_prompt: str = DEFAULT_SYSTEM_PROMPT
    # 文件类工具的沙箱根目录，所有读写都被限制在这个目录内
    workspace: Path = field(default_factory=lambda: Path("./workspace"))
    # 单轮对话中 Agent 循环的最大迭代次数，防止失控
    max_iterations: int = 20

    @classmethod
    def from_env(cls) -> "AgentConfig":
        cfg = cls()
        if v := os.environ.get("AGENT_MODEL"):
            cfg.model = v
        if v := os.environ.get("AGENT_MAX_TOKENS"):
            cfg.max_tokens = int(v)
        if v := os.environ.get("AGENT_EFFORT"):
            cfg.effort = v
        if v := os.environ.get("AGENT_WORKSPACE"):
            cfg.workspace = Path(v)
        return cfg
