export const LESSON_PAGE_SELECTION_EVENT='platform:lesson-page-selected';
export const lessonPageSelectionKey=(book,role,userId)=>`lesson-page:${book}:${role}:${userId}`;
export const lessonBookForCodeRoom=room=>typeof room==='string'&&room.startsWith('collab-')?`board-${room.slice(7).split('~student~')[0]}~pages`:'';
export const lessonCodePageId=id=>id==='main'?'page-main':id;
export const lessonBoardPageId=id=>id==='page-main'?'main':id;
const valid=id=>id==='main'||(typeof id==='string'&&/^[a-zA-Z0-9_-]{8,80}$/.test(id));
const selections=new Map();
export function readLessonPageSelection(key,fallback='main',storage=globalThis.localStorage) {
  try{const saved=storage?.getItem(key);if(valid(saved)){selections.set(key,saved);return saved;}}catch{/* Local preferences are optional. */}
  if(selections.has(key))return selections.get(key);
  const initial=valid(fallback)?fallback:'main';selections.set(key,initial);return initial;
}
export function writeLessonPageSelection(key,value,storage=globalThis.localStorage,target=globalThis.window) {
  const previous=readLessonPageSelection(key,'main',storage);
  const next=typeof value==='function'?value(previous):value;
  if(!valid(next))return previous;
  selections.set(key,next);
  try{storage?.setItem(key,next);}catch{/* Local preferences are optional. */}
  if(next!==previous)target?.dispatchEvent(new CustomEvent(LESSON_PAGE_SELECTION_EVENT,{detail:{key,pageId:next}}));
  return next;
}
