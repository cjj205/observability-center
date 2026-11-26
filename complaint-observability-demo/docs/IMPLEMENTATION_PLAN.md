# 企业专线投诉处理可观测 Demo 实现方案

## 1. 目的与边界

本 Demo 以 observability-sdk-java PR #29 的 `Complaint Handling` PSOP 为业务基线，验证以下链路可以在同一次运行中被串起来：

1. Workflow Engine Java SDK 读取并执行 PSOP。
2. Workflow 控制点根据步骤选择本地处理或远程 Agent。
3. A2A-T Java SDK 生成并校验 Task-T 提示词。
4. MockAgent 返回固定、可重复的业务结果。
5. Observability Java SDK 创建 workflow、step、Task-T client/server、log、metric 信号。
6. 运行报告保存业务终态、引擎事件、Agent 处理记录和关联 ID。

首个里程碑采用单 JVM、内存版 `WorkflowEngineClient`，保证离线可运行并先验证业务与 SDK 边界。随后加入同 JVM 的四角色 HTTP 验证，再把相同的 AgentCard、HTTP server 和任务处理器拆到四个独立 JVM。Collector 和三类存储查询单列为环境相关验收；当前已通过 WSL2 Ubuntu Docker Engine 验证，不把 `otelFlush` 直接当作存储确认。

## 2. 场景和执行路径

PSOP 的 workflow ID 为 `1d4c367d-9f0c-4400-85d2-caaf21ee37af`，保留七个主步骤：

| 步骤 | 角色/技能 | 结果 |
| --- | --- | --- |
| step1 | WAIMO / 投诉受理 | 固定工单、专线和 A/Z 端信息 |
| step2 | WAIMO / 投诉识别 | SLA 劣化分类 |
| step3 | WAIMO / 定界定位 | 传输大网问题，解析 Transport 路由 |
| step4 | Transport / 根因定位 | West、East 两个诊断任务并发，等待双端汇总 |
| step5 | Transport / 问题处置 | 授权成功后模拟抢通；授权拒绝时终止 |
| step6 | Transport / 修复验证 | 校验带宽、时延和丢包恢复序列 |
| step7 | WAIMO / 投诉报结 | SLA 校验通过后完成报结 |

演示提供两个 case：

- `success`：七步完成，step4 的 West/East 执行窗口应重叠，step7 生成最终状态。
- `authorization-denied`：执行到 step5，记录 `authorization.denied`，不进入 step6 和 step7。

## 3. 组件职责和替换点

```text
DemoMain / RoleMain / HostMain
  ├─ ExecutePsop + ComplaintControlPoint
  ├─ transport=memory: InMemoryWorkflowEngineClient  ──> MockAgentRouter
  ├─ transport=http: HttpDemoRuntime
  │                    ├─ DefaultWorkflowEngineClient + A2ATransport
  │                    └─ HttpMockAgentServer × 4 ──> MockAgentRouter
  │                                      ├─ WAIMO 本地步骤
  │                                      ├─ Transport 处置/汇总
  │                                      └─ West/East 并发诊断
  ├─ TaskTCodec
  │    ├─ A2A-T client orchestrator
  │    └─ A2A-T server orchestrator
  └─ ObservabilitySdk
       ├─ WorkflowObservability
       ├─ Task-T client/server span
       ├─ logRecord
       └─ metric

四 JVM 脚本以 `RoleMain` 启动 WAIMO、Transport、West、East；`HostMain` 提供单 JVM 的 `POST /runs` 和 `GET /runs/{run_id}`。
```

### 3.1 `DemoMain`

负责加载 PSOP、创建 Observability 生命周期、拼装 `ExecutePsop`、消费事件回调并写出 `artifacts/<run_id>.json`。`demo.otel.enabled=false` 时仍创建业务信号，但不要求外部 Collector；启用时由环境变量配置 OTLP endpoint。

### 3.2 `ComplaintControlPoint`

负责把引擎步骤转换为本地处理、远程任务或路由决策。远程任务的业务输入包含 `run_id`、工单、步骤、子任务 UUID 和操作字段；返回值保存 task/context/trace 关联信息。

### 3.3 `InMemoryWorkflowEngineClient`

