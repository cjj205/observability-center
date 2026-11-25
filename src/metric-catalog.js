/**
 * A2A-T 指标字典 — observability-sdk-java 信号目录（v1.0.0）的 15 个指标及属性明细。
 * 来源：src/main/resources/observability/{a2at,agent,workflow}.yaml。
 * prom 为入 Prometheus 后的序列名（`.`→`_`，counter 加 `_total`；histogram 产出
 * _bucket/_sum/_count）。dim 为详情页维度页签归属：
 *   message  → A2A-T 消息（3 个）
 *   workflow → 协作工作流（7 个）
 *   agent    → Agent（5 个）
 * desc 为信号含义说明。
 */

const ATTR = (key, otel, type, required, values) => ({ key, otel, type, required, values });

export const METRIC_GROUPS = [
    {
        group: 'A2A 协议级',
        source: 'a2at.yaml',
        metrics: [
            {
                name: 'gen_ai.client.operation.duration',
                prom: 'gen_ai_client_operation_duration_avg',
                type: 'histogram', unit: 's', dim: 'message', used: true,
                desc: 'A2A 协议操作耗时：一次 A2A 协议操作（SendMessage 发送消息、GetTask 查询任务等）从发起到响应完成的耗时，反映智能体间协作通信的效率。',
                attributes: [
                    ATTR('operation.name', 'gen_ai.agent.a2a.operation.name', 'string', true),
                    ATTR('gen_ai.system', 'gen_ai.system', 'string', false, ['A2A']),
                    ATTR('error.type', 'error.type', 'string', false),
                ],
            },
            {
                name: 'gen_ai.agent.a2a.streaming.duration',
                prom: 'gen_ai_agent_a2a_streaming_duration_avg',
                type: 'histogram', unit: 's', dim: 'message', used: false,
                desc: 'A2A 流式传输耗时：流式消息（SendStreamingMessage）从开始到结束的持续时长，反映流式回传的及时性与连续性。',
                attributes: [
                    ATTR('operation.name', 'gen_ai.agent.a2a.operation.name', 'string', true),
                    ATTR('gen_ai.system', 'gen_ai.system', 'string', false, ['A2A']),
                    ATTR('error.type', 'error.type', 'string', false),
                ],
            },
        ],
    },
    {
        group: 'notification-t 通知扩展',
        source: 'a2at.yaml',
        metrics: [
            {
                name: 'gen_ai.agent.a2at.notification.count',
                prom: 'gen_ai_agent_a2at_notification_count_total',
                type: 'counter', unit: '', dim: 'message', used: false,
                desc: '通知次数：协作过程中通过 notification-t 扩展发出的通知数量，按通知主题（fault-alert 告警、progress-report 进度等）累计，反映对外通告的频率。',
                attributes: [
                    ATTR('notification.topic', 'gen_ai.agent.a2at.notification.topic', 'string', false),
                ],
            },
        ],
    },
    {
        group: 'task-t 任务扩展',
        source: 'a2at.yaml',
        metrics: [
            {
                name: 'gen_ai.agent.a2at.task.duration',
                prom: 'gen_ai_agent_a2at_task_duration_avg',
                type: 'histogram', unit: 'ms', dim: 'workflow', used: true,
                desc: '协作任务时长：一个 A2A-T 协作任务（task-t）从创建到完成的端到端处理时长，是衡量多智能体协作效率的核心指标。',
                attributes: [
                    ATTR('task.type', 'gen_ai.agent.a2at.task.type', 'string', true),
                    ATTR('task.object', 'gen_ai.agent.a2at.task.object', 'string', false),
                ],
            },
            {
                name: 'gen_ai.agent.a2at.task.count',
                prom: 'gen_ai_agent_a2at_task_count_total',
                type: 'counter', unit: '', dim: 'workflow', used: true,
                desc: '协作任务计数：累计处理的协作任务数量，按任务类型与任务对象（runId）维度累计，反映协作吞吐量。',
                attributes: [
                    ATTR('task.type', 'gen_ai.agent.a2at.task.type', 'string', true),
                    ATTR('task.object', 'gen_ai.agent.a2at.task.object', 'string', false),
                ],
            },
        ],
    },
    {
        group: 'negotiation-t 谈判扩展',
        source: 'a2at.yaml',
        metrics: [
            {
                name: 'gen_ai.agent.a2at.negotiation.rounds',
                prom: 'gen_ai_agent_a2at_negotiation_rounds_avg',
                type: 'histogram', unit: '{round}', dim: 'workflow', used: false,
                desc: '谈判轮次：一次多智能体协商（negotiation-t）达成结果所经历的轮次数，轮次越多说明达成一致的代价越高。',
                attributes: [
                    ATTR('negotiation.id', 'gen_ai.agent.a2at.negotiation.id', 'string', false),
                    ATTR('negotiation.result', 'gen_ai.agent.a2at.negotiation.result', 'string', false),
                ],
            },
            {
                name: 'gen_ai.agent.a2at.negotiation.count',
                prom: 'gen_ai_agent_a2at_negotiation_count_total',
                type: 'counter', unit: '', dim: 'workflow', used: false,
                desc: '谈判计数：累计发生的协商数量，按协商结果（agree 达成 / reject 拒绝等）统计，反映协商成败分布。',
                attributes: [
                    ATTR('negotiation.result', 'gen_ai.agent.a2at.negotiation.result', 'string', false),
                ],
            },
        ],
    },
    {
        group: '工作流信号',
        source: 'workflow.yaml',
        metrics: [
            {
                name: 'gen_ai.agent.a2at.workflow.duration',
                prom: 'gen_ai_agent_a2at_workflow_duration_avg',
                type: 'histogram', unit: 'ms', dim: 'workflow', used: false,
                desc: '工作流时长：一条工作流从启动到结束的总时长，按工作流类型与状态（completed/failed）统计，反映流程级执行效率。',
                attributes: [
                    ATTR('workflow.type', 'gen_ai.agent.a2at.workflow.type', 'string', true),
                    ATTR('workflow.status', 'gen_ai.agent.a2at.workflow.status', 'string', true),
                ],
            },
            {
                name: 'gen_ai.agent.a2at.workflow.count',
                prom: 'gen_ai_agent_a2at_workflow_count_total',
                type: 'counter', unit: '', dim: 'workflow', used: false,
                desc: '工作流计数：累计执行的工作流数量，按类型与状态统计，反映工作流吞吐与成败分布。',
                attributes: [
                    ATTR('workflow.type', 'gen_ai.agent.a2at.workflow.type', 'string', true),
                    ATTR('workflow.status', 'gen_ai.agent.a2at.workflow.status', 'string', true),
                ],
            },
            {
                name: 'gen_ai.agent.a2at.step.duration',
                prom: 'gen_ai_agent_a2at_step_duration_avg',
                type: 'histogram', unit: 'ms', dim: 'workflow', used: false,
                desc: '工作流步骤耗时：工作流内单个步骤由负责智能体完成的耗时，用于横向对比各步骤、定位慢步骤。',
                attributes: [
                    ATTR('workflow.step', 'gen_ai.agent.a2at.workflow.step', 'string', true),
                    ATTR('gen_ai.agent.name', 'gen_ai.agent.name', 'string', true),
                ],
            },
        ],
    },
    {
        group: 'Agent 信号',
        source: 'agent.yaml',
        metrics: [
            {
                name: 'gen_ai.agent.a2at.substep.duration',
                prom: 'gen_ai_agent_a2at_substep_duration_avg',
                type: 'histogram', unit: 'ms', dim: 'agent', used: false,
                desc: '子步骤耗时：智能体内部子步骤（substep）的处理时长，按智能体与子步骤名统计，用于细粒度定位智能体内部的性能瓶颈。',
                attributes: [
                    ATTR('gen_ai.agent.name', 'gen_ai.agent.name', 'string', true),
                    ATTR('substep.name', 'gen_ai.agent.a2at.substep.name', 'string', true),
                ],
            },
            {
                name: 'gen_ai.client.token.usage',
                prom: 'gen_ai_client_token_usage_total',
                type: 'counter', unit: 'token', dim: 'agent', used: false,
                desc: 'Token 用量：智能体调用 LLM 消耗的 token 数，按智能体、请求模型与 token 类型（input 输入 / output 输出）累计，用于成本核算与模型效率评估。',
                attributes: [
                    ATTR('gen_ai.agent.name', 'gen_ai.agent.name', 'string', true),
                    ATTR('gen_ai.request.model', 'gen_ai.request.model', 'string', true),
                    ATTR('gen_ai.token.type', 'gen_ai.token.type', 'string', true),
                ],
            },
        ],
    },
    {
        group: 'authorization-t 授权扩展',
        source: 'a2at.yaml',
        metrics: [
            {
                name: 'gen_ai.agent.a2at.authorization.preauthorize.count',
                prom: 'gen_ai_agent_a2at_authorization_preauthorize_count_total',
                type: 'counter', unit: '', dim: 'agent', used: false,
                desc: '预授权次数：操作执行前按授权策略完成的预授权检查次数，按策略操作类型（read/write）统计，反映安全管控强度。',
                attributes: [
                    ATTR('authorization.policy.operation.type', 'gen_ai.agent.a2at.authorization.policy.operation.type', 'string', false),
                ],
            },
            {
                name: 'gen_ai.agent.a2at.authorization.preauthorize.duration',
                prom: 'gen_ai_agent_a2at_authorization_preauthorize_duration_avg',
                type: 'histogram', unit: 'ms', dim: 'agent', used: false,
                desc: '预授权耗时：单次预授权策略检查的处理时长，反映授权链路对操作时延的额外开销。',
                attributes: [
                    ATTR('authorization.policy.operation.type', 'gen_ai.agent.a2at.authorization.policy.operation.type', 'string', false),
                ],
            },
            {
                name: 'gen_ai.agent.a2at.authorization.execute.count',
                prom: 'gen_ai_agent_a2at_authorization_execute_count_total',
                type: 'counter', unit: '', dim: 'agent', used: false,
                desc: '授权执行次数：完成授权后实际执行的操作次数，与预授权次数对比可看出授权通过率。',
                attributes: [
                    ATTR('authorization.policy.operation.type', 'gen_ai.agent.a2at.authorization.policy.operation.type', 'string', false),
                ],
            },
        ],
    },
];

export const METRIC_TOTAL = METRIC_GROUPS.reduce((a, g) => a + g.metrics.length, 0);
