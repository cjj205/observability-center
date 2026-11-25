/**
 * Generate the collaboration-task trace dataset for the Observation Center page.
 *
 * Shape mirrors the observability-sdk-java storage stack (deploy/local-storage):
 *   Trace   → Jaeger v2 (spans named per a2at.yaml: SendMessage / GetTask /
 *             SendStreamingMessage-event / SendStreamingMessage-end …)
 *   Metrics → Prometheus (gen_ai.agent.a2at.* / gen_ai.client.* — ALL 15 catalog
 *             metrics carry sampled values per task, consumer-smoke 方式)
 *   Logs    → gen_ai.agent.a2at.message log records
 *
 * Each task carries `signals`: sampled values for the metric catalog
 * ({ metric, prom, type, unit, samples: [{ value, attributes }] }), so the
 * 指标字典 can show 定义 + 当前值 together. Conditional signals (streaming /
 * negotiation / notification) are only sampled when the task triggered them.
 *
 * Output: dist-plugin/mock-collab-tasks.json
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist-plugin', 'mock-collab-tasks.json');

const hex = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
const rid = () => hex(32);
const sid = () => hex(16);

const NOW = Date.now();
const MIN = 60_000;
const HOUR = 3_600_000;

const AGENTS = {
    'coordinator-agent': '协调智能体',
    'fault-diagnosis-agent': '故障诊断智能体',
    'topology-agent': '拓扑分析智能体',
    'workbench-agent': '工单执行智能体',
    'capacity-agent': '容量分析智能体',
    'inspection-agent': '巡检执行智能体',
};

const TASK_TYPES = {
    'fault-diagnosis': '传输网故障诊断协作',
    'network-inspection': '核心网例行巡检协作',
    'service-provisioning': '专线业务开通协作',
    'emergency-drill': '应急切换演练协作',
    'capacity-analysis': '容量预警分析协作',
};

const STEP_NAMES = {
    'fault-diagnosis-agent': '故障定位',
    'topology-agent': '拓扑核查',
    'workbench-agent': '工单执行',
    'capacity-agent': '容量核算',
    'inspection-agent': '巡检执行',
    'coordinator-agent': '任务编排',
};

const MODELS = ['openan-llm-v3', 'deepseek-v3'];

function agentList(type, i) {
    const base = ['coordinator-agent'];
    const pools = {
        'fault-diagnosis': ['fault-diagnosis-agent', 'topology-agent', 'workbench-agent'],
        'network-inspection': ['inspection-agent', 'topology-agent', 'capacity-agent'],
        'service-provisioning': ['workbench-agent', 'topology-agent'],
        'emergency-drill': ['fault-diagnosis-agent', 'workbench-agent', 'topology-agent'],
        'capacity-analysis': ['capacity-agent', 'topology-agent', 'workbench-agent'],
    };
    const pool = pools[type] || ['topology-agent'];
    const count = 2 + (i % Math.min(2, pool.length));
    return base.concat(pool.slice(0, count));
}

/** Build the span tree of one collaboration task. */
function buildSpans(task, opts) {
    const spans = [];
    const total = task.durationMs;
    const rootId = sid();
    const ctxId = `ctx-${task.runId}`;
    spans.push({
        spanID: rootId,
        parentSpanID: null,
        operationName: 'SendMessage',
        kind: 'CLIENT',
        service: 'coordinator-agent',
        startOffsetMs: 0,
        durationMs: total,
        tags: {
            'gen_ai.agent.a2a.operation.name': 'SendMessage',
            'gen_ai.agent.a2a.task_id': task.taskId,
            'gen_ai.agent.a2a.context_id': ctxId,
            'gen_ai.agent.a2at.extension.name': 'task-t',
            'gen_ai.agent.a2at.task.type': task.taskType,
            'gen_ai.agent.a2at.task.object': task.runId,
            ...(opts.error ? { 'error.type': opts.error } : {}),
        },
        status: opts.error ? 'error' : 'ok',
    });

    let cursor = 60 + Math.floor(Math.random() * 80);
    const agents = task.agents.slice(1);
    agents.forEach((service, idx) => {
        const dur = Math.max(220, Math.floor(total / (agents.length + 1) * (0.5 + Math.random() * 0.9)));
        const fail = opts.error && idx === agents.length - 1;
        spans.push({
            spanID: sid(),
            parentSpanID: rootId,
            operationName: 'SendMessage',
            kind: 'SERVER',
            service,
            startOffsetMs: Math.min(cursor, Math.max(60, total - dur - 40)),
            durationMs: fail ? Math.floor(total * 0.35) : dur,
            tags: {
                'gen_ai.agent.a2a.operation.name': 'SendMessage',
                'gen_ai.agent.a2a.task_id': task.taskId,
                'gen_ai.agent.a2a.Role': 'agent',
                'gen_ai.agent.a2at.extension.name': 'task-t',
                'gen_ai.agent.a2at.task.type': task.taskType,
                'gen_ai.agent.a2at.task.object': task.runId,
                ...(fail ? { 'error.type': opts.error } : {}),
            },
            status: fail ? 'error' : 'ok',
        });
        cursor += Math.floor(dur * (0.55 + Math.random() * 0.5));

        if (idx < agents.length - 1 && Math.random() > 0.35) {
            spans.push({
                spanID: sid(),
                parentSpanID: rootId,
                operationName: 'GetTask',
                kind: 'CLIENT',
                service: 'coordinator-agent',
                startOffsetMs: Math.min(cursor, Math.max(80, total - 120)),
                durationMs: 40 + Math.floor(Math.random() * 90),
                tags: {
                    'gen_ai.agent.a2a.operation.name': 'GetTask',
                    'gen_ai.agent.a2a.task_id': task.taskId,
                    'gen_ai.agent.a2at.extension.name': 'task-t',
                    'gen_ai.agent.a2at.task.type': task.taskType,
                    'gen_ai.agent.a2at.task.object': task.runId,
                },
                status: 'ok',
            });
            cursor += 120;
        }
    });

    if (!opts.error && Math.random() > 0.45) {
        const streamer = agents[0] || 'coordinator-agent';
        const evAt = Math.floor(total * (0.45 + Math.random() * 0.25));
        spans.push({
            spanID: sid(),
            parentSpanID: rootId,
            operationName: 'SendStreamingMessage-event',
            kind: 'CLIENT',
            service: streamer,
            startOffsetMs: evAt,
            durationMs: 60 + Math.floor(Math.random() * 140),
            tags: {
                'gen_ai.agent.a2a.operation.name': 'SendStreamingMessage',
                'gen_ai.agent.a2a.streaming-event': 'progress',
                'gen_ai.agent.a2a.task_id': task.taskId,
                'gen_ai.agent.a2at.extension.name': 'task-t',
                'gen_ai.agent.a2at.task.type': task.taskType,
                'gen_ai.agent.a2at.task.object': task.runId,
            },
            status: 'ok',
        });
    }
    spans.sort((a, b) => a.startOffsetMs - b.startOffsetMs);
    return spans;
}