实现 Workflow Engine 需要的 `WorkflowEngineClient` 接口。它异步调用 `MockAgentRouter`，并发诊断使用独立 executor。`http` 模式保留同一个接口，由 `HttpWorkflowEngineClient` 装饰官方 `DefaultWorkflowEngineClient`，只负责把 A2A 失败响应中的演示错误码恢复到引擎结果。

### 3.4 `MockAgentRouter`

用 `src/main/resources/mockagent/agent-mapping.json` 将 PR #29 的 Agent/skill 名称映射到 openan-demo/mockagent 的 AgentCard。主投诉流程使用 Java 固定 fixture，以便在没有 Python/FastAPI 和 LLM 的环境运行；`MockAgentInteropMain` 和 `run-mockagent-interop.ps1` 另外启动锁定版本的 Python gateway，验证真实 AgentCard、Task-T 和 A2A HTTP 回包。这样先把 Java 主流程保持确定性，再给后续替换 Router 留出实证边界。

### 3.5 `TaskTCodec` 和 `StaticLlmClient`

`TaskTCodec` 对每个远程任务执行 client 端提示词生成和 server 端合规校验。`StaticLlmClient` 只根据 schema 返回确定性 JSON，不访问外部模型，因此 demo 不需要 API key。切换真实模型时，只替换 LLM client 和配置，不改任务消息格式。

### 3.6 `HttpMockAgentServer`、`HttpDemoRuntime`、`RoleMain` 和 `MockAgentInteropMain`

`HttpMockAgentServer` 为每个角色创建一张 AgentCard、一个 A2A Java `RestHandler`、内存任务存储和 `AgentExecutor`。请求进入 executor 后，先提取 `traceparent`，再交给同一套 `MockAgentRouter`。`HttpDemoRuntime` 先启动 West/East，再把它们的卡片交给 Transport 内部 client，最后启动 Transport 和 WAIMO；关闭时按反向顺序释放两个 A2A transport 和四个 server。`RoleMain` 以同样的卡片和 client 参数启动独立角色，`start-four-jvm.ps1` 负责等待 AgentCard，`stop-four-jvm.ps1` 通过管理端点请求有序退出。

`MockAgentInteropMain` 不参与主流程的固定分支，它读取真实 Python gateway 的 AgentCard，使用 `TaskTCodec` 生成 Task-T 消息，再通过同一套 `SocketA2AJavaClientRuntime` 发出 `message:send`。Python MockAgent 当前版本返回的历史消息可能缺少 `messageId`；Java HTTP 兼容层只在响应对象缺少该字段时补齐 UUID，保留其余协议内容和数据集回包。

## 4. Task-T 和 A2A 消息约定

每个远程任务至少带有以下业务字段：

```json
{
  "run_id": "complaint-success-001",
  "workflow_id": "1d4c367d-9f0c-4400-85d2-caaf21ee37af",
  "step": "step4",
  "subtask_id": "...",
  "agent": "Transport Complaint Agent",
  "skill": "Root Cause Diagnosis",
  "operation": "diagnose"
}
```

协议层的 `task_id`、`context_id`、trace ID 与 PSOP ID、引擎 execution ID、业务 `run_id` 分开保存。这样可以用业务 ID 查报告，再用协议 ID 和 trace ID 查观测数据。

当前单 JVM 的 A2A-T client/server 是真实 SDK 编排器；`memory` 模式使用内存 client，`http` 模式使用 A2A Java SDK 的 `A2ATransport` 和 `DefaultWorkflowEngineClient`，通过四张 AgentCard 访问内嵌 HTTP 服务。四 JVM 模式复用同一套 AgentCard、Task-T 消息和 HTTP client，把 WAIMO、Transport、West、East 拆到四个 Java 进程。入口先创建 `a2at.workflow` parent span，供 Workflow Engine 的异步 dispatch 线程使用；嵌套任务按 `task_id` 保存调用方 span，跨到 SDK worker 后再恢复。HTTP client 在没有当前有效 span 时以对应 parent 创建 A2A client span，已有当前 span 时保留当前父级。出站注入 W3C `traceparent`，服务端 AgentExecutor 入口提取并建立当前上下文；Jaeger 中 engine workflow/step 与 A2A 链路共享同一条 trace，A2A client → A2A server → nested task 的直接父子关系继续保留。

