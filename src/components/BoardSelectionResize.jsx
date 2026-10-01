import { useEffect,useLayoutEffect,useRef,useState } from 'react';
import { Minus,Plus } from 'lucide-react';
import { fragmentBounds } from '../utils/boardFragmentClipboard.js';
import { captureBoardSelection,clampBoardSelectionScale,commitBoardSelectionResize,cornerResizeAnchor,cornerResizeScale,scaleBoardSelection } from '../utils/boardSelectionResize.js';

export function useBoardSelectionResize(props) {
  const latest=useRef(props); useLayoutEffect(()=>{latest.current=props;});
  const active=useRef(null),cleanup=useRef(null),raf=useRef(0);
  const [percent,setPercent]=useState(null);
  const selected=props.refs.items.current.filter(item=>props.view.ids.includes(item.id));
  const visible=props.view.tool==='select' && selected.length>0 && props.view.box && (selected.length>1 || !['image','task'].includes(selected[0].type));
  const enabled=Boolean(visible && !props.target.readOnly && !selected.some(item=>item.locked||item.superLocked));
  const valid=state=>state && !latest.current.target.readOnly && latest.current.view.tool==='select' && latest.current.target.roomId===state.room && latest.current.refs.doc.current===state.doc;
  useLayoutEffect(()=>{
    const c=latest.current;
    if(active.current || c.view.dragging || c.view.tool!=='select' || !c.view.ids.length)return;
    const items=c.refs.items.current.filter(item=>c.view.ids.includes(item.id));
    if(items.length===1 && ['image','task'].includes(items[0].type))return;
    const bounds=fragmentBounds(items),box=c.view.box;
    if(bounds && (!box || ['x','y','width','height'].some(key=>Math.abs(bounds[key]-box[key])>.001)))c.box(bounds);
  },[props.view.revision,props.view.ids]);
  const reset=()=>{
    cleanup.current?.(); cleanup.current=null;
    if(raf.current)cancelAnimationFrame(raf.current); raf.current=0;
    active.current=null; setPercent(null);
  };
  const snapshot=()=>{
    const c=latest.current,items=c.refs.items.current.filter(item=>c.view.ids.includes(item.id)),doc=c.refs.doc.current,yItems=c.refs.yItems.current;
    if(c.target.readOnly || !doc || !yItems || !items.length) return null;
    const captured=captureBoardSelection(yItems,items),bounds=fragmentBounds(items);
    return captured&&bounds ? {doc,yItems,room:c.target.roomId,snapshot:captured,items,bounds,factor:1,preview:new Map()} : null;
  };
  const commit=state=>{
    const c=latest.current;
    if(!valid(state))return false;
    const entries=Array.from(state.preview.values());
    if(!entries.length)return true;
    const committed=commitBoardSelectionResize({...state,entries,undo:c.refs.undo.current,origin:c.refs.origin.current});
    if(committed)c.select(entries.map(item=>item.id),fragmentBounds(entries),null);
    else c.error('Выделение изменилось у другого участника. Повторите изменение размера.');
    return committed;
  };
  const resizeBy=factor=>{
    if(!enabled)return;
    const state=snapshot(); if(!state)return;
    state.factor=clampBoardSelectionScale(state.items,factor);
    const anchor={x:state.bounds.x+state.bounds.width/2,y:state.bounds.y+state.bounds.height/2};
    state.preview=new Map(scaleBoardSelection(state.items,anchor,state.factor).map(item=>[item.id,item]));
    commit(state);
  };
  const start=(event,corner)=>{
    if(!enabled || event.button!==0)return;
    const state=snapshot(); if(!state)return;
    event.preventDefault(); event.stopPropagation(); reset(); active.current=state;
    const x=event.clientX,y=event.clientY,zoom=latest.current.view.zoom||1,anchor=cornerResizeAnchor(state.bounds,corner);
    const paint=()=>{
      raf.current=0;
      if(!valid(state))return;
      state.preview=new Map(scaleBoardSelection(state.items,anchor,state.factor).map(item=>[item.id,item]));
      latest.current.box(fragmentBounds(Array.from(state.preview.values())));
      setPercent({room:state.room,value:Math.round(state.factor*100)}); latest.current.redraw();
    };
    const move=e=>{
      e.preventDefault();
      state.factor=clampBoardSelectionScale(state.items,cornerResizeScale(state.bounds,corner,(e.clientX-x)/zoom,(e.clientY-y)/zoom));
      if(!raf.current)raf.current=requestAnimationFrame(paint);
    };
    const stop=e=>{
      if(raf.current){cancelAnimationFrame(raf.current);raf.current=0;paint();}
      const cancelled=e.type!=='pointerup';
      const committed=!cancelled&&commit(state);
      if(valid(state) && (!committed || !state.preview.size))latest.current.box(fragmentBounds(latest.current.refs.items.current.filter(item=>state.items.some(source=>source.id===item.id))));
      reset(); latest.current.redraw();
    };
    const escape=e=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();stop(e);}};
    window.addEventListener('pointermove',move); window.addEventListener('pointerup',stop); window.addEventListener('pointercancel',stop);
    window.addEventListener('blur',stop); window.addEventListener('keydown',escape,true);
    cleanup.current=()=>{
      window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',stop);window.removeEventListener('pointercancel',stop);
      window.removeEventListener('blur',stop);window.removeEventListener('keydown',escape,true);
    };
  };
  useEffect(()=>()=>{
    cleanup.current?.();cleanup.current=null;
    if(raf.current)cancelAnimationFrame(raf.current);raf.current=0;active.current=null;
  },[props.target.roomId,props.target.readOnly,props.view.tool]);
  const bounds=props.view.box,zoom=props.view.zoom||1;
  return {
    preview:item=>valid(active.current)?active.current.preview.get(item.id):null,
    buttons:visible && <><button type="button" disabled={!enabled} onClick={()=>resizeBy(.8)} aria-label="Уменьшить выделение" title="Уменьшить выделение на 20%"><Minus size={16}/></button><button type="button" disabled={!enabled} onClick={()=>resizeBy(1.25)} aria-label="Увеличить выделение" title="Увеличить выделение на 25%"><Plus size={16}/></button>{percent?.room===props.target.roomId&&<span className="board-selection-percent">{percent.value}%</span>}</>,
    handles:enabled && <div className="board-selection-resize" aria-label="Размер выделения">{['nw','ne','se','sw'].map(corner=><button key={corner} type="button" className={`board-selection-resize__handle is-${corner}`} style={{left:(bounds.x+(corner.includes('e')?bounds.width:0)-props.view.offset.x)*zoom,top:(bounds.y+(corner.includes('s')?bounds.height:0)-props.view.offset.y)*zoom}} onPointerDown={e=>start(e,corner)} aria-label={`Изменить размер выделения: ${corner}`} title="Потяните, чтобы изменить размер выделения"/>)}</div>,
  };
}
