# OpenAN Portal 插件：观测中心（Observation Center）

为 OpenAN Portal 提供的观测中心插件（manifest v1.17.2）。顶部导航栏为「**可观测中心**」
父菜单（下拉分组），下挂 2 个子菜单：

| 子菜单 | labelKey | order | 路由 | 内容 |
|---|---|---|---|---|
| 可观测中心 | `Observation Center` | 7 | `/observation` | **协作任务轨迹列表**（默认视图）→ 点开任务：左侧协作拓扑图 + 右侧三维度指标 |
| 三方可观测 | `Third-party Observability` | 8 | `/observation/third-party` | 3 张组件大卡片：**Langfuse / Grafana / Prometheus（普罗米修斯）** |

> 两个菜单项通过 `group: "Observation Center"` 折叠为门户 Header 的一个父菜单；
> 插件 bundle 加载时会把中英文文案注册进门户 i18n（zh：可观测中心 / 三方可观测）。
> 「三方可观测」菜单点击为门户内正常跳转；**点击卡片在新标签页打开对应组件页面**：
> Langfuse → 自部署站点（9012）；Grafana / Prometheus 待接入，先前往官网
> （grafana.com / prometheus.io），部署完成后把 `THIRD_PARTY_CARDS` 里的 `site`
> 换成控制台地址即可。

## 可观测中心：协作任务轨迹列表 → 拓扑 + 三维度指标

列表视图：汇总卡片（任务总数 / 成功率 / 平均耗时 / 参与智能体）+ 搜索/状态筛选 +
任务行（类型、参与智能体、开始时间、耗时、Span 数、状态）。点开任务进入详情：

- **左侧 · 协作拓扑图**：SVG 拓扑（协调智能体 → 参与智能体），边按 Trace Span 聚合——
  消息流（SendMessage ×N · 均耗时）、流式回传（SendStreamingMessage-event，虚线）、
  轮询（GetTask ×N）、异常节点/边标红；
- **右侧 · 三维度观测指标**（Tab 切换）：
  1. **A2A-T 消息** — 处理/发起消息数、平均消息耗时、流式事件、异常 span；
     A2A 协议操作指标（`gen_ai.client.operation.duration`，SendMessage/GetTask…，单位 s）；
     消息日志 `gen_ai.agent.a2at.message`（OpenSearch a2at-logs-v2 形态）；
  2. **协作工作流** — 任务计数 `gen_ai.agent.a2at.task.count`、任务时长均值/P95
     （`gen_ai.agent.a2at.task.duration` histogram·ms）、Span 数、轨迹瀑布图（Jaeger Trace）、
     真实栈 PromQL 查询串；
  3. **Agent** — 按智能体聚合：Span 数、处理消息、累计/平均耗时、负载占比
     （Span 耗时份额）、异常计数 + 智能体活动区间条。

Langfuse 内嵌视图已按需求移除；Langfuse 仍可从「三方可观测」页面的 Langfuse 卡片
「新窗口」直达（http://47.236.98.226:9012）。

### 详情页信息架构（两层页签）

详情页：左侧协作拓扑图**默认折叠**为 46px 左侧竖条（竖排「协作拓扑图」标签 + 「»」
展开按钮），点展开后占约 1/4 宽度（窄列）；窄屏下收起条转为横向。右侧为**顶层信号
页签：Metric → Trace → Log → 数据信号字典**，每个信号页签内 **A2A-T 消息 /
协作工作流 / Agent 三个维度区块直接纵向排布在同一页面**（维度区块带紫色标识头与说明）：

- **Metric**：采用 **Prometheus 式信息架构**（**观测信号选择**下拉 + 图表/表格 视图
  切换、指标浏览表），样式与门户现有设计语言一致：选中信号后展示**信号含义说明** +
  **折线图与直方图并排一行（等高紧凑卡片）**（按采集周期 15s、最近 2 小时窗口、当前
  任务时间带高亮；多维度指标为多系列）+ 两图下方**通栏 legend 表**（色标 + Prom
  序列名 + avg/max/last）+ **直方图面板**（8 个 histogram 类信号有 le 累计桶分布）；
  **查询结果表**列出全部 15 个信号（维度 / 类型 / 单位 / 当前采样值），点击行即切换
  图表，支持维度过滤。图表数据由 `scripts/gen-mock-tasks.mjs` 的 `collection` + `charts`
  （`lines` 15 条 / `histograms` 8 组）按信号一一对应生成；
- **Trace**：Span 挂接树（按 parentSpanID 父子嵌套 + 引导线，节点带类别徽章、
  内联时间条、耗时/状态），**点击 Span 行任意位置或「属性」按钮查看全部 tags**（operation.name、
  task_id、context_id、task.type/task.object、error.type 等），**每个 Span 可展开「关联日志」**，
  点击日志行任意位置或「属性」按钮查看 log_attributes 芯片**（log.spanID 上下文关联）；
  内联时间条、耗时/状态），节点带高亮 **spanID** 徽章（点击复制 ID 并同时选中该行）与**挂接的观测信号 ID 芯片**（gen_ai.agent.a2at.* 等，蓝色高亮可点击复制：根 Span 挂 task.duration/count、workflow.duration/count，SERVER Span 挂 substep/step.duration，流式 Span 挂 streaming.duration），每个 Span 的「**关联日志 N**」**默认展开**（可点收起，
  log.spanID 上下文关联）；同一 Trace 贯穿消息 / 工作流 / Agent 三个维度；
