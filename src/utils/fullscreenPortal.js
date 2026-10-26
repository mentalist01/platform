export const fullscreenPortalTarget=(doc=globalThis.document)=>doc?.fullscreenElement||doc?.webkitFullscreenElement||doc?.body||null;

export function subscribeFullscreenPortal(listener,doc=globalThis.document){
  if(!doc)return()=>{};
  doc.addEventListener('fullscreenchange',listener);
  doc.addEventListener('webkitfullscreenchange',listener);
  return()=>{doc.removeEventListener('fullscreenchange',listener);doc.removeEventListener('webkitfullscreenchange',listener);};
}
