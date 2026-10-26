export const PREPARED_SUCCESS_DELAY_MS=1100;

// Keep the result in view before choosing the next card. Repeated Yjs refreshes
// do not restart the timer; navigation and leaving the lesson cancel it.
export function createPreparedSuccessFlow({current,onStart,onStop,onAdvance,setTimer=setTimeout,clearTimer=clearTimeout}){
  let pending=null,timer;
  const cancel=()=>{if(!pending)return;clearTimer(timer);pending=null;onStop();};
  const update=(before,after,selectedId)=>{
    if(pending&&(pending.runId!==after?.id||pending.cardId!==selectedId||after.cards.find(card=>card.id===selectedId)?.status!=='solved'))cancel();
    if(!before||before.id!==after?.id||!selectedId)return;
    const old=before.cards.find(card=>card.id===selectedId),card=after.cards.find(card=>card.id===selectedId);
    if(!old||old.status==='solved'||card?.status!=='solved')return;
    cancel();
    const event={runId:after.id,cardId:card.id,nextId:after.auto&&after.teacherCardId!==card.id?after.teacherCardId:''};
    pending=event;onStart(card.id);
    timer=setTimer(()=>{
      if(pending!==event)return;
      pending=null;onStop();
      const state=current();
      if(event.nextId&&state.run?.id===event.runId&&state.run.auto&&state.selectedId===event.cardId&&
        !state.busyCardId&&state.run.teacherCardId===event.nextId&&state.run.cards.some(card=>card.id===event.nextId))onAdvance(event.nextId);
    },PREPARED_SUCCESS_DELAY_MS);
  };
  return {update,cancel};
}
