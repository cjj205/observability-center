

export const pad2 = (n) => String(n).padStart(2, '0');

export function fmtTime(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

export function fmtAgo(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    if (Number.isNaN(diff)) return '';
    if (diff < 60_000) return '刚刚';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
    return `${Math.floor(diff / 86_400_000)} 天前`;
}

export function fmtMs(ms) {
    if (ms == null) return '—';
    if (ms >= 10_000) return `${(ms / 1000).toFixed(2)} s`;
    if (ms >= 1000) return `${(ms / 1000).toFixed(1)} s`;
    return `${Math.round(ms)} ms`;
}

export function fmtValue(unit, value) {
    if (value == null) return '—';
    if (unit === 'ms') return fmtMs(value);
    if (unit === 's') return `${Number(value).toFixed(3)} s`;
    if (unit === 'token') return `${value} token`;
    if (unit === '{round}') return `${value} 轮`;
    return String(value);
}

/** 图表坐标轴数字（紧凑格式）。 */

export function fmtChartNum(v, unit) {
    if (v == null) return '';
    if (unit === 'ms') return fmtMs(v);
    if (unit === 's') return `${Number(v).toFixed(2)}s`;
    if (unit === 'token') return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v));
    if (v >= 10000) return `${(v / 1000).toFixed(1)}k`;
    return String(Math.round(v));
}

/**
 * 折线图：按采集周期的时序采样（纯 SVG，无图表库依赖）。
 * series: [{ name, color, points: [{ t, v }] }]；band: 本任务时间带高亮。
 */

export function shortAttrKey(k) {
    return k
        .replace(/^gen_ai\.agent\.a2at\./, '')
        .replace(/^gen_ai\.agent\.a2a\./, 'a2a.');
}

export function agentStats(task) {
    const map = new Map();
    for (const s of task.trace?.spans || []) {
        const e = map.get(s.service) || { service: s.service, spans: 0, messages: 0, totalMs: 0, errors: 0, first: s.startOffsetMs, last: 0 };
        e.spans += 1;
        if (s.kind === 'SERVER') e.messages += 1;
        e.totalMs += s.durationMs;
        if (s.status === 'error') e.errors += 1;
        e.first = Math.min(e.first, s.startOffsetMs);
        e.last = Math.max(e.last, s.startOffsetMs + s.durationMs);
        map.set(s.service, e);
    }
    const totalMs = [...map.values()].reduce((a, e) => a + e.totalMs, 0) || 1;
    return [...map.values()]
        .map((e) => ({ ...e, avgMs: Math.round(e.totalMs / e.spans), share: Math.round((e.totalMs / totalMs) * 100) }))
        .sort((a, b) => b.totalMs - a.totalMs);
}
