// Page IDs remain unchanged: nesting only affects the catalog and its display.
export function lessonPageTree(pages) {
  const roots=pages.filter(page=>!page.parentId||!pages.some(parent=>parent.id===page.parentId&&!parent.parentId));
  return roots.flatMap(page=>[{...page,depth:0},...pages.filter(child=>child.parentId===page.id&&child.id!==page.id).map(child=>({...child,depth:1}))]);
}
export const lessonPageParentChoices=(pages,id)=>pages.filter(page=>page.id!==id&&!page.parentId);
