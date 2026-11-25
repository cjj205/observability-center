import { fmtMs } from '../lib/format';
import { LangfuseMark } from '../ui/icons';

export const DEFAULT_LANGFUSE_URL = 'http://47.236.98.226:9012';

/* --------------------------------------------------------------------------
 * i18n — register this plugin's menu labels into the Portal i18n instance at
 * bundle-load time. The Portal's bundle-loader registers manifest labelKeys
 * AFTER the plugin script executes and skips labels already registered
 * (i18n.exists), so registering here wins and keeps proper zh translations
 * without patching the Portal main bundle. English literals display as-is in
 * the English UI.
 * ------------------------------------------------------------------------ */

export const AGENT_LABELS = {
    'coordinator-agent': '协调智能体',
    'fault-diagnosis-agent': '故障诊断',
    'topology-agent': '拓扑分析',
    'workbench-agent': '工单执行',
    'capacity-agent': '容量分析',
    'inspection-agent': '巡检执行',
};

export const SPAN_KIND_LABELS = { CLIENT: 'C', SERVER: 'S', INTERNAL: 'I' };

export const DEFAULT_DATA_URL = '/plugins/observation-center/mock-collab-tasks.json';

export const TASK_TYPE_LABELS = {
    'fault-diagnosis': '故障诊断',
    'network-inspection': '网络巡检',
    'service-provisioning': '业务开通',
    'emergency-drill': '应急演练',
    'capacity-analysis': '容量分析',
};

export const COORDINATOR = 'coordinator-agent';

/** 协作拓扑图：协调端 → 参与智能体，边按 span 聚合（消息/流式回传）。 */
export function TopologyGraph({ task }) {
    const spans = task.trace?.spans || [];
    const services = [];
    for (const s of spans) if (!services.includes(s.service)) services.push(s.service);
    const agents = services.filter((s) => s !== COORDINATOR);
    if (!services.includes(COORDINATOR) && agents.length > 0) services.unshift(COORDINATOR);

    const W = 460;
    const H = agents.length > 3 ? 250 : 224;
    const coordPos = { x: W / 2, y: 56 };
    const pos = new Map();
    agents.forEach((svc, i) => {
        pos.set(svc, { x: (W / (agents.length + 1)) * (i + 1), y: 176 });
    });

    const serverAgg = new Map();
    const streamAgg = new Map();
    let polls = 0;
    for (const s of spans) {
        if (s.kind === 'SERVER') {
            const e = serverAgg.get(s.service) || { count: 0, totalMs: 0, errors: 0 };
            e.count += 1;
            e.totalMs += s.durationMs;
            if (s.status === 'error') e.errors += 1;
            serverAgg.set(s.service, e);
        } else if (s.operationName === 'SendStreamingMessage-event') {
            streamAgg.set(s.service, (streamAgg.get(s.service) || 0) + 1);
        } else if (s.operationName === 'GetTask') {
            polls += 1;
        }
    }

    const agentLabel = (svc) => AGENT_LABELS[svc] || svc;
    const hasErrorNode = (svc) => (serverAgg.get(svc)?.errors || 0) > 0
        || spans.some((s) => s.service === svc && s.status === 'error');

    return (
        <div className="obs-topo-svg-wrap">
            <svg viewBox={`0 0 ${W} ${H}`} className="obs-topo-svg" role="img" aria-label="协作拓扑图">
                <defs>
                    <marker id="obs-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                        <path d="M0 0L10 5L0 10z" fill="#2563eb" />
                    </marker>
                    <marker id="obs-arrow-back" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                        <path d="M0 0L10 5L0 10z" fill="#94a3b8" />
                    </marker>
                </defs>
                {agents.map((svc) => {
                    const p = pos.get(svc);
                    const agg = serverAgg.get(svc);
                    const err = hasErrorNode(svc);
                    const midX = (coordPos.x + p.x) / 2;
                    const midY = (coordPos.y + p.y) / 2;
                    const label = agg
                        ? `SendMessage ×${agg.count} · ${fmtMs(Math.round(agg.totalMs / agg.count))}`
                        : '';
                    return (
                        <g key={`e-${svc}`}>
                            <line
                                x1={coordPos.x} y1={coordPos.y + 22} x2={p.x} y2={p.y - 24}
                                stroke={err ? '#dc2626' : '#2563eb'} strokeWidth={err ? 2 : 1.6}
                                markerEnd={err ? 'url(#obs-arrow-back)' : 'url(#obs-arrow)'}
                                opacity="0.85"
                            />
                            {label && (
                                <text x={midX} y={midY - 6} textAnchor="middle" className="obs-topo-edge-label" fill={err ? '#dc2626' : 'currentColor'}>
                                    {label}
                                </text>
                            )}
                            {(streamAgg.get(svc) || 0) > 0 && (
                                <g>
                                    <path
                                        d={`M ${p.x + 26} ${p.y - 26} C ${p.x + 60} ${p.y - 80}, ${coordPos.x + 60} ${coordPos.y + 44}, ${coordPos.x + 40} ${coordPos.y + 22}`}
                                        fill="none" stroke="#94a3b8" strokeWidth="1.2" strokeDasharray="4 3"
                                        markerEnd="url(#obs-arrow-back)" opacity="0.8"
                                    />
                                    <text x={(p.x + coordPos.x) / 2 + 58} y={(p.y + coordPos.y) / 2 - 44} textAnchor="middle" className="obs-topo-edge-label" fill="currentColor" opacity="0.7">
                                        流式 ×{streamAgg.get(svc)}
                                    </text>
                                </g>
                            )}
                        </g>
                    );
                })}
                {/* 协调端节点 */}
                <g>
                    <rect x={coordPos.x - 64} y={coordPos.y - 22} width="128" height="44" rx="11" fill="rgba(37,99,235,0.14)" stroke="#2563eb" strokeWidth="1.6" />
                    <text x={coordPos.x} y={coordPos.y - 3} textAnchor="middle" className="obs-topo-node-name">{agentLabel(COORDINATOR)}</text>
                    <text x={coordPos.x} y={coordPos.y + 13} textAnchor="middle" className="obs-topo-node-sub">{COORDINATOR}</text>
                </g>
                {/* 智能体节点 */}
                {agents.map((svc) => {
                    const p = pos.get(svc);
                    const err = hasErrorNode(svc);
                    return (
                        <g key={svc}>
                            <rect
                                x={p.x - 64} y={p.y - 22} width="128" height="44" rx="11"
                                fill={err ? 'rgba(220,38,38,0.12)' : 'rgba(124,58,237,0.12)'}
                                stroke={err ? '#dc2626' : '#7c3aed'} strokeWidth="1.6"
                            />
                            <text x={p.x} y={p.y - 3} textAnchor="middle" className="obs-topo-node-name">{agentLabel(svc)}</text>
                            <text x={p.x} y={p.y + 13} textAnchor="middle" className="obs-topo-node-sub">{svc}</text>
                        </g>
                    );
                })}
            </svg>
            <div className="obs-topo-legend">
                <span><i className="obs-topo-dot" style={{ background: '#2563eb' }} /> 消息流（SendMessage）</span>
                <span><i className="obs-topo-dot" style={{ background: '#94a3b8' }} /> 流式回传 / 轮询{polls > 0 ? `（GetTask ×${polls}）` : ''}</span>
                <span><i className="obs-topo-dot" style={{ background: '#dc2626' }} /> 异常</span>
            </div>
        </div>
    );
}

