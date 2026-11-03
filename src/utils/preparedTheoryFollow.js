// Follow explicit theory navigation only. Background layout, typing, previewing
// future sheets and ordinary task updates must never pull the student's camera.
export function preparedTheoryFollowTarget(before,after){
  if(!before||!after||before.id!==after.id||after.canManage||after.readOnly||after.homework)return null;
  const focus=after.theoryFocus;
  if(!focus||!Number.isSafeInteger(focus.revision)||focus.revision<=0||focus.revision===(before.theoryFocus?.revision||0))return null;
  if(focus.cardId!==after.teacherCardId||!after.cards.some(card=>card.id===focus.cardId))return null;
  return {selectedId:focus.cardId,theoryFollowRevision:focus.revision};
}
