const finiteBounds = box => box && ['minX', 'minY', 'maxX', 'maxY'].every(key => Number.isFinite(box[key]));
const intersects = (a, b) => a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;

export function boardItemBounds(item) {
  if (!item) return null;
  if (item.type === 'stroke') {
    const points=Array.isArray(item.points)?item.points:[];
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for(const point of points){if(!point)continue;minX=Math.min(minX,point.x||0);minY=Math.min(minY,point.y||0);maxX=Math.max(maxX,point.x||0);maxY=Math.max(maxY,point.y||0);}
    return Number.isFinite(minX)?{minX,minY,maxX,maxY}:null;
  }
  if(item.type==='line'||item.type==='arrow'){
    const start=item.start||{},end=item.end||{};
    return {minX:Math.min(start.x||0,end.x||0),minY:Math.min(start.y||0,end.y||0),maxX:Math.max(start.x||0,end.x||0),maxY:Math.max(start.y||0,end.y||0)};
  }
  if(['shape','text','task','file','image'].includes(item.type)){
    const x=item.x||0,y=item.y||0;
    return {minX:x,minY:y,maxX:x+(item.width||0),maxY:y+(item.height||0)};
  }
  return null;
}

// Stored board items are immutable. Reuse their geometry while panning, and
// rebuild only the small grid when Yjs replaces the item array. Paint indexes
// stay in document order so translucent ink and overlapping images keep their z-order.
export function createBoardRenderIndex(getBounds, {cellSize = 512, maxCells = 64} = {}) {
  const geometry = new WeakMap();
  let source, boxes, cells, large, ids;
  const bounds = item => {
    if (!item || typeof item !== 'object') return null;
    if (geometry.has(item)) return geometry.get(item);
    const raw = getBounds(item);
    const width = Math.max(0, Number(item.strokeWidth ?? item.width) || 0);
    const pad = item.type === 'stroke' || item.type === 'line' ? width / 2 + 2
      : item.type === 'arrow' ? Math.max(16, width * 5) : Math.max(2, Number(item.strokeWidth) || 0);
    const box = finiteBounds(raw) ? {minX:raw.minX-pad,minY:raw.minY-pad,maxX:raw.maxX+pad,maxY:raw.maxY+pad} : null;
    geometry.set(item, box);
    return box;
  };
  const range = box => ({x1:Math.floor(box.minX/cellSize),y1:Math.floor(box.minY/cellSize),x2:Math.floor(box.maxX/cellSize),y2:Math.floor(box.maxY/cellSize)});
  const prepare = items => {
    if (source === items) return;
    source=items;boxes=[];cells=new Map();large=[];ids=new Map();
    items.forEach((item,index)=>{
      ids.set(item?.id,index);
      const box=bounds(item);boxes.push(box);
      if(!box){large.push(index);return;}
      const r=range(box);
      if((r.x2-r.x1+1)*(r.y2-r.y1+1)>maxCells){large.push(index);return;}
      for(let x=r.x1;x<=r.x2;x++)for(let y=r.y1;y<=r.y2;y++){
        const key=x+':'+y;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(index);
      }
    });
  };
  return {
    indexes(items, viewport, forcedIds=[]) {
      prepare(items);
      if(!finiteBounds(viewport))return items.map((_,index)=>index);
      const r=range(viewport),candidates=new Set(large);
      // Very distant/zoomed-out views must not allocate a huge grid walk.
      if((r.x2-r.x1+1)*(r.y2-r.y1+1)>4096)boxes.forEach((box,index)=>{if(!box||intersects(box,viewport))candidates.add(index);});
      else for(let x=r.x1;x<=r.x2;x++)for(let y=r.y1;y<=r.y2;y++)for(const index of cells.get(x+':'+y)||[])if(!boxes[index]||intersects(boxes[index],viewport))candidates.add(index);
      for(const id of forcedIds){const index=ids.get(id);if(index!==undefined)candidates.add(index);}
      return [...candidates].filter(index=>!boxes[index]||forcedIds.includes(items[index]?.id)||intersects(boxes[index],viewport)).sort((a,b)=>a-b);
    },
  };
}
