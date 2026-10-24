// Append only new task identities. Existing lesson tasks stay as they were,
// including their order, private answers, files and linked code documents.
export function preparedQueueSync(tasks, latestTasks) {
  const known=new Set(tasks.map(task=>task.id));
  const added=latestTasks.filter(task=>{if(known.has(task.id))return false;known.add(task.id);return true;});
  return {tasks:added.length?[...tasks,...structuredClone(added)]:tasks,added:added.length};
}
