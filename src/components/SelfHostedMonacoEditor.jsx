import MonacoEditor, { loader } from '@monaco-editor/react';

// Keep the editor on the same origin as the platform. The default Monaco
// loader points at jsDelivr, which makes the code workspace depend on a
// third-party CDN that is not reachable from every student's network.
const monacoVsPath = import.meta.env.DEV
  ? '/node_modules/monaco-editor/min/vs'
  : '/vendor/monaco/vs';

loader.config({
  paths: {
    vs: monacoVsPath,
  },
});

// Importing this lightweight wrapper is also the prefetch signal used by the
// application. Start Monaco immediately instead of waiting for React to mount
// the editor component.
void loader.init().catch(() => {
  // The collaborative workspace shows a timed error with a reload action.
});

export default MonacoEditor;
