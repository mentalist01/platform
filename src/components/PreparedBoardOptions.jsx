import {useCallback,useEffect,useRef} from 'react';

function fitOptions(details,menu,surface) {
  if(!details.current?.open||!menu.current||!surface.current)return;
  const board=surface.current.getBoundingClientRect(),anchor=details.current.getBoundingClientRect();
  const inset=Math.min(68,Math.max(8,board.width*.15)),width=Math.min(270,Math.max(1,board.width-inset-8));
  const preferred=anchor.right-width<board.left+inset?anchor.left:anchor.right-width;
  const left=Math.max(board.left+inset,Math.min(preferred,board.right-width-8));
  Object.assign(menu.current.style,{width:`${width}px`,left:`${left-anchor.left}px`,right:'auto',top:'38px',maxHeight:`${Math.max(100,board.bottom-anchor.bottom-14)}px`});
}
export default function PreparedBoardOptions({surface,children}) {
  const details=useRef(null),menu=useRef(null);
  const position=useCallback(()=>fitOptions(details,menu,surface),[surface]);
  useEffect(()=>{
    const observer=new ResizeObserver(position);
    if(surface.current)observer.observe(surface.current);
    window.addEventListener('resize',position);document.addEventListener('scroll',position,true);
    const pointer=event=>{if(details.current?.open&&!details.current.contains(event.target))details.current.open=false;};
    const keyboard=event=>{if(event.key==='Escape'&&details.current?.open){details.current.open=false;details.current.querySelector('summary')?.focus();}};
    document.addEventListener('pointerdown',pointer);document.addEventListener('keydown',keyboard);
    return()=>{observer.disconnect();window.removeEventListener('resize',position);document.removeEventListener('scroll',position,true);document.removeEventListener('pointerdown',pointer);document.removeEventListener('keydown',keyboard);};
  },[surface,position]);
  return <details ref={details} className="prepared-board-options" onToggle={position}><summary aria-label="Управление набором" title="Управление набором">⋯</summary><div ref={menu} className="prepared-board-options-menu">{children}</div></details>;
}
