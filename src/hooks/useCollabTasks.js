import { useCallback, useEffect, useState } from 'react';
import { resolveDataUrl } from '../lib/urls';

export function useCollabTasks() {
    const [state, setState] = useState({ loading: true, error: null, dataset: null });
    const reload = useCallback(() => {
        setState((s) => ({ loading: true, error: null, dataset: s.dataset }));
        fetch(resolveDataUrl(), { cache: 'no-store' })
            .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
            .then((dataset) => setState({ loading: false, error: null, dataset }))
            .catch((e) => setState({ loading: false, error: e.message || String(e), dataset: null }));
    }, []);
    useEffect(() => { reload(); }, [reload]);
    return { ...state, reload };
}
