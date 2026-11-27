# 本地 Metrics、Trace、Log 查看指南

完整的信号覆盖范围、暂未覆盖项与全量检索命令见 [SIGNAL_COVERAGE.md](SIGNAL_COVERAGE.md)。

## 前提

在 demo 根目录启动存储并运行带遥测的案例：

```powershell
.\scripts\start.ps1
.\scripts\run-four-jvm.ps1 -Case success -RunId layered-storage-success-001 -EnableTelemetry
.\scripts\verify-storage.ps1 -Case success -RunId layered-storage-success-001 -ServiceName complaint-waimo
```

`run_id` 是业务报告和日志的直接关联键。Trace 则通过 `artifacts/<run_id>.storage.json` 中的 `trace.verification.traceIds` 与运行报告关联。

所有端口只绑定到 `127.0.0.1`，仅供本机查看。

## 只使用自带 Web 页面查看

启动存储并完成一次 `-EnableTelemetry` 运行后，可直接打开下列页面：

| 数据 | 页面 | 从页面查看全部当前 demo 信号的方法 |
| --- | --- | --- |
| Metrics | [Prometheus Graph](http://127.0.0.1:19090/graph) | 刚结束运行时，可在 Query 输入 `{__name__=~"gen_ai_.*"}` 查看当前样本；历史运行请使用下方 `last_over_time` 查询。 |
| Metrics（跨时间块） | [Thanos Query](http://127.0.0.1:11902/graph) | 使用与 Prometheus 相同的 PromQL；需要跨 Prometheus 时间块查询时使用。 |
| Trace | [Jaeger UI](http://127.0.0.1:16686/) | Service 依次选择四个 `complaint-*` 服务，Operation 保持 All，Lookback 选择本次运行的时间范围，点击 Find Traces。打开 WAIMO 的 `a2at.workflow` 记录后可展开同一调用链的所有 Span。 |
| Log | 无 | 默认 Compose 没有启动 OpenSearch Dashboards，因此没有可供浏览日志的内置页面；当前只能使用 OpenSearch REST API。 |

### Prometheus 页面操作

1. Prometheus 的 **Table 是即时查询**：它只返回当前评估时间前默认 5 分钟内有样本的时间序列。因此运行结束超过 5 分钟后，`{__name__=~"gen_ai_.*"}` 即使在库中已有历史数据，也会显示 `Empty query result`。
2. 查看最近 48 小时内所有已导出的 Metric 名称，在 Query 区输入以下 PromQL，点击 Execute，再切换到 Table：

   ```promql
   count by (__name__) (last_over_time({__name__=~"gen_ai_.*"}[48h]))
   ```

   它只返回名称和该名称的序列数，适合确认信号覆盖情况。
3. 查看最近 48 小时内每条具体业务序列及其最后一个值，输入：

   ```promql
   last_over_time({__name__=~"gen_ai_.*"}[48h])
   ```

   返回结果较多，可在表达式中限制到某个服务，例如：

   ```promql
   last_over_time({__name__=~"gen_ai_.*",service_name="complaint-waimo"}[48h])
   ```

4. 如果刚完成新的 demo 运行，可直接查询 `{__name__=~"gen_ai_.*"}`。切换到 Table，逐条展开结果，即可查看 Metric 名称、`service_name` 和业务维度。结果很多时，按以下查询分组查看更清晰：

   ```promql
   {__name__=~"gen_ai_agent_a2at_.*"}
   ```

   ```promql
   {__name__=~"gen_ai_client_.*"}
   ```

5. Histogram 的一次调用会显示 `_bucket`、`_count`、`_sum` 三类序列。查看调用次数选择 `_count`，查看耗时累计选择 `_sum`。
6. 在 Graph 的查询输入框中输入 `gen_ai_` 可使用自动补全逐个选择 Metric 名称；选择后再用标签筛选，例如 `{service_name="complaint-transport"}`。

### Histogram 怎么查

Histogram 的逻辑指标名不能直接用于 PromQL。Prometheus 会把它拆成三组时间序列：

| 后缀 | 含义 | 示例 |
| --- | --- | --- |
| `_count` | 已记录的调用次数 | `gen_ai_client_operation_duration_seconds_count` |
| `_sum` | 所有调用耗时之和 | `gen_ai_client_operation_duration_seconds_sum` |
| `_bucket` | 落在各个耗时上界内的累计次数 | `gen_ai_client_operation_duration_seconds_bucket` |

下面以 A2A `SendMessage` 调用耗时 `gen_ai_client_operation_duration_seconds` 为例。运行结束较久时，在每条表达式外层使用 `last_over_time(...[48h])` 查看最后一次的累计值；刚运行完成时可直接执行。

查看每个服务累计调用次数：

```promql
sum by (service_name) (gen_ai_client_operation_duration_seconds_count)
```

若本次运行已经结束超过 5 分钟，使用下面的历史查询：

```promql
sum by (service_name) (
  last_over_time(gen_ai_client_operation_duration_seconds_count[48h])
)
```

查看每个服务累计耗时，单位为秒：

```promql
sum by (service_name) (gen_ai_client_operation_duration_seconds_sum)
```

查看平均单次耗时，单位为秒：

```promql
sum by (service_name) (gen_ai_client_operation_duration_seconds_sum)
/
sum by (service_name) (gen_ai_client_operation_duration_seconds_count)
```

查看最近 5 分钟的 P95 调用耗时：

```promql
histogram_quantile(
  0.95,
  sum by (le, service_name) (
    rate(gen_ai_client_operation_duration_seconds_bucket[5m])
  )
)
```

由于本 demo 每次运行只持续数秒，且运行结束后不再持续产生新样本，`rate(...[5m])` 在旧数据上会为空。要分析历史单次运行的 bucket 分布，请先在 Prometheus 的 Graph 页面把 Evaluation time 调到运行时刻，或重新执行一次带 `-EnableTelemetry` 的 demo 后立刻查询。

其它耗时 Histogram 只需替换指标前缀和单位：

| 逻辑指标 | Prometheus 前缀 | 单位 |
| --- | --- | --- |
| workflow 耗时 | `gen_ai_agent_a2at_workflow_duration_milliseconds` | 毫秒 |
| step 耗时 | `gen_ai_agent_a2at_step_duration_milliseconds` | 毫秒 |
| Task-T 耗时 | `gen_ai_agent_a2at_task_duration_milliseconds` | 毫秒 |
| Agent 子步骤耗时 | `gen_ai_agent_a2at_substep_duration_milliseconds` | 毫秒 |
| 授权预校验耗时 | `gen_ai_agent_a2at_authorization_preauthorize_duration_milliseconds` | 毫秒 |

### Jaeger 页面操作

1. 打开 Jaeger UI，**不要保持 `All Services`**。它会包含 Jaeger 自己处理页面/API 请求的 Trace；结果中 `Services` 显示 `jaeger`，Trace Name 为 `jaeger: /api/...` 的行都不是 demo 数据。
2. Service 选择 `complaint-waimo`；Span Name 选择 `a2at.workflow`。如果下拉框未立即刷新，先选中 Service，等待 Span Name 下拉框加载后再选择。
3. Lookback 需要覆盖 demo 的实际运行时刻。刚结束运行可选 Last 1 hour；若运行结束较久，改选 Last 6 hours、Last 24 hours 或 Custom。
4. 点击 Find Traces。每一行表示一条完整调用链：Trace Name 是根 Span 名称，Services 是该调用链涉及的服务，Spans 是 Span 数，Duration 是端到端耗时，Start Time 是开始时刻。
5. 打开一条 `a2at.workflow` 记录，展开 `a2at.workflow`、`a2at.step.*` 与 `SendMessage`，可查看 WAIMO → Transport → West/East 的父子调用关系和每个 Span 的属性、事件与耗时。
6. 要检查某个角色实际收到的全部调用，返回 Search 页，Service 改为 `complaint-transport`、`complaint-west`、`complaint-east`，Span Name 保持 All，分别查询一次。
7. 授权拒绝案例选择 `authorization-denied` 的运行窗口，可看到失败的 `SendMessage` 与未继续执行的后续步骤。

### 日志页面的现状

OpenSearch 在默认栈中只作为日志和 Jaeger Trace 的存储后端；`http://127.0.0.1:19200/` 是 REST 根路径，返回 JSON 状态，并不是日志浏览页面。若希望在浏览器中按 `run_id`、`traceId`、`service.name` 交互检索日志，需要后续将 OpenSearch Dashboards 加入 Compose；在此之前，使用下文的 REST 查询即可获取全部日志。

## Metrics：Prometheus 和 Thanos

| 用途 | Web UI | API |
| --- | --- | --- |
| 实时本地 Metrics | [Prometheus Graph](http://127.0.0.1:19090/graph) | `http://127.0.0.1:19090/api/v1/query` |
| 跨时间块查询 | [Thanos Query](http://127.0.0.1:11902/graph) | `http://127.0.0.1:11902/api/v1/query` |

Prometheus 和 Thanos 查询语法相同。演示时优先在 Prometheus Graph 输入下列 PromQL：

```promql
gen_ai_agent_a2at_workflow_count_total
```

```promql
gen_ai_client_operation_duration_seconds_count
```

```promql
gen_ai_agent_a2at_substep_duration_milliseconds_count
```

```promql
gen_ai_agent_a2at_authorization_preauthorize_count_total
```

```promql
gen_ai_agent_a2at_notification_count_total
```

直方图在 Prometheus 中以 `_bucket`、`_count` 和 `_sum` 三类时间序列存储。因此查看调用次数时使用 `_count`；查看总耗时时使用 `_sum`；查看分位数时使用 `_bucket`。

PowerShell 查询示例：

```powershell
$query = [uri]::EscapeDataString('gen_ai_client_operation_duration_seconds_count')
Invoke-RestMethod "http://127.0.0.1:19090/api/v1/query?query=$query"
```

## Trace：Jaeger

打开 [Jaeger UI](http://127.0.0.1:16686/)。按以下顺序查看：

1. 在 Service 中选择 `complaint-waimo`。
2. 在 Operation 中选择 `a2at.workflow`。
3. 点击 Find Traces，打开本次运行对应的 Trace。
4. 展开 WAIMO workflow、Transport workflow、`a2at.step.*` 与 `SendMessage` span，检查 WAIMO → Transport → OMC 的调用层次；A/Z 两端诊断应是 Transport 下的并行分支。

Jaeger 原始 API：

```powershell
$service = [uri]::EscapeDataString('complaint-waimo')
Invoke-RestMethod "http://127.0.0.1:16686/api/v3/trace-summaries?query.serviceName=$service"
```

从响应取 `traceId` 后查询完整明细：

```powershell
Invoke-RestMethod 'http://127.0.0.1:16686/api/v3/traces/<traceId>'
```

## Log：OpenSearch

当前 local-storage Compose 部署 OpenSearch、Data Prepper 和日志索引，但没有部署 OpenSearch Dashboards。因此浏览日志有两种方式：

- 使用 PowerShell、curl、Postman 或 VS Code REST Client 调用 OpenSearch REST API；这是当前推荐方式。
- 后续如需图形化日志检索，可单独增加 OpenSearch Dashboards 服务；它不在默认 demo 栈内。

索引为 `a2at-logs-v2`。按一次运行查询：

```powershell
$body = @{
  size = 100
  sort = @(@{ observedTimestamp = @{ order = 'asc' } })
  query = @{ match = @{ 'attributes.run_id' = 'layered-storage-success-001' } }
} | ConvertTo-Json -Depth 8

Invoke-RestMethod `
  -Uri 'http://127.0.0.1:19200/a2at-logs-v2/_search' `
  -Method Post `
  -ContentType 'application/json' `
  -Body $body
```

常用索引检查：

```powershell
Invoke-RestMethod 'http://127.0.0.1:19200/_cat/indices?v'
```

## 三类数据如何对应

| 数据 | 主要筛选字段 | 从哪里取得 |
| --- | --- | --- |
| Metrics | `service_name`、指标维度、时间窗口 | 角色名固定为 `complaint-waimo`、`complaint-transport`、`complaint-west`、`complaint-east`。 |
| Trace | `serviceName`、`traceId`、span 名称 | `storage.json` 中的 trace verification，或在 Jaeger 从 WAIMO workflow 查询。 |
| Log | `attributes.run_id` | 执行命令给出的 `RunId`；也保存在根运行报告中。 |

演示时推荐顺序：先在 Prometheus 看 workflow count 和 A2A 时延，再在 Jaeger 展开同一调用链，最后用 `run_id` 在 OpenSearch 查每个任务的成功、失败和错误文本。
