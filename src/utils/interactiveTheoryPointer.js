const validRect=rect=>rect&&rect.width>0&&rect.height>0;
const fraction=(value,start,length)=>Math.max(0,Math.min(1,(value-start)/length));

// Reuse board awareness coordinates. In the enlarged copy, match the pointed
// DOM element to the same element on the board (bits, controls, text), so a
// different dialog width or responsive wrapping cannot displace the pointer.
export function interactiveTheoryPointer(event,boardRoot,anchor,boardBounds=boardRoot) {
  const sourceRoot=event.currentTarget,boardRect=boardBounds?.getBoundingClientRect();
  if(!sourceRoot||!boardRoot||!validRect(boardRect)||!anchor||
    ![event.clientX,event.clientY,anchor.x,anchor.y,anchor.width,anchor.height].every(Number.isFinite)||anchor.width<=0||anchor.height<=0)return null;
  let x=event.clientX,y=event.clientY;
  if(sourceRoot!==boardRoot){
    const path=[];let source=event.target;
    while(source&&source!==sourceRoot){
      const parent=source.parentElement,index=parent?[...parent.children].indexOf(source):-1;
      if(index<0)return null;
      path.unshift(index);source=parent;
    }
    if(source!==sourceRoot)return null;
    let counterpart=boardRoot;
    for(const index of path)counterpart=counterpart?.children[index];
    let sourceRect=event.target.getBoundingClientRect(),targetRect=counterpart?.getBoundingClientRect();
    if(!validRect(sourceRect)||!validRect(targetRect)){
      sourceRect=sourceRoot.getBoundingClientRect();targetRect=boardRoot.getBoundingClientRect();
    }
    if(!validRect(sourceRect)||!validRect(targetRect))return null;
    x=targetRect.left+fraction(x,sourceRect.left,sourceRect.width)*targetRect.width;
    y=targetRect.top+fraction(y,sourceRect.top,sourceRect.height)*targetRect.height;
  }
  return {x:anchor.x+fraction(x,boardRect.left,boardRect.width)*anchor.width,
    y:anchor.y+fraction(y,boardRect.top,boardRect.height)*anchor.height};
}
