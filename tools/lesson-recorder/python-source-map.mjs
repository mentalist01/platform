// Recording parts form one logical source; editing never rewrites the originals.
export function pythonSources(job) {
  const sources = [...(job.pythonPreviousSources || []), {id:job.id,file:job.file,start:job.pythonCaptureOffset || 0,end:job.pythonTimeline.sourceEnd}];
  let boundary = 0;
  if (sources.length > 100) throw Error('Слишком много продолжений записи');
  for (const source of sources) {
    if (!source.id || ![source.start,source.end].every(Number.isFinite) || source.start !== boundary || source.end < source.start) throw Error('Повреждён список частей записи. Исходники сохранены.');
    boundary = source.end;
  }
  return sources;
}
export function pythonSourceAt(job, at) { return pythonSources(job).find(source => at >= source.start && at < source.end); }
export function pythonSourceRanges(job, clip) {
  return pythonSources(job).filter(source=>clip.start < source.end && clip.end > source.start)
    .map(source=>({...source,startInFile:Math.max(clip.start,source.start)-source.start,endInFile:Math.min(clip.end,source.end)-source.start}));
}
