# agent-scaffold · Claude Agent 基架

一个**简洁、可扩展的 Python Agent 基础框架**，帮助你理解并快速搭建自己的 AI Agent 应用。核心代码约 500 行，每一层都刻意写得清晰可读——它既是能直接用的脚手架，也是一份"Agent 到底是怎么工作的"教学材料。

## Agent 的本质：一个循环

所谓 Agent，核心就是下面这个循环：

```
用户输入
  └─> 调用模型（流式输出）
        ├─ 模型说"我要用工具" ──> 执行工具 ──> 把结果喂回去 ──> 再次调用模型 ─┐
        │        ▲                                                        │
        │        └────────────────────────────────────────────────────────┘
        └─ 模型说"我说完了" ──> 返回最终回复
```

本项目把这个循环拆成 4 个独立模块：

| 模块 | 文件 | 职责 |
|---|---|---|
| **Agent 循环** | `agent_core/agent.py` | 驱动 模型调用 → 工具执行 → 结果回填，处理各种停止原因 |
| **工具系统** | `agent_core/tools/` | `@tool` 装饰器把普通函数变成工具，自动生成 JSON Schema |
| **对话记忆** | `agent_core/memory.py` | 管理多轮消息历史，超长时安全裁剪 |
| **配置** | `agent_core/config.py` | 模型、token 上限、思考深度、沙箱目录，支持环境变量覆盖 |

外加一个终端交互层 `agent_core/cli.py`。

## 快速开始

```bash
# 1. 安装（建议先建虚拟环境）
pip install -e ".[dev]"

# 2. 配置 API Key
export ANTHROPIC_API_KEY=sk-ant-...   # 或复制 .env.example 为 .env

# 3. 启动交互式 CLI
agent          # 或 python -m agent_core.cli
```

试试这些输入：

```
你> 帮我算一下 (365 * 24 + 17) % 7
你> 把"明天要做的三件事"写进 todo.txt
你> 读一下 todo.txt，然后告诉我现在几点
```

你会看到模型的流式输出，以及每次工具调用的实时展示（`⚙ 调用工具 ...`）。

也可以直接跑最小示例：

```bash
python examples/quickstart.py
```

## 如何添加自己的工具

这是你最常做的扩展。工具就是一个普通函数——**类型注解生成参数 Schema，docstring 生成给模型看的说明**：

```python
from agent_core.tools import tool

@tool
def search_orders(keyword: str, limit: int = 10) -> str:
    """在订单系统中搜索订单。当用户询问订单状态、物流信息时调用。

    Args:
        keyword: 搜索关键词，如订单号或商品名
        limit: 最多返回的结果条数
    """
    ...  # 你的业务逻辑
    return "查询结果文本"
```

然后注册进去：

```python
registry = default_registry(workspace)
registry.register(search_orders)
agent = Agent(config=config, registry=registry)
```

写好工具描述很重要——模型完全靠描述来决定**什么时候**调用它，所以描述里最好写清触发条件（"当用户询问……时调用"）。

内置工具（`agent_core/tools/builtin.py`）展示了三种典型形态：

- `calculator` — 纯计算，用 AST 白名单求值，杜绝代码注入
- `read_file` / `write_file` / `list_files` — 有副作用的操作，**路径被强制限制在工作目录内**（resolve 后校验，防 `../` 逃逸）
- `current_time` — 环境信息查询

## 设计要点（读懂这些你就理解 Agent 框架了）

1. **完整回填历史**：模型返回的 `content`（包括 `tool_use`、`thinking` 块）必须原样追加进消息历史，`tool_result` 通过 `tool_use_id` 与调用一一对应，并且同一轮的所有工具结果合并在**一条** user 消息里——拆开会让模型学会不再并行调用工具。
2. **工具出错不抛异常**：把错误文本连同 `is_error: true` 返回给模型，让它自己调整策略（换参数重试、换方法、或告诉用户）。
3. **处理所有停止原因**：`end_turn`（正常结束）、`tool_use`（要执行工具）、`pause_turn`(服务端工具暂停，重发即续跑)、`refusal`（安全拒绝，content 可能为空，必须先于读取内容判断）、`max_tokens`（截断提示）。
4. **安全边界放在工具层**：模型的输出是不可信输入。文件路径要 resolve 后校验、表达式求值用 AST 白名单，而不是指望提示词约束。
5. **循环上限**：`max_iterations` 防止模型和工具互相"顶牛"造成无限循环。
6. **工具列表顺序稳定**（按名称排序）：请求前缀字节稳定才能命中 prompt cache。

## 配置

全部支持环境变量覆盖：

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `AGENT_MODEL` | `claude-opus-5` | 使用的模型 |
| `AGENT_MAX_TOKENS` | `16000` | 单次响应上限（含思考 token） |
| `AGENT_EFFORT` | `high` | 思考深度：low / medium / high / xhigh / max |
| `AGENT_WORKSPACE` | `./workspace` | 文件工具的沙箱根目录 |

## 运行测试

测试不需要 API Key——Agent 循环用假客户端（`FakeClient`）驱动，验证了工具调用、结果回填、错误处理、拒绝处理、流式回调等完整链路：

```bash
pytest
```

## 项目结构

```
agent_core/
├── __init__.py        # 包入口，导出 Agent / AgentConfig / tool / ToolRegistry
├── config.py          # 运行配置（环境变量覆盖）
├── agent.py           # ★ Agent 核心循环
├── memory.py          # 对话历史管理
├── cli.py             # 终端交互
└── tools/
    ├── __init__.py    # ★ @tool 装饰器 + 注册表（Schema 自动生成）
    └── builtin.py     # 内置工具：计算器、文件读写（沙箱）、时间
examples/quickstart.py # 最小上手示例（自定义工具）
tests/                 # 单元测试（无需 API Key）
```

## 下一步可以扩展的方向

- **流式思考展示**：请求中加 `thinking: {"type": "adaptive", "display": "summarized"}`，把模型的推理摘要也流式展示出来
- **长对话压缩**：接入服务端 compaction（beta `compact-2026-01-12`），自动摘要旧上下文，替代目前的简单裁剪
- **服务端工具**：在 `tools` 里加 `{"type": "web_search_20260209", "name": "web_search"}` 即可让 Agent 联网搜索（无需本地实现）
- **结构化输出**：用 `output_config.format` + JSON Schema 约束模型返回格式
- **危险操作确认**：给 `write_file` 这类工具加人工确认门（在 `ToolRegistry.execute` 里拦截）
- **换用 SDK 的 tool runner**：`client.beta.messages.tool_runner` 可以替代手写循环，本项目的 `@tool` 概念与其一致，迁移成本很低
