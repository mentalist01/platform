export function getTeacherMonthlyMockView(data,studentId){
  if(!data)return {status:'loading',row:null,assignment:null,score:null};
  const row=(data.rows||[]).find(row=>String(row.studentId)===String(studentId));
  const assignment=data.assignment||null;
  if(!row)return {status:'unavailable',row:null,assignment:null,score:null};
  if(!assignment)return {status:'unassigned',row,assignment:null,score:null};
  const scheduled=Date.parse(assignment.publishesAt)>Date.parse(data.generatedAt);
  const status=row.status==='completed'?'completed':scheduled?'scheduled':row.status||'pending';
  const score=status==='completed'&&typeof row.score==='number'&&Number.isFinite(row.score)
    ?Math.max(0,Math.min(100,Math.round(row.score))):null;
  return {status,row,assignment,score};
}
