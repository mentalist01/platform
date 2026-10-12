import {createHash, randomUUID} from 'node:crypto';
import {boardPagesList, FIRST_BOARD_PAGE_ID, MAX_BOARD_PAGES} from '../src/utils/boardPages.js';
import {COLLAB_CODE_PAGES_KEY, COLLAB_CODE_PAGES_DELETED_KEY, COLLAB_CODE_PAGE_ALIASES_KEY,
  COLLAB_SOLUTION_PAGES_KEY, COLLAB_SOLUTIONS_MAP_KEY, DEFAULT_COLLAB_CODE_PAGE_ID,
  DEFAULT_COLLAB_SOLUTION_ID, DEFAULT_SOLUTION_NAME, createEmptyCollabSolution,
  listCollabCodePages} from '../src/utils/collabSolutions.js';

export const LESSON_PAGE_ORIGIN='lesson-pages:projection';
const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{8,80}$/.test(id);
const codeId=id=>id===FIRST_BOARD_PAGE_ID?DEFAULT_COLLAB_CODE_PAGE_ID:id;
const put=(map,key,value)=>{if(JSON.stringify(map.get(key))!==JSON.stringify(value))map.set(key,value);};
const title=value=>{const text=typeof value==='string'?value.trim():'';if(!text||text.length>80)throw Error('Введите название страницы длиной до 80 символов.');return text;};

export function lessonPageRooms(target) {
  if(!target||!['board','board-private','collab','collab-private'].includes(target.kind))return null;
  const codeRoom=target.kind.startsWith('collab')?target.roomId:'';
  if(target.targetType==='student')return {book:`board-${target.teacherId}-${target.studentId}~pages`,codes:[`collab-${target.teacherId}-${target.studentId}`],codeRoom};
  const lesson=target.session;
  if(!lesson?.id)return null;
  const participants=lesson.participantIdsSnapshot||lesson.participantIds||[];
  return {book:`board-lesson-${lesson.id}~pages`,codes:[`collab-lesson-${lesson.id}`,...[...new Set(participants)].map(id=>`collab-lesson-${lesson.id}~student~${id}`)],codeRoom};
}

// Link matching unique titles once. The original code channels never move or
// get replaced: only their page membership and catalog metadata are projected.
export function importLegacyCodePages(book,doc,room) {
  const pages=book.getMap('pages'),aliases=doc.getMap(COLLAB_CODE_PAGE_ALIASES_KEY);
  const archive=doc.getMap('lessonLegacyCodePages'),claimed=new Set([FIRST_BOARD_PAGE_ID]);
  for(const page of listCollabCodePages(doc)) {
    if(aliases.has(page.id))continue;
    let target=FIRST_BOARD_PAGE_ID;
    if(page.id!==DEFAULT_COLLAB_CODE_PAGE_ID) {
      const visible=boardPagesList(pages);
      const matches=visible.filter(p=>p.title===page.name&&!claimed.has(p.id));
      target=visible.some(p=>p.id===page.id&&!claimed.has(p.id))?page.id:(matches.length===1?matches[0].id:'');
      if(!target) {
        if(visible.length>=MAX_BOARD_PAGES)throw Error('Слишком много страниц для объединения. Существующие материалы сохранены.');
        target=validId(page.id)&&!pages.has(page.id)?page.id:`code-${createHash('sha256').update(room+'\0'+page.id).digest('hex').slice(0,24)}`;
        put(pages,target,{title:page.name,createdAt:page.createdAt||Date.now()});
      }
    } else if(!pages.has(FIRST_BOARD_PAGE_ID)&&page.name!=='Страница 1') {
      put(pages,FIRST_BOARD_PAGE_ID,{title:page.name,createdAt:0});
    }
    claimed.add(target);
    put(archive,page.id,page);
    put(aliases,page.id,target);
  }
}

