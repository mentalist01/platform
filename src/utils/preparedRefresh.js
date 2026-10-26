// Coalesce the initial fetch and Yjs sync signal. A newer signal received
// during an old request still schedules one trailing refresh; it is never lost.
export function createPreparedRefresh({read,apply,current,onError,active}) {
  let pending=null,queued=null,forced=false,disposed=false,abort;
  const covered=signal=>signal&&current()?.id===signal.runId&&current()?.version>=signal.version;
  const refresh=signal=>{
    if(disposed||!active()||covered(signal))return Promise.resolve();
    if(pending){if(signal){if(!queued||queued.runId!==signal.runId||signal.version>queued.version)queued=signal;}else forced=true;return pending;}
    abort=new AbortController();
    pending=Promise.resolve().then(()=>read(abort.signal)).then(run=>{if(!disposed&&active())apply(run);}).catch(error=>{if(!disposed&&active()&&error.name!=='AbortError')onError(error);}).finally(()=>{
      pending=null;const signal=queued,force=forced;queued=null;forced=false;
      if(!disposed&&active()&&(force||signal&&!covered(signal)))void refresh();
    });
    return pending;
  };
  return {refresh,dispose(){disposed=true;queued=null;forced=false;abort?.abort();}};
}
