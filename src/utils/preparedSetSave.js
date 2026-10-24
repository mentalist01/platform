export function mergePreparedSetSave(current, submitted, saved) {
  if (JSON.stringify(current) === JSON.stringify(submitted)) return saved;
  const tasks = current.tasks.map(task => {
    const normalized = saved.tasks.find(row => row.id === task.id);
    return {...task, attachments: task.attachments.map(file => {
      const asset = normalized?.attachments.find(row => row.assetId === file.assetId
        || (file.sourceFileId && row.sourceFileId === file.sourceFileId));
      return asset ? {...asset, ...file, assetId: asset.assetId} : file;
    })};
  });
  return {...current, id:saved.id, version:saved.version, teacherId:saved.teacherId,
    updatedAt:saved.updatedAt, draft:saved.draft, tasks};
}
