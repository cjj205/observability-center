# Observability Query Service

面向 OpenAN Portal 的统一只读查询服务。它把 Prometheus、Jaeger 和 OpenSearch 的各自查询协议收敛为一份协作任务视图，Portal 不直接访问三类存储，也不保存其账号或地址。

## 第一阶段范围

- 以 `run_id` 为协作任务主键，返回 Portal 现有页面所需的任务列表和单个任务详情；
- Trace 从 Jaeger 读取，以 `run_id`、`gen_ai.agent.a2at.task.object` 和 `task_id` 定位；
- Metric 从 Prometheus 读取，以任务时间窗和受控的指标白名单聚合；
- Log 从 OpenSearch 读取，以 `run_id`/`task_id` 查询，并用 `trace_id`、`span_id` 关联到 Trace；
- 故障时返回分数据源状态，避免把“部分数据暂不可用”显示成“任务不存在”。

不包含写入、删除、原始 PromQL / DSL 透传、跨租户聚合和鉴权对接；这些需要 Portal 的身份与租户模型明确后再加入。

## 服务边界

```mermaid
flowchart LR
  Portal[OpenAN Portal 插件] -->|GET /api/v1/observability/tasks| Query[Observability Query Service]
  Query -->|PromQL 白名单| Prometheus[Prometheus / Thanos]
  Query -->|Trace API| Jaeger[Jaeger]
  Query -->|DSL 模板| OpenSearch[OpenSearch]
  Query -->|task dataset| Portal
```

## 接口

完整定义见 [openapi.yaml](openapi.yaml)。首批接口：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/healthz` | 服务及三类数据源连通性 |
| `GET` | `/api/v1/observability/tasks` | 按时间、状态、任务类型分页列出协作任务 |
| `GET` | `/api/v1/observability/tasks/{runId}` | 返回与 Portal `mock-collab-tasks.json` 兼容的单任务对象 |

详情响应保留 `sources` 字段：`ready`、`empty`、`unavailable` 或 `partial`。只有三类查询均成功且数据完整时，任务详情的 `partial` 为 `false`。

## 数据源配置

服务从环境变量读取地址和认证信息；密钥不进入前端包和 Git：

```text
OBS_PROMETHEUS_URL=http://prometheus:9090
OBS_JAEGER_URL=http://jaeger-query:16686
OBS_OPENSEARCH_URL=https://opensearch:9200
OBS_OPENSEARCH_INDEX=a2at-logs-v2
OBS_QUERY_TIMEOUT_MS=5000
```

实现时按以下顺序推进：先完成 Jaeger 任务列表与详情适配，再加入 OpenSearch 日志关联和 Prometheus 指标聚合，最后让 Portal 的 `__OPENAN_OBS_DATA_URL__` 改为本服务地址并增加登录态转发。
