const fail=message=>{throw Object.assign(new Error(message),{status:409});};
export function preparedItemBox(item){
  const points=Array.isArray(item.points)?item.points:item.start&&item.end?[item.start,item.end]:null;
  return points?.length?{x:Math.min(...points.map(p=>p.x)),y:Math.min(...points.map(p=>p.y)),right:Math.max(...points.map(p=>p.x)),bottom:Math.max(...points.map(p=>p.y))}:{x:Number(item.x),y:Number(item.y),right:Number(item.x)+Number(item.width),bottom:Number(item.y)+Number(item.height)};
}
export function preparedTheoryPoint(items,anchor,width,height,offset){
  const gap=offset?.gap??48,point={x:anchor.x+anchor.width+gap,y:anchor.y+(offset?.align||0)};
  const boxes=items.filter(item=>item.id!==anchor.id).map(preparedItemBox).filter(box=>Object.values(box).every(Number.isFinite));
  for(let attempt=0;attempt<=boxes.length;attempt++){
    const overlapping=boxes.filter(box=>box.bottom>=point.y&&box.y<=point.y+height&&box.right>=point.x&&box.x<=point.x+width);
    if(!overlapping.length)break;
    point.x=Math.max(...overlapping.map(box=>box.right))+gap;
  }
  if(point.x+width>900_000)fail('На этой странице мало места. Создайте следующую страницу.');
  return point;
}
export function preparedNextPoint(items,anchor,width=Math.max(680,Number(anchor.width)||0),offset){
  const gap=offset?.gap??Math.max(32,Math.min(64,Math.round(anchor.height*.12))),x=anchor.x+(offset?.align||0);
  let bottom=anchor.y+anchor.height+gap;
  for(const item of items){
    if(item.id&&item.id===anchor.id)continue;
    const box=preparedItemBox(item);
    if(!Object.values(box).every(Number.isFinite)||box.bottom<anchor.y)continue;
    if(box.right>=Math.min(anchor.x,x)-120&&box.x<=Math.max(anchor.x+anchor.width,x+width)+120)bottom=Math.max(bottom,box.bottom+gap);
  }
  if(bottom>900_000)fail('На этой странице мало места. Создайте следующую страницу.');
  return {x,y:bottom};
}
export function preparedTheorySheetSize(asset,display){
  const scale=1.3*(display?.scalePercent||100)/100;
  const imageHeight=Math.min(900,600*(asset?.height||400)/(asset?.width||600));
  return {width:640*scale,height:(28+imageHeight)*scale};
}
// Canvas and lesson placement share the same obstacle rules. A neighbouring
// card only matters when it crosses the incoming sheet's column; ink also
// keeps the usual margin around the reference sheet.
export function preparedTheorySheetPoint(items,anchor,size,display={},blockCount=3){
  const direction=display?.placement||'auto';
  const hasNotesBelow=blockCount<=2&&items.some(item=>{
    if(item.id?.startsWith('prepared-'))return false;
    const box=preparedItemBox(item);
    return Object.values(box).every(Number.isFinite)&&box.bottom>anchor.y+anchor.height&&box.right>=anchor.x-120&&box.x<=anchor.x+anchor.width+120;
  });
  if(direction==='right'||direction==='auto'&&blockCount<=2&&!hasNotesBelow){
    const y=anchor.y+(display?.offset?.align||0);
    const rightEdge=items.reduce((edge,item)=>{
      if(item.id?.startsWith('prepared-'))return edge;
      const box=preparedItemBox(item);
      return box.x<=anchor.x+anchor.width+120&&box.bottom>=Math.min(y,anchor.y)&&box.y<=Math.max(y+size.height,anchor.y+anchor.height)&&Number.isFinite(box.right)?Math.max(edge,box.right):edge;
    },anchor.x+anchor.width);
    return preparedTheoryPoint(items,{...anchor,width:rightEdge-anchor.x},size.width,size.height,display?.offset);
  }
  const x=anchor.x+(display?.offset?.align||0);
  const column=items.filter(item=>!item.id?.startsWith('prepared-')||item.x+item.width>x&&item.x<x+size.width);
  return preparedNextPoint(column,anchor,Math.max(anchor.width,size.width),display?.offset);
}
export function preparedTheoryCanvasLayout(images,assets,display={},notes=[]){
  const rows=[],items=[];
  for(const [index,id] of images.entries()){
    const setting=display[id]||{},size=preparedTheorySheetSize(assets[id],setting);
    const reference=rows.find(row=>row.id===setting.relativeTo)||rows.at(-1);
    const point=reference?preparedTheorySheetPoint(items,{...reference,id:'prepared-'+reference.id},size,setting,images.length):{x:0,y:0};
    const row={id,index,...point,...size,referenceId:reference?.id||''};
    rows.push(row);items.push({...row,id:'prepared-'+id});
    for(const note of notes.filter(note=>note.relativeTo===id)){
      const right=note.placement==='right';
      items.push({...note,id:'preview-note-'+id+'-'+note.placement,x:right?row.x+row.width+24:row.x+30,y:right?row.y+60:row.y+row.height+24,width:right?280:Math.min(600,row.width*.85),height:right?Math.min(240,row.height):140});
    }
  }
  return {rows,notes:items.filter(item=>item.id.startsWith('preview-note-'))};
}
// Pick a previous sheet by geometry rather than by its list position. A drop
// under the first column links back to it even when sheet 2 is on the right.
export function preparedTheoryDropSetting(point,candidates,current={}){
  const choices=candidates.flatMap(anchor=>{
    const right=point.x-anchor.x-anchor.width,below=point.y-anchor.y-anchor.height;
    return [
      {anchor,placement:'right',gap:right,align:point.y-anchor.y,score:Math.max(0,right)+Math.abs(point.y-anchor.y)*.65+(right<32?3000:0)},
      {anchor,placement:'below',gap:below,align:point.x-anchor.x,score:Math.max(0,below)+Math.abs(point.x-anchor.x)*.65+(below<32?3000:0)},
    ];
  }).sort((a,b)=>a.score-b.score);
  const chosen=choices[0];if(!chosen)return null;
  return {...current,relativeTo:chosen.anchor.id,placement:chosen.placement,offset:{gap:Math.max(32,Math.min(4000,Math.round(chosen.gap))),align:Math.max(-4000,Math.min(4000,Math.round(chosen.align)))}};
}
