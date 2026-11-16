import { Component, lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFullscreenPortalTarget } from '../hooks/useFullscreenPortalTarget.js';

function PartStatus({ label, dialog, onClose, error, onRetry, height, loading }) {
  const portalTarget = useFullscreenPortalTarget();
  useEffect(() => {
    if (!dialog || !onClose) return undefined;
    const close = event => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [dialog, onClose]);
  const content = <div className="surface-card rounded-2xl border border-purple-200 bg-white p-5 text-sm text-slate-700 shadow-soft" role={error ? 'alert' : 'status'}>
    <p>{error ? 'Не удалось открыть окно. Проверьте соединение и повторите загрузку.' : label}</p>
    {(error || (dialog && onClose)) && <div className="mt-3 flex flex-wrap gap-3">
      {error && <button type="button" className="font-bold text-purple-700" onClick={onRetry}>Повторить загрузку</button>}
      {onClose && <button type="button" className="font-semibold text-slate-600" onClick={onClose}>Закрыть</button>}
    </div>}
  </div>;
  if (dialog && portalTarget) return createPortal(
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-950/30 p-4" role="dialog" aria-modal="true" aria-label={label}>{content}</div>,
    portalTarget,
  );
  return <div style={{ height, minHeight: height ? undefined : 120 }}>{!error && loading ? loading : content}</div>;
}

class PartBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.failure : this.props.children; }
}

// Keep suspension and failures inside the requested tool. Other sections,
// an active call and another editor remain mounted throughout the download.
export default function DeferredWorkspacePart({ load, componentProps, label = 'Открываем окно…', dialog = false, closeProp = 'onClose' }) {
  const [revision, setRevision] = useState(0);
  const { Part } = useMemo(() => ({ Part: lazy(load), revision }), [load, revision]);
  const statusProps = { label, dialog, onClose: componentProps[closeProp], height: componentProps.height, loading: componentProps.loading };
  return <PartBoundary key={revision} failure={<PartStatus {...statusProps} error onRetry={() => setRevision(value => value + 1)} />}>
    <Suspense fallback={<PartStatus {...statusProps} />}><Part {...componentProps} /></Suspense>
  </PartBoundary>;
}
