const editable=target=>Boolean(target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="dialog"],.monaco-editor,[data-board-selectable]'));

export function installBoardSelectionGuard(root){
  if(!root)return()=>{};
  const select=event=>{if(!editable(event.target))event.preventDefault();};
  const pointer=event=>{
    if(editable(event.target))return;
    const selection=root.ownerDocument.getSelection?.();
    if(selection?.rangeCount&&(root.contains(selection.anchorNode)||root.contains(selection.focusNode)))selection.removeAllRanges();
  };
  root.addEventListener('selectstart',select);
  root.addEventListener('pointerdown',pointer,true);
  return()=>{root.removeEventListener('selectstart',select);root.removeEventListener('pointerdown',pointer,true);};
}
