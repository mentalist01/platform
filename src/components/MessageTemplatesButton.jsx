import { lazy, Suspense, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MessageSquare } from 'lucide-react';
import './MessageTemplates.css';

const MessageTemplates = lazy(() => import('./MessageTemplates.jsx'));

function TemplatesDialog(props) {
  const dialog = useRef(null);
  useLayoutEffect(() => {
    const node = dialog.current, previous = document.activeElement;
    node.showModal();
    return () => { node.close(); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  return createPortal(<dialog ref={dialog} className="message-templates-dialog" onClick={event => event.stopPropagation()} onCancel={event => { event.preventDefault(); props.onClose(); }}>
    <Suspense fallback={<p role="status">Загружаем шаблоны…</p>}><MessageTemplates {...props} /></Suspense>
  </dialog>, document.fullscreenElement || document.body);
}

export default function MessageTemplatesButton({ label = 'Шаблоны сообщений', ...props }) {
  const [open, setOpen] = useState(false);
  return <><button type="button" className="message-templates-launcher" onClick={event => { event.stopPropagation(); setOpen(true); }}><MessageSquare size={16} />{label}</button>
    {open && <TemplatesDialog {...props} onClose={() => setOpen(false)} />}</>;
}
