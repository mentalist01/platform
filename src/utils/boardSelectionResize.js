import { fragmentBounds } from './boardFragmentClipboard.js';

const geometricFields = ['x','y','width','height','fontSize','strokeWidth','points','start','end','contentWidth','contentHeight'];
export const boardSelectionGeometry = item => Object.fromEntries(geometricFields.filter(key => Object.hasOwn(item,key)).map(key => [key,item[key]]));
export const boardSelectionScaleLimits = items => {
  let min = .0001, max = 100;
  for (const item of items) {
    if (item.type === 'text') {
      const size = Number(item.fontSize) || 28;
      min = Math.max(min,.1 / size); max = Math.min(max,10000 / size);
    }
    if (item.type === 'task') {
      const scale = item.width / (item.contentWidth || item.width);
      min = Math.max(min,.01 / scale); max = Math.min(max,20 / scale);
    }
    if (['image','text','shape','task'].includes(item.type)) {
      min = Math.max(min,1 / item.width,1 / item.height);
      max = Math.min(max,1e6 / item.width,1e6 / item.height);
    }
  }
  return { min, max };
};
export const clampBoardSelectionScale = (items, factor) => {
  if (!Number.isFinite(factor)) throw new Error('Некорректный размер выделения');
  const { min,max } = boardSelectionScaleLimits(items);
  return Math.max(min,Math.min(max,factor));
};
export const scaleBoardSelection = (items, anchor, factor) => {
  if (!Number.isFinite(factor) || factor <= 0 || !Number.isFinite(anchor?.x) || !Number.isFinite(anchor?.y)) throw new Error('Некорректный размер выделения');
  const point = p => ({ ...p,x:anchor.x + (p.x-anchor.x)*factor,y:anchor.y + (p.y-anchor.y)*factor });
  return items.map(item => {
    if (item.type === 'stroke') return { ...item,points:item.points.map(point),width:(Number(item.width)||3.5)*factor };
    if (item.type === 'line' || item.type === 'arrow') return { ...item,start:point(item.start),end:point(item.end),width:(Number(item.width)||3.5)*factor };
    const result = { ...item,...point({x:item.x,y:item.y}),width:item.width*factor,height:item.height*factor };
    if (item.type === 'text') result.fontSize = (Number(item.fontSize)||28)*factor;
    if (item.type === 'shape') result.strokeWidth = (Number(item.strokeWidth)||3.5)*factor;
    // Task content keeps its intrinsic dimensions; only its outer frame scales.
    if (item.type === 'task') { result.contentWidth=item.contentWidth||item.width; result.contentHeight=item.contentHeight||item.height; }
    return result;
  });
};
export const fitBoardFragmentToViewport = (items, view) => {
  const bounds=fragmentBounds(items), zoom=Number(view.zoom)||1;
  if (!bounds || !(view.width>0) || !(view.height>0)) return items;
  const factor=clampBoardSelectionScale(items,Math.min(1,view.width*.72/(Math.max(1,bounds.width)*zoom),view.height*.65/(Math.max(1,bounds.height)*zoom)));
  return factor>=1 ? items : scaleBoardSelection(items,{x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2},factor);
};
export const cornerResizeScale = (bounds, corner, dx, dy) => {
  const vx=(corner.includes('w')?-1:1)*bounds.width, vy=(corner.includes('n')?-1:1)*bounds.height;
  return 1+(dx*vx+dy*vy)/Math.max(1,vx*vx+vy*vy);
};
export const cornerResizeAnchor = (bounds, corner) => ({x:bounds.x+(corner.includes('w')?bounds.width:0),y:bounds.y+(corner.includes('n')?bounds.height:0)});

const plain = value => value?.toJSON ? value.toJSON() : value;
export const captureBoardSelection = (yItems, items) => {
  const byId=new Map(items.map(item=>[item.id,item]));
  const snapshot=[];
  for(let i=0;i<yItems.length;i++) {
    const raw=plain(yItems.get(i));
    if(byId.has(raw?.id)) {
      if(raw.locked || raw.superLocked) return null;
      snapshot.push({item:byId.get(raw.id),geometry:JSON.stringify(boardSelectionGeometry(raw))});
    }
  }
  return snapshot.length===items.length ? snapshot : null;
};
export const commitBoardSelectionResize = ({doc,yItems,undo,origin,snapshot,entries}) => {
  const next=new Map(entries.map(item=>[item.id,boardSelectionGeometry(item)]));
  const previous=new Map(snapshot.map(entry=>[entry.item.id,entry.geometry]));
  const changes=[];
  for(let i=0;i<yItems.length;i++) {
    const raw=plain(yItems.get(i));
    if(!next.has(raw?.id)) continue;
    // Do not undo a concurrent move, deletion or lock from another participant.
    if(raw.locked || raw.superLocked || JSON.stringify(boardSelectionGeometry(raw))!==previous.get(raw.id)) return false;
    changes.push({index:i,value:{...raw,...next.get(raw.id)}});
  }
  if(changes.length!==entries.length) return false;
  undo?.stopCapturing();
  doc.transact(()=>{for(const change of changes.reverse()) {yItems.delete(change.index,1);yItems.insert(change.index,[change.value]);}},origin);
  undo?.stopCapturing();
  return true;
};
