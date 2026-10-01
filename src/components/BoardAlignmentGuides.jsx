import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {alignBoardBounds,boardAlignmentTargets} from '../utils/boardAlignment.js';
import {fragmentBounds} from '../utils/boardFragmentClipboard.js';

export function useBoardAlignment(props){
  const latest=useRef(props);useLayoutEffect(()=>{latest.current=props;});
  const cache=useRef(null),clearTimer=useRef(0),[state,setGuides]=useState({room:'',guides:[]});
  const clear=()=>{clearTimeout(clearTimer.current);setGuides(current=>current.guides.length?{...current,guides:[]}:current);};
  const snap=({box,ids=[],dx=0,dy=0,free=false,linger=false})=>{
    if(!box)return{dx,dy};
    const c=latest.current,zoom=c.view.zoom||1,excluded=ids.join('|'),key=[c.target.roomId,zoom,c.view.offset.x,c.view.offset.y,c.view.width,c.view.height,excluded].join(':');
    if(cache.current?.items!==c.refs.items.current || cache.current?.key!==key){
      const viewport={x:c.view.offset.x,y:c.view.offset.y,width:c.view.width/zoom,height:c.view.height/zoom};
      cache.current={items:c.refs.items.current,key,targets:boardAlignmentTargets(c.refs.items.current,ids,viewport)};
    }
    const result=alignBoardBounds({...box,x:box.x+dx,y:box.y+dy},cache.current.targets,{zoom,disabled:free||c.target.readOnly});
    clearTimeout(clearTimer.current);setGuides({room:c.target.roomId,guides:result.guides});
    if(linger)clearTimer.current=setTimeout(clear,1200);
    return{dx:dx+result.dx,dy:dy+result.dy};
  };
  const place=items=>{
    const delta=snap({box:fragmentBounds(items),ids:items.map(item=>item.id),linger:true});
    const point=p=>({...p,x:p.x+delta.dx,y:p.y+delta.dy});
    return items.map(item=>item.type==='stroke'?{...item,points:item.points.map(point)}:item.type==='line'||item.type==='arrow'?{...item,start:point(item.start),end:point(item.end)}:{...item,...point(item)});
  };
  useEffect(()=>{
    window.addEventListener('pointerup',clear);window.addEventListener('pointercancel',clear);window.addEventListener('blur',clear);
    return()=>{clearTimeout(clearTimer.current);cache.current=null;window.removeEventListener('pointerup',clear);window.removeEventListener('pointercancel',clear);window.removeEventListener('blur',clear);};
  },[props.target.roomId]);
  const zoom=props.view.zoom||1,offset=props.view.offset,guides=state.room===props.target.roomId?state.guides:[];
  return{snap,place,clear,layer:!props.target.readOnly&&guides.length>0&&<div className="board-alignment-guides" aria-label="Направляющие выравнивания">{guides.map(guide=><div key={guide.axis} className={`board-alignment-guide is-${guide.axis}`} style={guide.axis==='x'?{left:(guide.value-offset.x)*zoom,top:(guide.from-offset.y)*zoom,height:(guide.to-guide.from)*zoom}:{left:(guide.from-offset.x)*zoom,top:(guide.value-offset.y)*zoom,width:(guide.to-guide.from)*zoom}}/>)}</div>};
}
