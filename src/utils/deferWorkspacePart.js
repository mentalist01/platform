import { createElement } from 'react';
import DeferredWorkspacePart from '../components/DeferredWorkspacePart.jsx';

// Called once at module scope so that navigation and parent re-renders do not
// recreate the component type or reset the tool's unsaved state.
export function createDeferredWorkspacePart(load, options = {}) {
  return function DeferredPart(props) {
    return createElement(DeferredWorkspacePart, { ...options, load, componentProps: props });
  };
}
