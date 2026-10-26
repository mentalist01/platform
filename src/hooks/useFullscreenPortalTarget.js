import {useSyncExternalStore} from 'react';
import {fullscreenPortalTarget,subscribeFullscreenPortal} from '../utils/fullscreenPortal.js';

// Body-level portals are hidden behind the browser's fullscreen top layer.
// Existing dialogs must also follow the target when fullscreen changes.
export function useFullscreenPortalTarget(){
  return useSyncExternalStore(subscribeFullscreenPortal,fullscreenPortalTarget,()=>null);
}
