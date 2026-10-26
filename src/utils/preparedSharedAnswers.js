// Describes the input grid only. Never includes or hashes the private key.
export const preparedAnswerSchema=task=>JSON.stringify({count:task.answers?.length||task.answerCount||1,
  mode:task.answerMode||'combined',table:task.answerTable||null,format:task.format||'exact'});

// Merge server changes into untouched cells while keeping local typing. A late
// acknowledgement must not erase a keystroke made while its request was in flight.
export function createPreparedAnswerBuffer(initial,draft){
  if(!draft||!Array.isArray(draft.answers))draft=null;
  let card=initial,sequence=0,pendingSchema=draft?.answerSchema||initial.answerSchema;
  let conflict=Boolean(draft&&(draft.answerSchema?draft.answerSchema!==initial.answerSchema:draft.revision!==initial.answerRevision));
  const pending=new Map(),listeners=new Set();
  const load=values=>values.forEach(({index,value})=>{pending.set(index,{value,sequence:++sequence});});
  if(draft)load((Array.isArray(draft.patches)?draft.patches:draft.answers.map((value,index)=>({index,value}))).filter(patch=>patch&&Number.isInteger(patch.index)&&patch.index>=0&&patch.index<Math.max(initial.answers.length,draft.answers.length)&&patch.index<50&&typeof patch.value==='string'));
  const values=()=>{const answers=[...card.answers];for(const [index,edit]of pending)answers[index]=edit.value;return answers;};
  let snapshot={answers:values(),conflict};
  const publish=()=>{const next={answers:values(),conflict};if(JSON.stringify(next)===JSON.stringify(snapshot))return;snapshot=next;for(const listener of listeners)listener();};
  const receive=next=>{
    if(next.answerRevision<card.answerRevision||(next.sharedVersion??0)<(card.sharedVersion??0))return;
    if(pending.size&&pendingSchema!==next.answerSchema)conflict=true;
    card=next;
    for(const index of pending.keys())if(card.status==='solved'||card.answerMode==='independent'&&card.fieldResults?.[index]==='correct')pending.delete(index);
    if(!pending.size){pendingSchema=card.answerSchema;conflict=false;}
    publish();
  };
  return {
    subscribe:listener=>{listeners.add(listener);return()=>listeners.delete(listener);},getSnapshot:()=>snapshot,
    current:()=>card,receive,
    change:patches=>{if(!pending.size)pendingSchema=card.answerSchema;load(patches);publish();},
    batch:()=>{
      if(conflict)throw Error('Структура полей изменилась. Восстановите черновик в новых полях или оставьте общий ответ.');
      return pending.size?{answerSchema:pendingSchema,edits:[...pending].map(([index,edit])=>({index,...edit}))}:null;
    },
    acknowledge:(next,batch)=>{for(const edit of batch.edits)if(pending.get(edit.index)?.sequence===edit.sequence)pending.delete(edit.index);receive(next);publish();},
    backup:()=>pending.size?{answers:values(),revision:card.answerRevision,answerSchema:pendingSchema,patches:[...pending].map(([index,edit])=>({index,value:edit.value}))}:null,
    discard:()=>{pending.clear();pendingSchema=card.answerSchema;conflict=false;publish();},
    restore:()=>{const previous=values();if(previous.slice(card.answers.length).some(value=>value.trim()))throw Error('В черновике больше заполненных ячеек. Скопируйте лишние ответы перед восстановлением.');pending.clear();pendingSchema=card.answerSchema;conflict=false;load(previous.slice(0,card.answers.length).map((value,index)=>({index,value})).filter(({index,value})=>value!==card.answers[index]&&!(card.answerMode==='independent'&&card.fieldResults?.[index]==='correct')));publish();},
  };
}