## 5. 观测信号设计

信号命名和字段以当前锁定 SDK 的 `workflow.yaml`、`a2at.yaml`、`agent.yaml` 为准，避免写入 schema 未允许的属性。

### 5.1 Workflow 和 step

- Workflow 开始、结束、错误由 `WorkflowObservability` 负责。
- 每个主步骤保留 `run_id`、`step`、Agent、技能和状态。
- 引擎事件回调保存 `task.send`、`task.complete`、`task.error` 等事件摘要。

### 5.2 Task-T / A2A-T

- client/server span 名称使用 SDK 规范的 `SendMessage`。
- 允许的扩展属性包括 `extension.name=task-t`、`task.type`、`task.object`，并保留 `task_id`、`context_id`、`gen_ai.agent.name` 等基础字段。
- 日志同时写协议扩展字段和通用业务字段（`run_id`、`step`、`agent`、`status`），方便 OpenSearch 反查运行。
- 指标使用 SDK 允许的 `task.type`、`task.object` 维度；不写入未经 schema 声明的自定义属性。

### 5.3 并发和失败证据

- West/East 诊断各有独立 span 和 Agent 记录，报告验证 `latestStart < earliestFinish`。
- 授权拒绝记录错误码 `authorization.denied`，报告验证没有 step6/step7。
- OTLP `flush` 结果只说明 SDK 尝试完成导出；存储查询必须单独验证。

## 6. 运行报告和脚本

报告至少包含：`runId`、`case`、`workflowId`、`success`、`error`、`history`、`stepOutputs`、`events`、`agentRecords`、`observabilityEnabled` 和 `otelFlush`。

脚本职责如下：

| 脚本 | 用途 |
| --- | --- |
| `bootstrap.ps1` | 拉取/准备锁定的 SDK 源码，安装 Workflow Engine snapshot，执行测试 |
| `run.ps1` | 运行 success 或 authorization-denied case，可选 `-Transport memory|http` 和 OTLP |
| `verify.ps1` | 检查七步成功路径、诊断并发、HTTP Agent URL 和授权拒绝路径 |
| `start-four-jvm.ps1` / `stop-four-jvm.ps1` | 启停四个独立角色进程，保存 PID、AgentCard URL 和日志路径 |
| `run-four-jvm.ps1` | 依次等待四个 AgentCard 就绪、等待根报告、停止角色并调用多进程验收 |
| `verify-multiprocess.ps1` | 检查四个角色报告、跨进程诊断并发、授权拒绝和下游终止 |
| `run-mockagent-interop.ps1` | 在隔离 Python venv 中启动锁定的 MockAgent gateway，并运行 Java Task-T/A2A 互通探针 |
| `start.ps1` / `stop.ps1` | 启停 observability-sdk-java 的 local-storage Compose |
| `verify-storage.ps1` | 查询 Prometheus、Jaeger、OpenSearch，确认三类存储收到本次运行信号，校验 trace 的 parentSpanId 关系，并保存原始 JSON |

## 7. 分阶段实现顺序

### Milestone 1：离线单 JVM（已完成）

验收条件：

1. Workflow Engine 成功读取 PR #29 PSOP。
2. Task-T client/server 校验通过，无外部 LLM 请求。
3. success 报告七步完成，诊断两端重叠。
4. authorization-denied 报告在 step5 停止。
5. Java 单元测试和 PowerShell 验收脚本返回零。

### Milestone 2：真实 HTTP A2A（内嵌四角色，已完成）

`HttpMockAgentServer` 使用 `ServerSocket` 接收 HTTP/1.1，再调用 A2A Java SDK `RestHandler` 生成 AgentCard 和 `message:send` 响应。选择这个轻量 HTTP host 是因为当前 Windows/Java 21 环境创建 JDK `HttpServer` 会触发 loopback pipe 异常；请求仍是普通 HTTP，JSON 编解码、任务状态和错误响应由 A2A SDK 处理。`HttpDemoRuntime` 启动 West、East、Transport、WAIMO 四个角色，Workflow Engine 通过 `DefaultWorkflowEngineClient` 访问 WAIMO/Transport，Transport 内部再以另一个 `DefaultWorkflowEngineClient` 并发访问 West/East。