/** 顶层信号页签：Metric → Trace → Log → 数据信号字典。 */

export const SIGNAL_TABS = [
    { key: 'metric', label: 'Metric' },
    { key: 'trace', label: 'Trace' },
    { key: 'log', label: 'Log' },
    { key: 'dict', label: '数据信号字典' },
];

/** 维度子页签：A2A-T 消息 / 协作工作流 / Agent。 */

export const DIM_TABS = [
    { key: 'message', label: 'A2A-T 消息' },
    { key: 'workflow', label: '协作工作流' },
    { key: 'agent', label: 'Agent' },
];

/** 按 parentSpanID 构建 Span 挂接树（父 → 子，同级按开始时间排序）。 */

export const DIM_NOTES = {
    message: '消息收发与协议操作（SendMessage / GetTask / 流式事件）',
    workflow: '协作任务与工作流步骤（task / workflow / negotiation）',
    agent: '智能体子步骤、Token 用量与授权',
};

export const LOG_TITLES = {
    message: '消息日志 · gen_ai.agent.a2at.message',
    workflow: '工作流日志 · gen_ai.agent.a2at.workflow / gen_ai.agent.a2at.step',
    agent: '智能体日志 · gen_ai.agent.a2at.agent / gen_ai.agent.a2at.substep',
};

/** 右侧属性查看器：统一显示 Span / 日志的属性（属性名 + 值 表格）。 */

export const THIRD_PARTY_CARDS = [
    {
        key: 'langfuse',
        name: 'Langfuse',
        component: 'Langfuse',
        latin: 'langfuse.com · 开源 LLM 可观测平台',
        status: 'ready',
        statusLabel: '已接入',
        accent: '#6366f1',
        icon: <LangfuseMark />,
        desc: '开源 LLM 应用可观测平台：Trace 追踪、评测、指标观测。门户已自部署 Langfuse v2。',
        linked: '已接入 · 自部署站点',
        openHint: '在新页面打开自部署 Langfuse',
        site: 'https://langfuse.com',
    },
    {
        key: 'grafana',
        name: 'Grafana',
        component: 'Grafana',
        latin: 'grafana.com · 开源可视化看板',
        status: 'pending',
        statusLabel: '待接入',
        accent: '#f46800',
        desc: '开源指标可视化与监控看板（Grafana Labs），支持 Prometheus、Loki 等多种数据源。',
        linked: '开源组件：Grafana',
        openHint: '在新页面打开 Grafana 官网（组件待接入）',
        site: 'https://grafana.com',
    },
    {
        key: 'prometheus',
        name: 'Prometheus（普罗米修斯）',
        component: 'Prometheus',
        latin: 'prometheus.io · 开源指标与告警',
        status: 'pending',
        statusLabel: '待接入',
        accent: '#e6522c',
        desc: '开源指标采集、时序数据库与告警引擎（CNCF 毕业项目），通常与 Grafana 配套使用。',
        linked: '开源组件：Prometheus',
        openHint: '在新页面打开 Prometheus 官网（组件待接入）',
        site: 'https://prometheus.io',
    },
];
