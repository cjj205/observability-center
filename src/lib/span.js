

export function buildSpanTree(spans) {
    const byId = new Map(spans.map((s) => [s.spanID, s]));
    const children = new Map();
    const roots = [];
    for (const s of spans) {
        const parent = s.parentSpanID && byId.get(s.parentSpanID);
        if (parent) {
            if (!children.has(parent.spanID)) children.set(parent.spanID, []);
            children.get(parent.spanID).push(s);
        } else {
            roots.push(s);
        }
    }
    for (const list of children.values()) list.sort((a, b) => a.startOffsetMs - b.startOffsetMs);
    roots.sort((a, b) => a.startOffsetMs - b.startOffsetMs);
    return { roots, children };
}

/** 可复制的高亮 ID 徽章（TraceID / spanID）。点击复制 ID；冒泡不拦截——
 * 在 Trace 树行内点击时同时触发行选中（复制 + 查看属性两全）。 */
