// Follow explicit sheet/exercise navigation. Keep the historical protocol name
// for compatibility; background updates and previews never pull the camera.
export function preparedTheoryFollowTarget(before,after,selectedId){
  if(before===undefined||!after||after.canManage||after.readOnly||after.homework)return null;
  const focus=after.theoryFocus;
  if(!focus||!Number.isSafeInteger(focus.revision)||focus.revision<=0)return null;
  const card=after.cards.find(card=>card.id===focus.cardId);
  if(!card||card.id!==after.teacherCardId)return null;
  // Null is a page already observed without a set; undefined is a first load.
  if(before?.id!==after.id){
    return card.kind==='theory'&&card.index===0
      ?{selectedId:card.id,theoryFollowRevision:focus.revision}
      :null;
  }
  if(focus.revision<=(before.theoryFocus?.revision||0))return null;
  // Let the existing success flow congratulate the student before its flight.
  if(focus.afterSolve===selectedId&&before.cards.some(card=>card.id===selectedId&&card.status!=='solved')&&after.auto&&after.cards.some(card=>card.id===selectedId&&card.status==='solved'))return null;
  return {selectedId:focus.cardId,theoryFollowRevision:focus.revision};
}
