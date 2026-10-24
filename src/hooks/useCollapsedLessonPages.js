import {useState} from 'react';
import {collapsedLessonPageTree} from '../utils/lessonPageTree.js';
export function useCollapsedLessonPages(pages,currentId,scope){
  const parentId=pages.find(page=>page.id===currentId)?.parentId;
  const key=JSON.stringify([scope,currentId,parentId]);
  const [state,setState]=useState(()=>({scope,key,expanded:new Set(parentId?[parentId]:[])}));
  if(state.key!==key){const expanded=state.scope===scope?new Set(state.expanded):new Set();if(parentId)expanded.add(parentId);setState({scope,key,expanded});}
  return {visiblePages:collapsedLessonPageTree(pages,state.expanded),toggleParent:id=>setState(previous=>{const expanded=new Set(previous.expanded);if(expanded.has(id))expanded.delete(id);else expanded.add(id);return {...previous,expanded};})};
}
