import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Presentation, X } from 'lucide-react';
import './PythonExplanationBoard.css';

export function PythonExplanationBoardButton({ board }) {
  if (!board?.roomId) return null;
  return <button type="button" className="python-explanation-button" onClick={board.openBoard}
    disabled={!board.connected} aria-label="Открыть доску и код"
    title={board.error || (board.connected ? 'Общая доска и запуск примеров Python' : 'Подключаем доску…')}>
    <Presentation size={17} /><span>Доска и код</span>
  </button>;
}

export default function PythonExplanationBoard({ board, Canvas, Workspace, context, theme, title }) {
  const dialog = useRef(null);
  const { open, closeBoard } = board;
  useEffect(() => {
    if (!open) return undefined;
    const returnFocus = document.activeElement;
    const focusFrame = requestAnimationFrame(() => dialog.current?.querySelector('button')?.focus({ preventScroll: true }));
    const handleKey = event => {
      if (event.key === 'Escape') {
        if (document.fullscreenElement || dialog.current?.querySelector('.modal-backdrop')) return;
        event.preventDefault(); event.stopImmediatePropagation(); closeBoard();
      }
      if (event.key !== 'Tab' || !dialog.current) return;
      // Monaco needs the key for indentation and completion before focus trapping.
      if (event.target?.closest?.('.monaco-editor')) return;
      // A minimized theory window underneath has its own focus trap.
      event.stopImmediatePropagation();
      const controls = Array.from(dialog.current.querySelectorAll('button:not([disabled]), input, select, textarea, [tabindex="0"], [href]'))
        .filter(node => node.getClientRects().length && node.getAttribute('aria-hidden') !== 'true');
      const first = controls[0], last = controls.at(-1);
      if (!first) { event.preventDefault(); dialog.current.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !dialog.current.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.current.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', handleKey, true);
    return () => {
      cancelAnimationFrame(focusFrame); document.removeEventListener('keydown', handleKey, true);
      if (returnFocus?.isConnected) requestAnimationFrame(() => returnFocus.focus({ preventScroll: true }));
    };
  }, [open, closeBoard]);
  if (!board.open || (!Canvas && !Workspace)) return null;
  return createPortal(<div className="python-explanation-overlay" data-theme={theme}>
    <section className="python-explanation-dialog" role="dialog" aria-modal="true" aria-label="Доска и код для объяснения Python" ref={dialog} tabIndex={-1}>
      <header className="python-explanation-header">
        <span className="python-explanation-heading"><Presentation size={21} /><span><strong>Доска и код для объяснения</strong><small>{title || 'Python'} · страницы и примеры сохраняются</small></span></span>
        <button type="button" onClick={board.closeBoard} className="python-explanation-return"><ArrowLeft size={17} />Вернуться к задаче</button>
        <button type="button" onClick={board.closeBoard} className="python-explanation-close" aria-label="Свернуть доску"><X size={20} /></button>
      </header>
      <div className="python-explanation-canvas">
        {Workspace ? <Workspace {...context} theme={theme} pythonExplanation hideStudentPicker />
          : <Canvas {...context} pages={{ liveRoomId: board.roomId }} theme={theme} embedded hideStudentPicker containedDialogs />}
      </div>
    </section>
  </div>, document.body);
}
