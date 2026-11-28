# 协商、授权与通知故事线覆盖

本 Demo 采用 Case 2 的跨地市专线 SLA 劣化故事线：WAIMO 下发诊断，Transport 编排 A/Z 端 OMC 诊断；A 端发现缺少 VLAN/子接口信息后发起 Negotiation-T，Transport 提供 `cvlan=409` 后继续诊断。根因汇总后，Transport 依次执行授权校验和授权请求；授权成功后上报抢通方案、执行隧道调优、上报修复结果，并完成 SLA 验证。

## 协议与可观测信号

| 环节 | SDK 调用或传输 | Trace / Log | Metric |
| --- | --- | --- | --- |
| 诊断任务 | Task-T 提示生成 + A2A `SendMessage` | `extension.name=task-t`，任务、消息、上下文、角色、传输属性 | `task.duration`、`substep.duration` |
| 参数协商 | Negotiation-T 运行时创建协商 ID、首轮上下文 | `SendStreamingMessage-negotiation`；`negotiation.id`、轮次、最大轮次、performative、结果 | `negotiation.rounds`、`negotiation.count` |
| 授权校验 | Authorization-T 提示生成 + A2A `SendMessage` | `extension.name=authorization-t`，`authorization.stage=preauthorize` | `authorization.preauthorize.count`、`authorization.preauthorize.duration` |
| 授权请求 | Authorization-T 提示生成 + A2A `SendMessage` | `extension.name=authorization-t`，`authorization.stage=execute` | `authorization.execute.count` |
| 方案、结果和 SLA 通知 | Notification-T 提示生成 + A2A `SendMessage` | `extension.name=notification-t`，通知主题和推送 URL | `notification.count` |

成功路径会通过 Transport PSOP 的 `step7`（授权校验）和 `step8`（授权请求）。`authorization-denied` 场景在 `step8` 返回拒绝，因此 `step6` 之后的抢通与通知步骤不会执行。

协商产生在 Transport 的诊断处理过程内，并以诊断入口 span 为父 span。四 JVM 运行时，A2A HTTP 请求通过 W3C `traceparent` 传播上下文；跨 JVM 的入站 `SendMessage` 和 Transport workflow span 因而位于同一 trace。
