let activeQuestionWindow = null;
const listeners = new Set();

const isOpenWindow = (windowObject) => Boolean(windowObject && windowObject.closed !== true);

const notify = (type) => {
  const active = isOpenWindow(activeQuestionWindow);
  listeners.forEach((listener) => listener({ active, type }));
};

export const isQuestionPictureInPictureActive = () => isOpenWindow(activeQuestionWindow);

export const setQuestionPictureInPictureWindow = (windowObject) => {
  activeQuestionWindow = isOpenWindow(windowObject) ? windowObject : null;
  notify(activeQuestionWindow ? 'open' : 'close');
};

export const reportQuestionPictureInPictureActivity = () => notify('activity');

export const clearQuestionPictureInPictureWindow = (windowObject = null) => {
  if (windowObject && activeQuestionWindow !== windowObject) return;
  activeQuestionWindow = null;
  notify('close');
};

export const subscribeQuestionPictureInPicture = (listener) => {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
};
