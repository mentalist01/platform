// Follow explicit sheet/exercise navigation. Keep the historical protocol name
// for compatibility; background updates and previews never pull the camera.
export function preparedTheoryFollowTarget(before,after,selectedId){
  if(!before||!after||before.id!==after.id||after.canManage||after.readOnly||after.homework)return null;
  const focus=after.theoryFocus;
  if(!focus||!Number.isSafeInteger(focus.revision)||focus.revision<=0||focus.revision===(before.theoryFocus?.revision||0))return null;
  // Let the existing success flow congratulate the student before its flight.
  if(focus.afterSolve===selectedId&&before.cards.some(card=>card.id===selectedId&&card.status!=='solved')&&after.auto&&after.cards.some(card=>card.id===selectedId&&card.status==='solved'))return null;
  if(focus.cardId!==after.teacherCardId||!after.cards.some(card=>card.id===focus.cardId))return null;
  return {selectedId:focus.cardId,theoryFollowRevision:focus.revision};
}
