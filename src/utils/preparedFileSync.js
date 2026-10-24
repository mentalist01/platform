// Only files change. Snapshot task IDs, conditions, answers, order and results
// remain authoritative. A source with a saved solution keeps its original asset.
export function preparedFileSync(tasks, latestTasks) {
  const byId = new Map(latestTasks.map(task => [task.id, task]));
  let changed = 0;
  const result = tasks.map(task => {
    const latest = byId.get(task.id);
    if (!latest) return task;
    const files = task.attachments.map(file => ({...file}));
    for (const incoming of latest.attachments) {
      const old = files.find(file => file.assetId === incoming.assetId || (file.sourceFileId && file.sourceFileId === incoming.sourceFileId));
      if (old) { old.runtime = incoming.runtime; old.runtimeName = incoming.runtimeName; }
      else files.push({...incoming});
    }
    if (JSON.stringify(files) === JSON.stringify(task.attachments)) return task;
    changed++;
    return {...task, attachments: files};
  });
  return {tasks: result, changed};
}