/** Sampled values for ALL 15 catalog metrics (consumer-smoke 方式). */
function buildSignals(task, spans, opts) {
    const S = [];
    const push = (metric, prom, type, unit, value, attributes) =>
        S.push({ metric, prom, type, unit, samples: [{ value, attributes }] });

    const taskAttrs = () => ({
        'gen_ai.agent.a2at.task.type': task.taskType,
        'gen_ai.agent.a2at.task.object': task.runId,
    });

    // ---- workflow 维度 ----
    push('gen_ai.agent.a2at.task.count', 'gen_ai_agent_a2at_task_count_total', 'counter', '', 1, taskAttrs());
    push('gen_ai.agent.a2at.task.duration', 'gen_ai_agent_a2at_task_duration', 'histogram', 'ms', task.durationMs, taskAttrs());

    push('gen_ai.agent.a2at.workflow.duration', 'gen_ai_agent_a2at_workflow_duration', 'histogram', 'ms',
        task.durationMs, { 'gen_ai.agent.a2at.workflow.type': task.workflow.type, 'gen_ai.agent.a2at.workflow.status': task.workflow.status });
    push('gen_ai.agent.a2at.workflow.count', 'gen_ai_agent_a2at_workflow_count_total', 'counter', '',
        1, { 'gen_ai.agent.a2at.workflow.type': task.workflow.type, 'gen_ai.agent.a2at.workflow.status': task.workflow.status });
    for (const step of task.steps) {
        push('gen_ai.agent.a2at.step.duration', 'gen_ai_agent_a2at_step_duration', 'histogram', 'ms',
            step.durationMs, {
            'gen_ai.agent.a2at.workflow.step': `${step.index + 1}-${step.name}`,
            'gen_ai.agent.name': step.owner,
        });
    }
    if (task.negotiation) {
        push('gen_ai.agent.a2at.negotiation.rounds', 'gen_ai_agent_a2at_negotiation_rounds', 'histogram', '{round}',
            task.negotiation.rounds, { 'gen_ai.agent.a2at.negotiation.id': task.negotiation.id, 'gen_ai.agent.a2at.negotiation.result': task.negotiation.result });
        push('gen_ai.agent.a2at.negotiation.count', 'gen_ai_agent_a2at_negotiation_count_total', 'counter', '',
            1, { 'gen_ai.agent.a2at.negotiation.result': task.negotiation.result });
    }

    // ---- message 维度 ----
    const byOp = new Map();
    for (const s of spans) {
        const op = s.operationName === 'SendStreamingMessage-event' ? 'SendStreamingMessage' : s.operationName;
        const e = byOp.get(op) || { count: 0, totalMs: 0 };
        e.count += 1;
        e.totalMs += s.durationMs;
        byOp.set(op, e);
    }
    for (const [op, e] of byOp) {
        push('gen_ai.client.operation.duration', 'gen_ai_client_operation_duration', 'histogram', 's',
            Math.round((e.totalMs / e.count) / 1000 * 1000) / 1000,
            { 'gen_ai.agent.a2a.operation.name': op, 'gen_ai.system': 'A2A' });
    }
    const streamSpans = spans.filter((s) => s.operationName === 'SendStreamingMessage-event');
    if (streamSpans.length) {
        push('gen_ai.agent.a2a.streaming.duration', 'gen_ai_agent_a2a_streaming_duration', 'histogram', 's',
            Math.round((streamSpans.reduce((a, s) => a + s.durationMs, 0) / streamSpans.length) / 1000 * 1000) / 1000,
            { 'gen_ai.agent.a2a.operation.name': 'SendStreamingMessage', 'gen_ai.system': 'A2A' });
    }
    if (task.notification) {
        push('gen_ai.agent.a2at.notification.count', 'gen_ai_agent_a2at_notification_count_total', 'counter', '',
            task.notification.count, { 'gen_ai.agent.a2at.notification.topic': task.notification.topic });
    }

    // ---- agent 维度 ----
    for (const sub of task.substeps) {
        push('gen_ai.agent.a2at.substep.duration', 'gen_ai_agent_a2at_substep_duration', 'histogram', 'ms',
            sub.durationMs, { 'gen_ai.agent.name': sub.agent, 'gen_ai.agent.a2at.substep.name': sub.name });
    }
    for (const tk of task.tokens) {
        push('gen_ai.client.token.usage', 'gen_ai_client_token_usage_total', 'counter', 'token',
            tk.tokens, { 'gen_ai.agent.name': tk.agent, 'gen_ai.request.model': tk.model, 'gen_ai.token.type': tk.tokenType });
    }
    push('gen_ai.agent.a2at.authorization.preauthorize.count', 'gen_ai_agent_a2at_authorization_preauthorize_count_total', 'counter', '',
        opts.preauth, { 'gen_ai.agent.a2at.authorization.policy.operation.type': task.taskType === 'service-provisioning' ? 'write' : 'read' });
    push('gen_ai.agent.a2at.authorization.preauthorize.duration', 'gen_ai_agent_a2at_authorization_preauthorize_duration', 'histogram', 'ms',
        18 + Math.floor(Math.random() * 40), { 'gen_ai.agent.a2at.authorization.policy.operation.type': task.taskType === 'service-provisioning' ? 'write' : 'read' });
    push('gen_ai.agent.a2at.authorization.execute.count', 'gen_ai_agent_a2at_authorization_execute_count_total', 'counter', '',
        1, { 'gen_ai.agent.a2at.authorization.policy.operation.type': task.taskType === 'service-provisioning' ? 'write' : 'read' });
    return S;
}

