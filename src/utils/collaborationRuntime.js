let yjsRuntimePromise = null;
let collaborativeEditorRuntimePromise = null;

export const loadYjsRuntime = () => {
  if (!yjsRuntimePromise) {
    yjsRuntimePromise = Promise.all([
      import('yjs'),
      import('y-websocket'),
    ]).then(([Y, websocketModule]) => ({
      Y,
      WebsocketProvider: websocketModule.WebsocketProvider,
    })).catch((error) => {
      yjsRuntimePromise = null;
      throw error;
    });
  }
  return yjsRuntimePromise;
};

export const loadCollaborativeEditorRuntime = () => {
  if (!collaborativeEditorRuntimePromise) {
    collaborativeEditorRuntimePromise = Promise.all([
      loadYjsRuntime(),
      import('y-monaco'),
    ]).then(([runtime, monacoModule]) => ({
      ...runtime,
      MonacoBinding: monacoModule.MonacoBinding,
    })).catch((error) => {
      collaborativeEditorRuntimePromise = null;
      throw error;
    });
  }
  return collaborativeEditorRuntimePromise;
};
