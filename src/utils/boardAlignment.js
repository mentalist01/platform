import { fragmentBounds } from './boardFragmentClipboard.js';

const axes=box=>({x:[box.x,box.x+box.width/2,box.x+box.width],y:[box.y,box.y+box.height/2,box.y+box.height]});
export const boardAlignmentTargets = (items,excluded,viewport) => {
  const skip=new Set(excluded);
  return items.filter(item=>!skip.has(item.id)).map(item=>({id:item.id,...fragmentBounds([item])})).filter(box=>Number.isFinite(box.x)&&(!viewport || (box.x+box.width>=viewport.x && box.x<=viewport.x+viewport.width && box.y+box.height>=viewport.y && box.y<=viewport.y+viewport.height)));
};
export const alignBoardBounds = (box,targets,{zoom=1,disabled=false,threshold=6}={}) => {
  if(disabled || !box)return{dx:0,dy:0,guides:[]};
  const moving=axes(box),limit=threshold/Math.max(.01,zoom),best={x:null,y:null};
  for(const target of targets){
    const positions=axes(target);
    for(const axis of ['x','y'])for(let a=0;a<3;a++)for(let b=0;b<3;b++){
      const delta=positions[axis][b]-moving[axis][a];
      const candidate={delta,value:positions[axis][b],target,rank:a===b?0:1};
      const current=best[axis];
      if(Math.abs(delta)<=limit && (!current || Math.abs(delta)<Math.abs(current.delta)-.001 || (Math.abs(delta-current.delta)<.001 && candidate.rank<current.rank)))best[axis]=candidate;
    }
  }
  const dx=best.x?.delta||0,dy=best.y?.delta||0,guides=[];
  if(best.x)guides.push({axis:'x',value:best.x.value,from:Math.min(box.y+dy,best.x.target.y)-12/zoom,to:Math.max(box.y+dy+box.height,best.x.target.y+best.x.target.height)+12/zoom});
  if(best.y)guides.push({axis:'y',value:best.y.value,from:Math.min(box.x+dx,best.y.target.x)-12/zoom,to:Math.max(box.x+dx+box.width,best.y.target.x+best.y.target.width)+12/zoom});
  return{dx,dy,guides};
};
export const selectionMovePreview = (item,drag,pending,imageDrag) => {
  if(!item)return item;
  if(imageDrag?.active && item.id===imageDrag.id)return{...item,x:imageDrag.x,y:imageDrag.y};
  if(!drag?.active || !pending)return item;
  const source=drag.items?.find(entry=>entry.id===item.id);if(!source)return item;
  const point=p=>({...p,x:p.x+pending.dx,y:p.y+pending.dy});
  if(item.type==='stroke')return{...item,points:source.points.map(point)};
  if(item.type==='line'||item.type==='arrow')return{...item,start:point(source.start),end:point(source.end)};
  return{...item,...point(source),id:item.id};
};
