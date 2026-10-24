// Prepared conditions are DOM images above the ordinary canvas. Composite ink
// only where that DOM hides it; never duplicate translucent strokes elsewhere.
export function paintPreparedInk(cache,{canvas,overlay,reference=overlay,width,height,zoom,offset,regions,items,preview,draw,createCanvas}) {
  if(!canvas||!overlay)return;
  const ratio=reference.width/Math.max(1,width);
  if(!cache.base)cache.base=createCanvas();
  // The live overlay can resize after the committed scene in the same frame.
  // Use the committed canvas dimensions to avoid stretching saved ink.
  const base=cache.base;if(base.width!==reference.width)base.width=reference.width;if(base.height!==reference.height)base.height=reference.height;
  if(canvas.width!==base.width)canvas.width=base.width;if(canvas.height!==base.height)canvas.height=base.height;
  const ctx=base.getContext('2d');ctx.clearRect(0,0,base.width,base.height);
  const visible=regions.filter(region=>region.card.x<width&&region.card.y<height&&region.card.x+region.card.width>0&&region.card.y+region.card.height>0);
  cache.regions=visible;cache.ratio=ratio;
  const anchors=new Set(regions.map(region=>region.anchorId));
  for(const region of visible){
    ctx.save();ctx.setTransform(ratio,0,0,ratio,0,0);ctx.beginPath();ctx.rect(region.body.x,region.body.y,region.body.width,region.body.height);ctx.clip();
    ctx.setTransform(ratio*zoom,0,0,ratio*zoom,-offset.x*ratio*zoom,-offset.y*ratio*zoom);
    const anchorIndex=items.findIndex(item=>item.id===region.anchorId);
    items.forEach((item,index)=>{if(anchors.has(item.id))return;if(['stroke','line','arrow','shape','text'].includes(item.type)||index>anchorIndex)draw(ctx,preview(item));});
    ctx.restore();
  }
  compositePreparedInk(cache,canvas,overlay);
}
export function compositePreparedInk(cache,canvas,overlay){
  if(!canvas||!cache.base)return;
  const ctx=canvas.getContext('2d');ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);
  if(!cache.regions?.length)return;
  ctx.drawImage(cache.base,0,0);ctx.save();ctx.beginPath();
  for(const {card} of cache.regions)ctx.rect(card.x*cache.ratio,card.y*cache.ratio,card.width*cache.ratio,card.height*cache.ratio);
  ctx.clip();ctx.drawImage(overlay,0,0);ctx.restore();
}