`SocketA2AJavaClientRuntime` 直接构造官方 `RestTransport`，将 A2A Java SDK 的 HTTP 接口替换为基于 `HttpURLConnection` 的实现，以适配该受限主机。这个替换只影响 socket I/O，不改变 AgentCard、Task-T 消息、Task 状态和 A2A JSON 结构。

验收条件：

1. 服务端 AgentCard 可从调用方访问。
2. Transport → West/East 的请求/响应通过 HTTP 完成。
3. 请求头能提取并延续 `traceparent`。
4. 拆分前后的业务报告一致，失败路径仍在 step5 终止。

### Milestone 3：四 JVM 和存储（已完成）

四 JVM 部分使用同一个 Maven 应用按角色启动四个 JVM，配置不同 `service.name`，并按顺序等待四个 AgentCard。`scripts/start.ps1` 在 Windows Docker CLI 不可用时调用 WSL2 Ubuntu 的 Docker Compose，并保持一个临时 WSL 会话；运行后按 run ID 查询 Trace、Log、Metric，并保存原始查询 JSON。Jaeger 2.23 使用 `/api/v3/trace-summaries` 查询接口，Metric 使用 `gen_ai_agent_a2at_workflow_count_total`。

验收条件：

1. 每个角色有独立 service name 和独立进程报告。已用 success/authorization-denied 两条路径验收。
2. A2A-T span 按 `service.name`、Agent log 按 `run_id`、workflow metric 按 `service_name` 从存储端关联；脚本会把查询响应写入 `artifacts/<run_id>.storage.json`。已用 `wsl-storage-success-20261126` 和 `wsl-storage-denied-20261126` 验证。
3. 缺少某类信号时，业务执行结果与存储验收结果分别失败，便于定位。

### Milestone 4：宿主 API（已完成单 JVM 入口）

`HostMain` 提供 `GET /healthz`、`POST /runs`、`GET /runs/{run_id}` 和 `POST /admin/shutdown`。宿主一次只运行一个任务，以避免 `DemoMain` 的进程级传输属性互相覆盖；请求完成后仍复用 `artifacts/<run_id>.json` 报告。 `run-host.ps1` 负责启动、提交、轮询、关闭和业务验收，便于 UI 或自动化回归复用。

## 8. 风险和处理方式

- **版本漂移**：`sdk-lock.json` 保存提交；Workflow Engine 当前需要本地安装 snapshot，因为公开 0.1.1 不包含 Demo 使用的 observability builder。
- **schema 不一致**：所有自定义属性先查 SDK YAML；非法属性会导致信号被拒绝，不能仅以应用日志判断已上报。
- **内存调用被误判为 HTTP**：报告记录 `transportMode`；内嵌 HTTP 和四 JVM 报告分别标注 `http`、`multi-http`。
- **Collector 不可用**：离线模式默认关闭 exporter；启用模式保留 flush 状态和连接错误，不能把 flush 当作存储确认。Windows 没有 Docker CLI 时由 WSL2 fallback 脚本启动 local-storage。
- **跨线程上下文丢失**：Workflow Engine 当前版本在 task dispatch 使用异步边界，不能依赖 `Context.current()` 自动跨线程传递。Demo 入口保存 parent span，并在内存 client、HTTP runtime 中显式恢复；如果调用线程已有有效 span，则优先使用当前 span。
- **固定 fixture 与真实 Agent 差异**：先验证调用和观测骨架，再逐个替换为 official mockagent HTTP 服务，保留同一 AgentCard、技能名和错误码。

## 9. 当前交付物

- `README.md`：快速开始、当前状态、拓扑、验收说明。
- `pom.xml`：Java 17、Workflow Engine、A2A-T、A2A Java 和 Observability SDK 依赖。
- `src/main/java/`：Workflow、Task-T、MockAgent、A2A HTTP、Observability 接入和 `HostMain` 宿主 API。
- `src/main/resources/`：PR #29 PSOP、A2A-T 环境配置和 Agent 映射。
- `scripts/`：构建、运行、四 JVM、宿主 API、离线验收和存储验收脚本。
- `sdk-lock.json`：源码提交和 Maven 坐标记录。