export function projectLessonPages(book,doc,bookRoom) {
  const pages=book.getMap('pages'),catalog=doc.getMap(COLLAB_CODE_PAGES_KEY),deleted=doc.getMap(COLLAB_CODE_PAGES_DELETED_KEY);
  const aliases=doc.getMap(COLLAB_CODE_PAGE_ALIASES_KEY),archive=doc.getMap('lessonLegacyCodePages');
  doc.transact(()=>{
    put(doc.getMap('lessonPages'),'version',1);put(doc.getMap('lessonPages'),'bookRoom',bookRoom);
    for(const [solution,oldPage] of doc.getMap(COLLAB_SOLUTION_PAGES_KEY)) {
      const linked=aliases.get(oldPage);
      if(linked)put(doc.getMap(COLLAB_SOLUTION_PAGES_KEY),solution,codeId(linked));
    }
    const live=boardPagesList(pages),ids=new Set(live.map(p=>codeId(p.id)));
    for(const [id] of catalog)if(!ids.has(id))put(deleted,id,true);
    put(deleted,DEFAULT_COLLAB_CODE_PAGE_ID,!live.some(p=>p.id===FIRST_BOARD_PAGE_ID));
    for(const page of live) {
      const id=codeId(page.id);
      const original=[...archive].find(([oldId])=>aliases.get(oldId)===page.id)?.[1];
      const mainSolutionId=id===DEFAULT_COLLAB_CODE_PAGE_ID?DEFAULT_COLLAB_SOLUTION_ID:
        (catalog.get(id)?.mainSolutionId||original?.mainSolutionId||`lesson-page-${id}`);
      put(catalog,id,{id,name:page.title,mainSolutionId,createdAt:page.createdAt});
      put(deleted,id,false);put(aliases,id,page.id);
      if(mainSolutionId!==DEFAULT_COLLAB_SOLUTION_ID&&!doc.getMap(COLLAB_SOLUTIONS_MAP_KEY).has(mainSolutionId)) {
        createEmptyCollabSolution(doc,{id:mainSolutionId,name:DEFAULT_SOLUTION_NAME,pageId:id,createdAt:page.createdAt});
      }
    }
  },LESSON_PAGE_ORIGIN);
}

export function mutateLessonPage(book,{action,id,name}={}) {
  const map=book.getMap('pages'),visible=boardPagesList(map);
  if(action==='create') {
    if(visible.length>=MAX_BOARD_PAGES)throw Error(`Можно создать не больше ${MAX_BOARD_PAGES} страниц.`);
    id=randomUUID();map.set(id,{title:title(name),createdAt:Date.now()});return id;
  }
  if(id!==FIRST_BOARD_PAGE_ID&&!validId(id))throw Error('Некорректная страница.');
  const old=map.get(id)||(id===FIRST_BOARD_PAGE_ID?{title:'Страница 1',createdAt:0}:null);
  if(!old)throw Error('Страница не найдена.');
  if(action==='rename') {if(!visible.some(p=>p.id===id))throw Error('Страница удалена.');map.set(id,{...old,title:title(name)});}
  else if(action==='delete') {if(visible.length<=1)throw Error('На занятии должна остаться хотя бы одна страница.');map.set(id,{...old,deleted:true});}
  else if(action==='restore') {if(!old.deleted)return id;if(visible.length>=MAX_BOARD_PAGES)throw Error('Достигнут предел страниц.');map.set(id,{...old,deleted:false});}
  else throw Error('Неизвестное действие со страницей.');
  return id;
}

