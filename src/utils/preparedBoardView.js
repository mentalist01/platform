// Focusing an exercise pans to its beginning. Its height must never shrink
// the text just to fit the entire exercise (and writing below it) on screen.
export function preparedBoardView(anchor, {width, zoom, initial = false, top = 76}) {
  const readable = Math.max(.45, Math.min(1, (width - 100) / anchor.width));
  const nextZoom = initial ? readable : zoom;
  const left = Math.max(72, (width - anchor.width * nextZoom + 60) / 2);
  return {zoom: nextZoom, offset: {x: anchor.x - left / nextZoom, y: anchor.y - top / nextZoom}};
}

// Frame scheduling is injectable so cancellation and the final viewport can be
// verified without timing-dependent browser tests.
export function animatePreparedBoardView({from,to,onFrame,duration=440,requestFrame=requestAnimationFrame,cancelFrame=cancelAnimationFrame}) {
  let frame,start,stopped=false;
  const tick=time=>{
    if(stopped)return;
    start??=time;
    const progress=Math.min(1,Math.max(0,(time-start)/duration));
    const eased=progress*progress*(3-2*progress),mix=(a,b)=>a+(b-a)*eased;
    onFrame(progress===1?to:{zoom:mix(from.zoom,to.zoom),offset:{x:mix(from.offset.x,to.offset.x),y:mix(from.offset.y,to.offset.y)}});
    if(progress<1&&!stopped)frame=requestFrame(tick);
  };
  frame=requestFrame(tick);
  return()=>{stopped=true;cancelFrame(frame);};
}
