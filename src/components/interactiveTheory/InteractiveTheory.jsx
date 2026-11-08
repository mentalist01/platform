import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Maximize2,Move,X} from 'lucide-react';
import {useFullscreenPortalTarget} from '../../hooks/useFullscreenPortalTarget.js';
import {INTERACTIVE_THEORY_MAP,interactiveTheoryState,updateInteractiveTheory} from '../../utils/interactiveTheoryState.js';
import {interactiveTheoryPointer} from '../../utils/interactiveTheoryPointer.js';
import {registeredInteractiveTheory} from './registry.jsx';
import './InteractiveTheory.css';

export default function InteractiveTheory({interactive,cardId,doc,readOnly=false,preview=false,disabled=false,boardTool='select',worldAnchor,onCursor}) {
  const definition=registeredInteractiveTheory(interactive?.typeId),card={id:cardId,interactive};
  const [local,setLocal]=useState(()=>definition?.reset(interactive.params)),[shared,setShared]=useState(()=>interactiveTheoryState(doc,card));
  const [expanded,setExpanded]=useState(false),[positioning,setPositioning]=useState(false),dialog=useRef(null),returnFocus=useRef(null),shell=useRef(null);
  const portalTarget=useFullscreenPortalTarget();
  const signature=JSON.stringify(interactive);
  useEffect(()=>{setLocal(definition?.reset(interactive.params));},[signature]);
  useEffect(()=>{
    if(!doc||preview)return;
    const map=doc.getMap(INTERACTIVE_THEORY_MAP),refresh=()=>setShared(interactiveTheoryState(doc,card));
    const update=event=>{if([...event.keysChanged].some(key=>key.startsWith(`${cardId}:`)))refresh();};
    map.observe(update);refresh();return()=>map.unobserve(update);
  },[doc,cardId,signature,preview]);
  useEffect(()=>{
    if(!expanded)return;
    dialog.current?.focus();
    return()=>returnFocus.current?.focus?.();
  },[expanded]);
  if(!definition)return <div className="interactive-theory-unavailable">Эта карточка пока недоступна. Обновите платформу.</div>;
  const state=preview||!doc?local:shared||definition.reset(interactive.params);
  const update=patch=>{
    if(readOnly||disabled)return;
    if(preview||!doc)setLocal(previous=>definition.normalizeState({...previous,...patch},interactive.params));
    else updateInteractiveTheory(doc,card,patch);
  };
  const reset=()=>{if(readOnly||disabled)return;if(preview||!doc)setLocal(definition.reset(interactive.params));else updateInteractiveTheory(doc,card,{}, {reset:true});};
  const Component=definition.Component;
  const active=!disabled&&!positioning&&(preview||boardTool==='select');
  const content=<Component state={state} onChange={update} onReset={reset} disabled={readOnly||disabled} compact={!expanded}/>;
  const stop=event=>event.stopPropagation();
  const clearCursor=()=>{if(!preview&&!disabled)onCursor?.(null);};
  const movePointer=event=>{
    stop(event);
    if(preview||disabled||!onCursor)return;
    const point=interactiveTheoryPointer(event,shell.current,worldAnchor,shell.current?.closest('[data-anchor-id]')||shell.current);
    if(point)onCursor(point);
  };
  const close=()=>{clearCursor();setExpanded(false);};
  return <>
    {!disabled&&<div className="interactive-theory-tools" onPointerDown={stop}>
      {!preview&&<button type="button" aria-pressed={positioning} onClick={()=>setPositioning(!positioning)}><Move size={13}/>{positioning?'Включить кнопки':'Переместить'}</button>}
      <button type="button" aria-label="Открыть интерактивную карточку крупнее" onClick={event=>{returnFocus.current=event.currentTarget;setExpanded(true);}}><Maximize2 size={14}/></button>
    </div>}
    <div ref={shell} className={`interactive-theory-shell${active?' is-interacting':''}`} style={{pointerEvents:active?'auto':'none'}} onPointerDown={stop} onPointerMove={movePointer} onPointerLeave={clearCursor} onPointerUp={stop} onDoubleClick={stop} onKeyDown={stop} onWheel={stop}>{content}</div>
    {expanded&&createPortal(<div className="interactive-theory-modal" onPointerDown={event=>{stop(event);if(event.target===event.currentTarget)close();}} onKeyDown={event=>{
      stop(event);if(event.key==='Escape')close();
      if(event.key==='Tab'){const nodes=[...dialog.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled)')];const first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
    }}><section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label={definition.name}><button className="interactive-theory-close" type="button" aria-label="Закрыть интерактивную карточку" onClick={close}><X size={20}/></button><div onPointerMove={movePointer} onPointerLeave={clearCursor}>{content}</div></section></div>,portalTarget)}
  </>;
}