function taskMetrics(task, spans, opts) {
    const byOp = new Map();
    for (const s of spans) {
        const op = s.operationName === 'SendStreamingMessage-event' ? 'SendStreamingMessage' : s.operationName;
        const entry = byOp.get(op) || { operation: op, count: 0, totalS: 0 };
        entry.count += 1;
        entry.totalS += s.durationMs / 1000;
        byOp.set(op, entry);
    }
    const operations = [...byOp.values()].map((e) => ({
        operation: e.operation,
        count: e.count,
        avgDurationS: Math.round((e.totalS / e.count) * 1000) / 1000,
    }));
    const p95 = Math.round(task.durationMs * (opts.error ? 1.25 : 1.08) / 10) * 10;
    const p50 = Math.round(task.durationMs * 0.94 / 10) * 10;
    return {
        taskCount: 1,
        taskDuration: { unit: 'ms', count: 1, avg: task.durationMs, p50, p95, max: p95 },
        operations,
        promql: {
            duration: `gen_ai_agent_a2at_task_duration{task_type="${task.taskType}", task_object="${task.runId}"}`,
            count: `gen_ai_agent_a2at_task_count_total{task_type="${task.taskType}", task_object="${task.runId}"}`,
        },
    };
}

function buildTask(idx) {
    const types = Object.keys(TASK_TYPES);
    const taskType = types[idx % types.length];
    const runId = `a2at-run-${String(101 + idx)}`;
    const error = idx === 6 || idx === 11;
    const agents = agentList(taskType, idx);
    const durationMs = error
        ? 4200 + Math.floor(Math.random() * 1800)
        : 900 + Math.floor(Math.random() * 4600);
    // 任务时间聚簇在最近 2 小时内，保证折线窗口（采集周期 15s × 120min）内有信号变化
    const age = idx === 0 ? 22 * MIN : Math.floor((22 + idx * 7 + Math.random() * 3) * MIN);
    const startedAt = new Date(NOW - age).toISOString();
    const opts = { error: error ? (idx === 6 ? 'agent-timeout' : 'upstream-unavailable') : null };

    const task = {
        taskId: `a2at-task-${String(210 + idx)}`,
        runId,
        taskType,
        title: TASK_TYPES[taskType],
        extension: 'task-t',
        status: error ? 'error' : 'success',
        startedAt,
        durationMs,
        agents,
        serviceName: `sdk-consumer-${runId}`,
        workflow: {
            id: `wf-${runId}`,
            type: taskType,
            status: error ? 'failed' : 'completed',
            sessionId: `sess-${runId}`,
        },
        negotiation: idx % 4 === 1
            ? { id: `neg-${runId}`, result: error ? 'reject' : 'agree', rounds: 2 + (idx % 3) }
            : null,
        notification: idx % 5 === 2
            ? { topic: taskType === 'fault-diagnosis' ? 'fault-alert' : 'progress-report', count: 1 + (idx % 2) }
            : null,
    };

    const spans = buildSpans(task, opts);
    task.steps = spans
        .filter((s) => s.kind === 'SERVER')
        .map((s, i) => ({
            index: i,
            name: STEP_NAMES[s.service] || `阶段${i + 1}`,
            owner: s.service,
            durationMs: s.durationMs,
            status: s.status,
            startOffsetMs: s.startOffsetMs,
        }));
    task.substeps = spans
        .filter((s) => s.kind === 'SERVER' || s.operationName === 'GetTask')
        .map((s) => ({
            agent: s.service,
            name: STEP_NAMES[s.service] || '任务编排',
            durationMs: s.durationMs,
            status: s.status,
            startOffsetMs: s.startOffsetMs,
        }));
    task.tokens = agents.slice(0, 3).flatMap((agent, i) => {
        const model = MODELS[i % MODELS.length];
        const base = 800 + Math.floor(Math.random() * 2200);
        return [
            { agent, model, tokenType: 'input', tokens: base },
            { agent, model, tokenType: 'output', tokens: Math.floor(base * (0.3 + Math.random() * 0.5)) },
        ];
    });

    // 分类日志：message / workflow / agent（对应 SDK 三类日志信号 → OpenSearch 分索引）
    // 每条日志按 SDK 目录的 log_attributes 携带属性值（与信号属性一同上报）
    const logs = [];
    const TASK_LOG_ATTRS = () => ({
        'gen_ai.agent.a2at.extension.name': 'task-t',
        'gen_ai.agent.a2at.task.type': task.taskType,
        'gen_ai.agent.a2at.task.object': task.runId,
    });
    spans.slice(0, 3).forEach((s, li) => {
        logs.push({
            offsetMs: s.startOffsetMs + s.durationMs,
            severity: s.status === 'error' ? 'ERROR' : 'INFO',
            name: 'gen_ai.agent.a2at.message',
            category: 'message',
            attributes: TASK_LOG_ATTRS(),
            body: s.status === 'error'
                ? `${AGENTS[s.service] || s.service} 执行超时（error.type=${s.tags['error.type']}），任务终止并回滚`
                : ['任务已受理，开始分发协作指令', `${AGENTS[s.service] || s.service} 已接收子任务并开始执行`, '阶段结果已回传协调端，等待汇总'][li % 3],
            service: s.service,
        });
    });
    logs.push({
        offsetMs: 0, severity: 'INFO', name: 'gen_ai.agent.a2at.workflow', category: 'workflow',
        service: 'coordinator-agent',
        attributes: {
            'gen_ai.agent.a2at.workflow.id': task.workflow.id,
            'gen_ai.agent.a2at.workflow.type': task.workflow.type,
            'gen_ai.agent.a2at.workflow.status': task.workflow.status,
            'gen_ai.agent.a2at.workflow.session_id': task.workflow.sessionId,
        },
        body: `工作流 ${task.workflow.id} 启动（type=${task.workflow.type}，session=${task.workflow.sessionId}）`,
    });
    for (const st of task.steps) {
        logs.push({
            offsetMs: st.startOffsetMs + st.durationMs,
            severity: st.status === 'error' ? 'ERROR' : 'INFO',
            name: 'gen_ai.agent.a2at.step', category: 'workflow', service: st.owner,
            attributes: {
                'gen_ai.agent.a2at.workflow.step': `${st.index + 1}-${st.name}`,
                'gen_ai.agent.a2at.workflow.step.index': st.index,
                'gen_ai.agent.a2at.workflow.step.status': st.status,
                'gen_ai.agent.a2at.workflow.step.owner_agent': st.owner,
            },
            body: `工作流步骤 ${st.index + 1}-${st.name}（owner=${st.owner}）${st.status === 'error' ? '失败' : '完成'}，耗时 ${st.durationMs} ms`,
        });
    }
    logs.push({
        offsetMs: durationMs, severity: error ? 'ERROR' : 'INFO', name: 'gen_ai.agent.a2at.workflow',
        category: 'workflow', service: 'coordinator-agent',
        attributes: {
            'gen_ai.agent.a2at.workflow.id': task.workflow.id,
            'gen_ai.agent.a2at.workflow.type': task.workflow.type,
            'gen_ai.agent.a2at.workflow.status': task.workflow.status,
        },
        body: `工作流 ${task.workflow.id} ${error ? `失败（${opts.error}）` : '完成'}`,
    });
    for (const a of agents) {
        logs.push({
            offsetMs: Math.min(...spans.filter((s) => s.service === a).map((s) => s.startOffsetMs)),
            severity: 'INFO', name: 'gen_ai.agent.a2at.agent', category: 'agent', service: a,
            attributes: {
                'gen_ai.agent.name': a,
                'gen_ai.agent.a2at.agent.role': 'agent',
                'gen_ai.agent.a2at.agent.state': 'busy',
            },
            body: `${AGENTS[a] || a} 状态 idle → busy，接入协作任务 ${task.runId}`,
        });
    }
    for (const sub of task.substeps) {
        logs.push({
            offsetMs: sub.startOffsetMs + sub.durationMs,
            severity: sub.status === 'error' ? 'ERROR' : 'INFO',
            name: 'gen_ai.agent.a2at.substep', category: 'agent', service: sub.agent,
            attributes: {
                'gen_ai.agent.name': sub.agent,
                'gen_ai.agent.a2at.substep.name': sub.name,
                'gen_ai.agent.a2at.substep.status': sub.status,
            },
            body: `${AGENTS[sub.agent] || sub.agent} 子步骤 ${sub.name} ${sub.status === 'error' ? '失败' : '完成'}（${sub.durationMs} ms）`,
        });
    }
    logs.sort((a, b) => a.offsetMs - b.offsetMs);

    // 日志 ↔ Span 上下文关联（模拟 OTLP log 的 span 上下文）：优先取同服务且
    // 时间窗覆盖日志偏移的 Span，否则回退到该服务的第一个 Span / 根 Span。
    const attachSpanId = (list, spanList) => list.map((l) => {
        const cands = spanList.filter((s) => s.service === l.service
            && l.offsetMs >= s.startOffsetMs && l.offsetMs <= s.startOffsetMs + s.durationMs);
        const best = cands[0] || spanList.find((s) => s.service === l.service) || spanList[0];
        return { ...l, spanID: best ? best.spanID : null };
    });
    const attachedLogs = attachSpanId(logs, spans);

    return {
        ...task,
        spanCount: spans.length,
        trace: { traceID: rid(), spans },
        metrics: taskMetrics(task, spans, opts),
        signals: buildSignals(task, spans, { ...opts, preauth: 1 + (idx % 2) }),
        logs: attachedLogs,
    };
}

