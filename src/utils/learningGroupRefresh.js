// The list endpoint is a summary. Keep loaded panels mounted until their
// dedicated detail requests replace these fields with authoritative values.
export function mergeLearningGroupSummaries(current,summaries){
  const cached=new Map(current.map(group=>[group.id,group]));
  return summaries.map(summary=>{
    const previous=cached.get(summary.id);
    if(!previous?.homeworkDetailsLoaded)return summary;
    return {...summary,homeworkDetailsLoaded:true,lessons:previous.lessons,assignments:previous.assignments,
      materials:previous.materials,progress:previous.progress,replayStorage:previous.replayStorage};
  });
}