- **Log**（**三个维度区块共享右侧唯一一个属性查看器**，sticky 跟随滚动）：按维度区块展示日志（消息 `gen_ai.agent.a2at.message`；工作流
  `gen_ai.agent.a2at.workflow / .step`；Agent `gen_ai.agent.a2at.agent / .substep`）；
- **数据信号字典**：全部 15 个信号的定义与属性明细（OTel 名 + Prom 序列名、类型/单位、
  **含义说明**、属性名 / OTel 全名 / 类型 / 必填 / 取值），按维度分组（消息 3 / 工作流 7 /
  Agent 5）；采样值与图表见 Metric 页签。

真实栈接入后注入 `window.__OPENAN_OBS_DATA_URL__` 切换实时数据。

### 字体规范

可观测界面所有文字（含图表坐标轴、图例、徽章、属性表、拓扑节点标签等 SVG 文字）
字号一律 **≥ 12px**（拓扑 SVG 按渲染缩放做了补偿，渲染字号同样 ≥ 12px）。

### 数据源与真实栈接入路径

当前页面读取随插件打包的模拟数据集 `mock-collab-tasks.json`（由
`scripts/gen-mock-tasks.mjs` 在构建时按 **consumer-smoke 方式**生成，信号形状与
[observability-sdk-java](https://github.com/project-openan/observability-sdk-java) 存储栈
（deploy/local-storage：Prometheus+Thanos / OpenSearch+Data Prepper / Jaeger v2）一致：
trace=协作任务轨迹、metric=`gen_ai.agent.a2at.*`、log=`gen_ai.agent.a2at.message`）。

存储栈部署并通过 nginx 暴露查询 API 后，无需改组件：在门户页面注入

```js
window.__OPENAN_OBS_DATA_URL__ = '<真实数据端点>';
```

即可切换（组件按 Jaeger `/api/traces` + Prometheus `/api/v1` 形状消费）。
注意：门户服务器（47.236.98.226）磁盘已 100% 满、内存紧张，暂无法承载该存储栈，
需先清理磁盘或另选主机部署。

## Langfuse 地址

默认指向 `http://47.236.98.226:9012`（阿里云服务器 nginx 反代 Langfuse Web；9010~9020 已在安全组放行）。
如需覆盖，可在门户页面注入全局变量：

```js
window.__OPENAN_OBSERVATION_LANGFUSE_URL__ = 'http://<your-langfuse-host>:<port>';
```

## 三方可观测页面

菜单点击为门户内正常跳转；**点击卡片在新标签页打开对应组件页面**：

- **Langfuse**（开源 LLM 可观测平台，langfuse.com）— 状态「已接入」，点击卡片在
  **新页面打开门户自部署 Langfuse 站点**（默认 `http://47.236.98.226:9012`）。
- **Grafana**（开源可视化看板，grafana.com）— 状态「待接入」，点击卡片先前往官网；
  部署完成后把卡片 `site` 换成控制台地址。
- **Prometheus（普罗米修斯）**（开源指标采集/时序库/告警，prometheus.io）— 状态
  「待接入」，点击卡片先前往官网；同上。

品牌图标取自 Simple Icons 16.28.0（CC0，见 `src/brand-icons.js`）；Langfuse 卡片
使用 Lucide flame 描边图标。

## Langfuse 地址

默认指向 `http://47.236.98.226:9012`（阿里云服务器 nginx 反代 Langfuse Web；9010~9020 已在安全组放行）。
如需覆盖，可在门户页面注入全局变量：

```js
window.__OPENAN_OBSERVATION_LANGFUSE_URL__ = 'http://<your-langfuse-host>:<port>';
```

## 构建

```bash
npm install
npm run build:plugin     # 产物位于 dist-plugin/（index.js + index.css + plugin.manifest.json）
```

## 部署（门户服务器）

1. 将 `dist-plugin/` 上传到门户站点 `/plugins/observation-center/`：
   ```bash
   ssh root@47.236.98.226 'mkdir -p /OpenA2A-T/openan-portal-frontend/plugins/observation-center'
   scp dist-plugin/* root@47.236.98.226:/OpenA2A-T/openan-portal-frontend/plugins/observation-center/
   ```
2. 在门户主包 `assets/index-*.js` 的插件注册数组（`zu=[...]`）中追加：
   ```js
   {id:`observation-center`,mode:`bundle`,entry:`/plugins/observation-center`,enabled:!0}
   ```
3. 刷新门户页面，左侧菜单出现「指标观测」。

## 依赖

- Langfuse v2 自部署（本机 127.0.0.1:3000，nginx 9012 反代），PostgreSQL / ClickHouse / Redis 原生进程部署。