// Dependencies provide authenticated room scope and persistence. Only active
// code docs stay observed; inactive migration snapshots are saved and released.
export function createLessonPageCatalog({loadBook,loadCode,saveCode,releaseCode,saveBook=async()=>{}}) {
  const contexts=new Map();
  const attachCode=(context,room,doc)=>{
    if(context.active.has(doc))return;
    context.active.set(doc,room);
    const changes=(event,transaction)=>{
      if(transaction.origin===LESSON_PAGE_ORIGIN)return;
      const role=transaction.origin?.learningCollabAuth?.role;
      // Preserve page edits from earlier clients of an individual lesson, and
      // teacher edits in group rooms. Pupils cannot edit the shared group list.
      if(['teacher','admin'].includes(role)||(role==='student'&&!context.bookRoom.startsWith('board-lesson-'))) {
        const aliases=doc.getMap(COLLAB_CODE_PAGE_ALIASES_KEY),map=context.book.getMap('pages');
        context.book.transact(()=>{
          for(const id of event.keysChanged) {
            const linked=aliases.get(id);if(!linked)continue;
            const old=map.get(linked)||(linked===FIRST_BOARD_PAGE_ID?{title:'Страница 1',createdAt:0}:null);if(!old)continue;
            if(event.target===doc.getMap(COLLAB_CODE_PAGES_KEY)) {
              const name=doc.getMap(COLLAB_CODE_PAGES_KEY).get(id)?.name;
              if(typeof name==='string'&&name.trim()&&name.trim().length<=80)put(map,linked,{...old,title:name.trim()});
            } else {
              const hide=doc.getMap(COLLAB_CODE_PAGES_DELETED_KEY).get(id)===true;
              if(!hide||boardPagesList(map).length>1)put(map,linked,{...old,deleted:hide});
            }
          }
        },LESSON_PAGE_ORIGIN);
      }
      context.refresh().catch(()=>{});
    };
    const catalog=doc.getMap(COLLAB_CODE_PAGES_KEY),deleted=doc.getMap(COLLAB_CODE_PAGES_DELETED_KEY);
    catalog.observe(changes);deleted.observe(changes);
    doc.once('destroy',()=>{catalog.unobserve(changes);deleted.unobserve(changes);context.active.delete(doc);});
  };
  async function ensure(scope) {
    let context=contexts.get(scope.book);
    if(!context) {
      const book=await loadBook(scope.book);
      context=contexts.get(scope.book);
      if(!context) {
        context={book,bookRoom:scope.book,rooms:scope.codes,active:new Map(),tail:Promise.resolve(),timer:null,initialized:false};
        context.refresh=()=>{const job=context.tail.catch(()=>{}).then(async()=>{
          const opened=[];
          try {
            for(const room of context.rooms)opened.push({room,...await loadCode(room)});
            book.transact(()=>{for(const entry of opened)importLegacyCodePages(book,entry.doc,entry.room);put(book.getMap('lessonPages'),'version',1);},LESSON_PAGE_ORIGIN);
            await saveBook(scope.book,book);
            for(const entry of opened){projectLessonPages(book,entry.doc,scope.book);await saveCode(entry.room,entry.doc);if(entry.active)attachCode(context,entry.room,entry.doc);}
            context.initialized=true;
          } finally {for(const entry of opened)if(!entry.active)releaseCode(entry.doc);}
        });context.tail=job;return job;};
        const changed=(_event,transaction)=>{if(transaction.origin===LESSON_PAGE_ORIGIN)return;clearTimeout(context.timer);context.timer=setTimeout(()=>context.refresh().catch(()=>{}),10);};
        book.getMap('pages').observe(changed);
        book.once('destroy',()=>{clearTimeout(context.timer);contexts.delete(scope.book);book.getMap('pages').unobserve(changed);});
        contexts.set(scope.book,context);
      }
    }
    const rosterChanged=JSON.stringify(context.rooms)!==JSON.stringify(scope.codes);
    context.rooms=scope.codes;
    if(!context.initialized||rosterChanged)await context.refresh();
    else if(scope.codeRoom) {
      const entry=await loadCode(scope.codeRoom);
      try {
        if(entry.active&&!context.active.has(entry.doc)) {
          context.book.transact(()=>importLegacyCodePages(context.book,entry.doc,scope.codeRoom),LESSON_PAGE_ORIGIN);
          await saveBook(scope.book,context.book);
          projectLessonPages(context.book,entry.doc,scope.book);await saveCode(scope.codeRoom,entry.doc);attachCode(context,scope.codeRoom,entry.doc);
        }
      }finally{if(!entry.active)releaseCode(entry.doc);}
    }
    return context.book;
  }
  return {ensure,async change(scope,input){const book=await ensure(scope);let id;book.transact(()=>{id=mutateLessonPage(book,input);},LESSON_PAGE_ORIGIN);await contexts.get(scope.book).refresh();return {book,id};}};
}