/**
 * 按采集周期为全部 15 个观测信号生成折线序列（counter=累计阶梯、histogram=活跃均值），
 * 并为 8 个 histogram 类信号生成全体样本的直方桶分布 —— 图表与观测信号一一对应。
 */
function buildCharts(tasksAll) {
    const INTERVAL = 15;           // 采集周期（秒）：Prometheus 默认 scrape / OTLP 推送间隔
    const WINDOW_MIN = 120;        // 折线窗口：最近 2 小时（覆盖全部模拟任务）
    const byStart = [...tasksAll].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    const t1 = NOW;
    const t0 = NOW - WINDOW_MIN * 60 * 1000;
    const ticks = [];
    for (let t = t0; t <= t1; t += INTERVAL * 1000) ticks.push(t);

    const M = {
        TASK_COUNT: 'gen_ai.agent.a2at.task.count',
        TASK_DUR: 'gen_ai.agent.a2at.task.duration',
        WF_DUR: 'gen_ai.agent.a2at.workflow.duration',
        WF_COUNT: 'gen_ai.agent.a2at.workflow.count',
        STEP_DUR: 'gen_ai.agent.a2at.step.duration',
        SUB_DUR: 'gen_ai.agent.a2at.substep.duration',
        OP_DUR: 'gen_ai.client.operation.duration',
        STREAM_DUR: 'gen_ai.agent.a2a.streaming.duration',
        NEG_ROUNDS: 'gen_ai.agent.a2at.negotiation.rounds',
        NEG_COUNT: 'gen_ai.agent.a2at.negotiation.count',
        NOTI_COUNT: 'gen_ai.agent.a2at.notification.count',
        AUTH_PRE_CNT: 'gen_ai.agent.a2at.authorization.preauthorize.count',
        AUTH_PRE_DUR: 'gen_ai.agent.a2at.authorization.preauthorize.duration',
        AUTH_EXE_CNT: 'gen_ai.agent.a2at.authorization.execute.count',
        TOKEN: 'gen_ai.client.token.usage',
    };
    const LABELS = {
        [M.TASK_COUNT]: '任务计数（累计）', [M.TASK_DUR]: '任务时长均值', [M.WF_DUR]: '工作流时长均值',
        [M.WF_COUNT]: '工作流计数（累计）', [M.STEP_DUR]: '工作流步骤耗时均值', [M.SUB_DUR]: '子步骤耗时均值',
        [M.OP_DUR]: 'A2A 协议操作耗时均值', [M.STREAM_DUR]: '流式传输耗时均值', [M.NEG_ROUNDS]: '谈判轮次',
        [M.NEG_COUNT]: '谈判计数（累计）', [M.NOTI_COUNT]: '通知计数（累计）',
        [M.AUTH_PRE_CNT]: '预授权次数（累计）', [M.AUTH_PRE_DUR]: '预授权耗时均值',
        [M.AUTH_EXE_CNT]: '授权执行次数（累计）', [M.TOKEN]: 'Token 用量（累计）',
    };
    const UNITS = {
        [M.TASK_COUNT]: '', [M.TASK_DUR]: 'ms', [M.WF_DUR]: 'ms', [M.WF_COUNT]: '',
        [M.STEP_DUR]: 'ms', [M.SUB_DUR]: 'ms', [M.OP_DUR]: 's', [M.STREAM_DUR]: 's',
        [M.NEG_ROUNDS]: '{round}', [M.NEG_COUNT]: '', [M.NOTI_COUNT]: '',
        [M.AUTH_PRE_CNT]: '', [M.AUTH_PRE_DUR]: 'ms', [M.AUTH_EXE_CNT]: '', [M.TOKEN]: 'token',
    };
    const COLORS = ['#2563eb', '#059669', '#f46800', '#7c3aed', '#ec4899'];
    const PROM_NAMES = {
        [M.TASK_COUNT]: 'gen_ai_agent_a2at_task_count_total',
        [M.TASK_DUR]: 'gen_ai_agent_a2at_task_duration_avg',
        [M.WF_DUR]: 'gen_ai_agent_a2at_workflow_duration_avg',
        [M.WF_COUNT]: 'gen_ai_agent_a2at_workflow_count_total',
        [M.STEP_DUR]: 'gen_ai_agent_a2at_step_duration_avg',
        [M.SUB_DUR]: 'gen_ai_agent_a2at_substep_duration_avg',
        [M.OP_DUR]: 'gen_ai_client_operation_duration_avg',
        [M.STREAM_DUR]: 'gen_ai_agent_a2a_streaming_duration_avg',
        [M.NEG_ROUNDS]: 'gen_ai_agent_a2at_negotiation_rounds_avg',
        [M.NEG_COUNT]: 'gen_ai_agent_a2at_negotiation_count_total',
        [M.NOTI_COUNT]: 'gen_ai_agent_a2at_notification_count_total',
        [M.AUTH_PRE_CNT]: 'gen_ai_agent_a2at_authorization_preauthorize_count_total',
        [M.AUTH_PRE_DUR]: 'gen_ai_agent_a2at_authorization_preauthorize_duration_avg',
        [M.AUTH_EXE_CNT]: 'gen_ai_agent_a2at_authorization_execute_count_total',
        [M.TOKEN]: 'gen_ai_client_token_usage_total',
    };
    const PROM_MULTI = {
        [M.OP_DUR]: (op) => `gen_ai_client_operation_duration{operation_name="${op}",gen_ai_system="A2A"}`,
        [M.TOKEN]: (tt) => `gen_ai_client_token_usage_total{token_type="${tt}"}`,
    };

    const sigVal = (tk, metric) => {
        const s = tk.signals.find((x) => x.metric === metric);
        return s && s.samples.length ? s.samples[0].value : null;
    };
    const startMs = (tk) => new Date(tk.startedAt).getTime();
    const avg = (vals) => (vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null);

    const single = {};
    const multi = {};
    const carry = {};
    const carryM = {};
    const upd = (name, t, v) => {
        carry[name] = v == null ? (carry[name] ?? 0) : v;
        (single[name] ||= []).push({ t, v: carry[name] });
    };
    const updM = (name, sname, t, v) => {
        carryM[name] = carryM[name] || {};
        carryM[name][sname] = v == null ? (carryM[name][sname] ?? 0) : v;
        ((multi[name] ||= {})[sname] ||= []).push({ t, v: carryM[name][sname] });
    };

    for (const t of ticks) {
        const S = byStart.filter((tk) => startMs(tk) <= t);
        const A = S.filter((tk) => startMs(tk) + tk.durationMs >= t);

        // 计数器（累计阶梯）
        upd(M.TASK_COUNT, t, S.length);
        upd(M.WF_COUNT, t, S.length);
        upd(M.NEG_COUNT, t, S.filter((tk) => tk.negotiation).length);
        upd(M.NOTI_COUNT, t, S.reduce((a, tk) => a + (sigVal(tk, M.NOTI_COUNT) || 0), 0));
        upd(M.AUTH_PRE_CNT, t, S.reduce((a, tk) => a + (sigVal(tk, M.AUTH_PRE_CNT) || 0), 0));
        upd(M.AUTH_EXE_CNT, t, S.reduce((a, tk) => a + (sigVal(tk, M.AUTH_EXE_CNT) || 0), 0));
        updM(M.TOKEN, 'input', t, S.reduce((a, tk) => a + tk.tokens.filter((x) => x.tokenType === 'input').reduce((s, x) => s + x.tokens, 0), 0));
        updM(M.TOKEN, 'output', t, S.reduce((a, tk) => a + tk.tokens.filter((x) => x.tokenType === 'output').reduce((s, x) => s + x.tokens, 0), 0));

        // 直方图类均值（活跃任务采样均值，间隙沿用上次值）
        upd(M.TASK_DUR, t, avg(A.map((tk) => tk.durationMs)));
        upd(M.WF_DUR, t, avg(A.map((tk) => tk.durationMs)));
        upd(M.STEP_DUR, t, avg(A.flatMap((tk) => tk.steps.map((s) => s.durationMs))));
        upd(M.SUB_DUR, t, avg(A.flatMap((tk) => tk.substeps.map((s) => s.durationMs))));
        updM(M.OP_DUR, 'SendMessage', t, avg(A.flatMap((tk) => tk.trace.spans.filter((s) => s.operationName === 'SendMessage').map((s) => s.durationMs / 1000))));
        updM(M.OP_DUR, 'GetTask', t, avg(A.flatMap((tk) => tk.trace.spans.filter((s) => s.operationName === 'GetTask').map((s) => s.durationMs / 1000))));
        upd(M.STREAM_DUR, t, avg(A.flatMap((tk) => tk.trace.spans.filter((s) => s.operationName === 'SendStreamingMessage-event').map((s) => s.durationMs / 1000))));
        const startedNeg = S.filter((tk) => tk.negotiation);
        upd(M.NEG_ROUNDS, t, startedNeg.length ? startedNeg[startedNeg.length - 1].negotiation.rounds : null);
        const preDurVals = S.map((tk) => sigVal(tk, M.AUTH_PRE_DUR)).filter((v) => v != null);
        upd(M.AUTH_PRE_DUR, t, preDurVals.length ? preDurVals[preDurVals.length - 1] : null);
    }

    const lines = {};
    for (const [name, pts] of Object.entries(single)) {
        lines[name] = { unit: UNITS[name], label: LABELS[name], series: [{ name: LABELS[name], color: COLORS[0], points: pts, prom: PROM_NAMES[name] }] };
    }
    for (const [name, seriesMap] of Object.entries(multi)) {
        lines[name] = {
            unit: UNITS[name], label: LABELS[name],
            series: Object.entries(seriesMap).map(([sname, pts], i) => ({ name: sname, color: COLORS[(i + 1) % COLORS.length], points: pts, prom: PROM_MULTI[name] ? PROM_MULTI[name](sname) : PROM_NAMES[name] })),
        };
    }

    const hist = (values, edges) => {
        const buckets = edges.map((le) => ({ le, count: values.filter((v) => v <= le).length }));
        buckets.push({ le: null, inf: true, count: values.filter((v) => v > edges[edges.length - 1]).length });
        return buckets;
    };
    const histograms = {
        [M.TASK_DUR]: { unit: 'ms', label: '任务时长分布', buckets: hist(tasksAll.map((t) => t.durationMs), [1000, 2000, 3000, 4000, 5000]) },
        [M.WF_DUR]: { unit: 'ms', label: '工作流时长分布', buckets: hist(tasksAll.map((t) => t.durationMs), [1000, 2000, 3000, 4000, 5000]) },
        [M.STEP_DUR]: { unit: 'ms', label: '步骤耗时分布', buckets: hist(tasksAll.flatMap((t) => t.steps.map((s) => s.durationMs)), [250, 500, 1000, 2000, 3000]) },
        [M.SUB_DUR]: { unit: 'ms', label: '子步骤耗时分布', buckets: hist(tasksAll.flatMap((t) => t.substeps.map((s) => s.durationMs)), [250, 500, 1000, 2000]) },
        [M.OP_DUR]: { unit: 's', label: '操作耗时分布', buckets: hist(tasksAll.flatMap((t) => t.metrics.operations.map((o) => o.avgDurationS)), [0.25, 0.5, 1, 2, 5]) },
        [M.STREAM_DUR]: { unit: 's', label: '流式耗时分布', buckets: hist(tasksAll.flatMap((t) => t.trace.spans.filter((s) => s.operationName === 'SendStreamingMessage-event').map((s) => s.durationMs / 1000)), [0.05, 0.1, 0.15, 0.2]) },
        [M.NEG_ROUNDS]: { unit: '{round}', label: '谈判轮次分布', buckets: hist(tasksAll.filter((t) => t.negotiation).map((t) => t.negotiation.rounds), [2, 3, 4]) },
        [M.AUTH_PRE_DUR]: { unit: 'ms', label: '预授权耗时分布', buckets: hist(tasksAll.map((t) => sigVal(t, M.AUTH_PRE_DUR)).filter((v) => v != null), [25, 35, 45, 55]) },
    };

    return { intervalSec: INTERVAL, windowMin: WINDOW_MIN, storage: 'Prometheus OTLP → Thanos Query（保留 48h）', lines, histograms };
}

const tasks = Array.from({ length: 14 }, (_, i) => buildTask(i)).sort((a, b) => b.startedAt.localeCompare(a.startedAt));

const dataset = {
    dataset: 'a2at-collab-tasks',
    shape: 'Jaeger v2 traces + Prometheus gen_ai.agent.a2at.* · observability-sdk-java deploy/local-storage 形态',
    source: 'simulated (consumer-smoke 方式自动构建)',
    generatedAt: new Date(NOW).toISOString(),
    collection: { intervalSec: 15, windowMin: 120, retentionHours: 48, storage: 'Prometheus OTLP → Thanos Query', note: 'Prometheus 默认 scrape 周期 / SDK OTLP 批量推送间隔' },
    charts: buildCharts(tasks),
    tasks,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(dataset, null, 1), 'utf8');
const sigCount = tasks.reduce((a, t) => a + t.signals.length, 0);
console.log(`written ${OUT}: ${tasks.length} tasks, ${sigCount} signal samples total, ${(JSON.stringify(dataset).length / 1024).toFixed(1)} KB`);
