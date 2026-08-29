const DEFAULT_TASK_WIDTH = 720;
const DEFAULT_TASK_HEIGHT = 640;

// A replay is an immutable visual record. Legacy live-board migrations must
// not resize its task cards when the same state is mounted in the fullscreen
// sandbox, otherwise the condition can be pushed behind the answer panel.
export const prepareLessonReplayBoardSandboxItems = (items, options = {}) => {
  const layoutVersion = Math.max(1, Math.round(Number(options.layoutVersion) || 1));
  const defaultWidth = Math.max(1, Number(options.defaultWidth) || DEFAULT_TASK_WIDTH);
  const defaultHeight = Math.max(1, Number(options.defaultHeight) || DEFAULT_TASK_HEIGHT);

  return (Array.isArray(items) ? items : []).map((item) => {
    if (!item || typeof item !== 'object' || item.type !== 'task') return item;

    const hasStoredContentSize = Number(item.contentWidth) > 0 && Number(item.contentHeight) > 0;
    const storedLayoutVersion = Math.max(0, Math.round(Number(item.codePanelLayoutVersion) || 0));
    if (hasStoredContentSize && storedLayoutVersion >= layoutVersion) return item;

    return {
      ...item,
      ...(!hasStoredContentSize ? {
        contentWidth: Math.max(1, Number(item.width) || defaultWidth),
        contentHeight: Math.max(1, Number(item.height) || defaultHeight),
      } : {}),
      codePanelLayoutVersion: Math.max(layoutVersion, storedLayoutVersion),
    };
  });
};
