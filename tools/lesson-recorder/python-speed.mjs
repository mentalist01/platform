export function pythonExportSpeed(value = 1) {
  const normalized=typeof value==='string'?value.trim().replace(',','.'):value;
  const speed=typeof normalized==='number'||typeof normalized==='string'&&normalized!==''?Number(normalized):NaN;
  if(!Number.isFinite(speed)||speed<1||speed>100)throw Error('Укажите скорость от 1 до 100, например 1,2 или 1,35');
  return speed;
}
export const pythonExportDuration = timeline => (timeline?.clips.reduce((sum,clip)=>sum+clip.end-clip.start,0)||0)/pythonExportSpeed(timeline?.speed);
// Each atempo stage stays within its high-quality range; pitch is preserved.
export function pythonTempoFilters(value) {
  let speed=pythonExportSpeed(value);const filters=[];
  while(speed>2){filters.push('atempo=2');speed/=2;}
  filters.push(`atempo=${speed}`);return filters.join(',');
}
export const pythonPreviewSpeed = timeline => {const speed=pythonExportSpeed(timeline?.speed);return speed<=4?speed:1;};
