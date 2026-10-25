// Fractional coordinates remain independent of the on-screen preview scale.
// Use the same pixel boundaries in the preview and on the server.
export function imageStripGeometry(width,height,top,bottom) {
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<3
    ||typeof top!=='number'||typeof bottom!=='number'||!Number.isFinite(top)||!Number.isFinite(bottom)
    ||top<=0||bottom>=1||top>=bottom) return null;
  const from=Math.round(top*height),to=Math.round(bottom*height);
  if(from<1||to>=height||to<=from)return null;
  return {width,height,from,to,removed:to-from,outputHeight:height-(to-from),topHeight:from,bottomHeight:height-to};
}
