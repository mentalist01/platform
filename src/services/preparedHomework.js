export function openPreparedHomework(goal,studentId){window.dispatchEvent(new CustomEvent('prepared-homework-open',{detail:{snapshotId:goal.preparedId,studentId}}));}
