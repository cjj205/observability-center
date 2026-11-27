import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 可拖拽列宽：把每列宽度持久化到 localStorage，并以 CSS 变量形式输出给 grid。
 *
 * - 未拖过的列保持 'auto'（沿用样式表里的 max-content 自适应）
 * - 拖过的列固定为具体像素值，写入 --obs-col-<key>
 * - 双击手柄恢复该列自适应并清除持久化
 */
const MIN_WIDTH = 48;
const MAX_WIDTH = 720;
const RESIZING_CLASS = 'obs-col-resizing';

function readSaved(storageKey, keys) {
    try {
        const raw = window.localStorage.getItem(storageKey);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return {};
        const out = {};
        for (const key of keys) {
            const value = parsed[key];
            if (typeof value === 'number' && Number.isFinite(value) && value >= MIN_WIDTH && value <= MAX_WIDTH) {
                out[key] = value;
            }
        }
        return out;
    } catch {
        return {};
    }
}

export function useResizableColumns(storageKey, keys) {
    const keysRef = useRef(keys);
    const [widths, setWidths] = useState(() => readSaved(storageKey, keys));
    const dragRef = useRef(null);

    useEffect(() => {
        try {
            window.localStorage.setItem(storageKey, JSON.stringify(widths));
        } catch {
            /* localStorage 不可用（隐私模式等）时静默忽略 */
        }
    }, [storageKey, widths]);

    // 卸载兜底：拖拽途中离开页面时清掉 body 上的拖拽标记
    useEffect(() => () => document.body.classList.remove(RESIZING_CLASS), []);

    const onHandlePointerDown = useCallback((event, key) => {
        if (event.button !== 0) return;
        const headerCell = event.currentTarget.parentElement;
        const startWidth = headerCell.getBoundingClientRect().width;
        dragRef.current = { key, startX: event.clientX, startWidth };
        event.preventDefault();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        // 拖拽期间给 body 打标记：样式表据此锁定光标并禁用文字选择
        document.body.classList.add(RESIZING_CLASS);
    }, []);

    const onHandlePointerMove = useCallback((event) => {
        const drag = dragRef.current;
        if (!drag) return;
        const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, drag.startWidth + (event.clientX - drag.startX)));
        setWidths((previous) => ({ ...previous, [drag.key]: Math.round(next) }));
    }, []);

    const onHandlePointerUp = useCallback((event) => {
        dragRef.current = null;
        event.currentTarget.releasePointerCapture?.(event.pointerId);
        document.body.classList.remove(RESIZING_CLASS);
    }, []);

    const resetColumn = useCallback((key) => {
        setWidths((previous) => {
            const next = { ...previous };
            delete next[key];
            return next;
        });
    }, []);

    const resetAll = useCallback(() => setWidths({}), []);

    return { widths, onHandlePointerDown, onHandlePointerMove, onHandlePointerUp, resetColumn, resetAll };
}
