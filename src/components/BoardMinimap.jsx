import { useEffect, useRef, useState } from 'react';
import { minimapGrab, minimapOffset } from '../utils/boardMinimap';

export default function BoardMinimap({ canvasRef, getGeometry, onNavigate, onInteraction }) {
  const drag = useRef(null);
  const interaction = useRef(onInteraction);
  const [dragging, setDragging] = useState(false);
  useEffect(() => { interaction.current = onInteraction; }, [onInteraction]);
  useEffect(() => () => { if (drag.current) interaction.current(null); }, []);
  const point = event => {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height };
  };
  const finish = event => {
    if (drag.current?.pointerId !== event.pointerId) return;
    event.stopPropagation();
    drag.current = null;
    setDragging(false);
    onInteraction(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return <canvas ref={canvasRef} width={240} height={140}
    className={`board-minimap-canvas block${dragging ? ' is-dragging' : ''}`}
    tabIndex={0} role="group" aria-label="Миникарта доски. Перетащите синюю рамку или используйте стрелки."
    title="Перетащите синюю рамку или нажмите на нужное место"
    onPointerDown={event => {
      event.stopPropagation();
      if (event.button !== 0 || drag.current) return;
      const geometry = getGeometry();
      if (!geometry?.scale) return;
      event.preventDefault();
      event.currentTarget.focus({ preventScroll: true });
      const position = point(event);
      const grab = minimapGrab(geometry, position);
      drag.current = { pointerId: event.pointerId, geometry, grab };
      onInteraction(geometry);
      setDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
      onNavigate(minimapOffset(geometry, position, grab));
    }}
    onPointerMove={event => {
      if (drag.current?.pointerId !== event.pointerId) return;
      event.preventDefault(); event.stopPropagation();
      const { geometry, grab } = drag.current;
      onNavigate(minimapOffset(geometry, point(event), grab));
    }}
    onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}
    onKeyDown={event => {
      const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
      if (!direction) return;
      const geometry = getGeometry(); if (!geometry?.scale) return;
      event.preventDefault(); event.stopPropagation();
      const { offset, viewWidth, viewHeight, minX, minY, scale, pad } = geometry;
      const step = event.shiftKey ? 1 : 0.2;
      onNavigate(minimapOffset(geometry, {
        x: pad + (offset.x - minX + direction[0] * viewWidth * step) * scale,
        y: pad + (offset.y - minY + direction[1] * viewHeight * step) * scale,
      }, { x: 0, y: 0 }));
    }} />;
}
