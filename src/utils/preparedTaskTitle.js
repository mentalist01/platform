export const preparedTaskTitle = (task, index = task?.index ?? 0) => (
  String(task?.title ?? '').trim() || `Задача ${(task?.sourceIndex ?? index) + 1}`
);

export const preparedTaskCodeName = task => {
  const title = preparedTaskTitle(task);
  return title.toLowerCase().endsWith('.py') ? title : `${title}.py`;
};
