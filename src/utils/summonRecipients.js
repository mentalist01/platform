const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,160}$/.test(id);

// The destination's private owner and the people being called are separate.
// Omitting recipientIds keeps older teacher commands compatible.
export function isSummonRecipient(command,userId){
  if(command?.studentId&&command.studentId!==userId)return false;
  if(!Object.hasOwn(command||{},'recipientIds'))return true;
  const ids=command.recipientIds;
  return Array.isArray(ids)&&ids.length>0&&ids.length<=500&&ids.every(validId)&&ids.includes(userId);
}

export function summonRecipientIds(availableIds,selectedId=''){
  const ids=[...new Set((Array.isArray(availableIds)?availableIds:[]).filter(validId))];
  if(selectedId)return ids.includes(selectedId)?[selectedId]:null;
  return ids;
}
