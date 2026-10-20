const names = new Intl.Collator('ru', {numeric:true,sensitivity:'base'});
export function groupRecordingCatalog(groups = [], recordings = []) {
  return groups.map(group => {
    const lessons = recordings.filter(entry=>entry.groupId===group.id).slice().sort((a,b)=>
      (Date.parse(a.startAt)||0)-(Date.parse(b.startAt)||0) || String(a.id).localeCompare(String(b.id)));
    return {...group,recordings:lessons.map((entry,index)=>({...entry,lessonNumber:index+1})),count:lessons.length,
      firstAt:lessons[0]?.startAt,lastAt:lessons.at(-1)?.startAt};
  }).sort((a,b)=>names.compare(a.name,b.name));
}
