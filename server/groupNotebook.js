import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
// Match the Yjs instance used by y-websocket and server persistence. Mixing
// ESM/CJS structures can accept an update clock without retaining its items.
const Y=createRequire(import.meta.url)('yjs');
import {boardPagesList,boardPageRoom} from '../src/utils/boardPages.js';
import {groupNotebookBoard,groupNotebookCode} from '../src/utils/groupNotebook.js';
import {listCollabCodePages,listCollabPageSolutions,getCollabSolutionChannels,
  COLLAB_CODE_PAGES_KEY,COLLAB_SOLUTIONS_MAP_KEY,COLLAB_SOLUTION_PAGES_KEY,COLLAB_CODE_PAGE_ALIASES_KEY} from '../src/utils/collabSolutions.js';

const key=(...parts)=>'restored-'+createHash('sha256').update(parts.join('\0')).digest('hex').slice(0,28);
const json=value=>JSON.parse(JSON.stringify(value));
const hasSolutionData=channels=>channels.codeText.length||channels.testFileText.length||['input','stdinDraft','output','error'].some(k=>String(channels.runMap.get(k)||'').trim())||(channels.runMap.get('customFiles')||[]).length;
const dateLabel=lesson=>new Date(lesson.startAt).toLocaleDateString('ru-RU',{timeZone:'Europe/Moscow',day:'2-digit',month:'2-digit'});

// Additive import into a separate permanent namespace. Old lesson documents
// are read as detached snapshots and never edited. Deterministic IDs make a
// failed import retryable without duplicating pages, drawings or solutions.
export function createGroupNotebook({lessons,readSource,loadTarget,saveTarget,backupSource=async()=>{},grantAssets=async()=>{}}) {
  const pending=new Map();
  const importGroup=async group=>{
    const base=groupNotebookBoard(group.id),book=await loadTarget(base+'~pages','board'),imports=book.getMap('groupNotebookImports');
    const history=(await lessons(group.id)).filter(l=>l.status!=='cancelled').sort((a,b)=>Date.parse(a.startAt)-Date.parse(b.startAt)||a.id.localeCompare(b.id));
    for(const lesson of history) {
      if(imports.has(lesson.id))continue;
      const sourceBase='board-lesson-'+lesson.id,opened=[],read=async(room,kind)=>{const doc=await readSource(room,kind);opened.push(doc);await backupSource(group.id,room,doc);return doc;};
      try {
        const sourceBook=await read(sourceBase+'~pages','board'),boardPages=boardPagesList(sourceBook.getMap('pages'));
        const owners=['',...[...new Set(lesson.participantIdsSnapshot||lesson.participantIds||[])]];
        const sources=await Promise.all(owners.map(async owner=>({owner,room:`collab-lesson-${lesson.id}${owner?'~student~'+owner:''}`,doc:await read(`collab-lesson-${lesson.id}${owner?'~student~'+owner:''}`,'code')})));
        const definitions=new Map(boardPages.map(p=>[p.id,{...p,explicit:sourceBook.getMap('pages').has(p.id)}])),codeMappings=new Map();
        for(const source of sources)for(const page of listCollabCodePages(source.doc)) {
          const alias=source.doc.getMap(COLLAB_CODE_PAGE_ALIASES_KEY).get(page.id);
          let oldId=alias==='main'||page.id==='page-main'?'main':alias||page.id;
          if(!definitions.has(oldId)) {
            const same=boardPages.filter(p=>p.title===page.name);
            if(same.length===1)oldId=same[0].id;
            else definitions.set(oldId,{id:oldId,title:page.name,createdAt:page.createdAt,explicit:true});
          }
          codeMappings.set(source.room+'\0'+page.id,oldId);
        }
        let count=0;
        for(const page of definitions.values()) {
          const canvases=await Promise.all(owners.map(async owner=>({owner,doc:await read(boardPageRoom(sourceBase,page.id,owner),'board')})));
          const sourceCodes=sources.flatMap(source=>listCollabCodePages(source.doc).filter(p=>codeMappings.get(source.room+'\0'+p.id)===page.id).map(p=>({...source,page:p})));
          const hasCode=sourceCodes.some(s=>listCollabPageSolutions(s.doc,s.page.id).some(sol=>{const c=getCollabSolutionChannels(s.doc,sol.id);return hasSolutionData(c);}));
          if(!page.explicit&&!hasCode&&!canvases.some(c=>c.doc.getArray('items').length))continue;
          if(!book.getMap('pages').has(key(lesson.id,page.id))&&boardPagesList(book.getMap('pages')).length>=300)throw Error('Слишком много страниц для восстановления. Исходные материалы сохранены.');
          const pageId=key(lesson.id,page.id),title=(page.title+' · '+dateLabel(lesson)).slice(0,80),createdAt=Date.parse(lesson.startAt)+count;
          for(const canvas of canvases) {
            if(!canvas.doc.getArray('items').length)continue;
            const room=boardPageRoom(base,pageId,canvas.owner),target=await loadTarget(room,'board');
            Y.applyUpdate(target,Y.encodeStateAsUpdate(canvas.doc));await saveTarget(room,target,'board');
            await grantAssets(group.id,canvas.doc.getArray('items').toArray().map(item=>item.assetId).filter(Boolean));
          }
          for(const source of sourceCodes) {
            const room=groupNotebookCode(group.id,source.owner),target=await loadTarget(room,'code');
            const existing=target.getMap(COLLAB_CODE_PAGES_KEY).get(pageId);
            const primary=key(source.room,source.page.mainSolutionId);
            target.getMap(COLLAB_CODE_PAGES_KEY).set(pageId,existing||{id:pageId,name:title,createdAt,mainSolutionId:primary});
            for(const solution of listCollabPageSolutions(source.doc,source.page.id)) {
              const solutionId=key(source.room,solution.id);
              if(target.getMap(COLLAB_SOLUTIONS_MAP_KEY).has(solutionId))continue;
              const from=getCollabSolutionChannels(source.doc,solution.id),to=getCollabSolutionChannels(target,solutionId);
              const run=json(from.runMap.toJSON());
              if(run.status==='running')run.status='idle';
              for(const name of Object.keys(run))if(name.startsWith('saveNotice'))delete run[name];
              Object.assign(run,{running:false,debugActive:false,debugPlaying:false});
              target.transact(()=>{
                if(from.codeText.length)to.codeText.insert(0,from.codeText.toString());
                if(from.testFileText.length)to.testFileText.insert(0,from.testFileText.toString());
                for(const [k,v] of Object.entries(run))to.runMap.set(k,v);
                target.getMap(COLLAB_SOLUTIONS_MAP_KEY).set(solutionId,{...solution,id:solutionId});
                target.getMap(COLLAB_SOLUTION_PAGES_KEY).set(solutionId,pageId);
              },'group-notebook:restore');
            }
            const order=target.getArray('codeSolutionsOrder'),present=new Set(order.toArray()),ordered=listCollabPageSolutions(source.doc,source.page.id).map(s=>key(source.room,s.id)).filter(id=>!present.has(id));
            if(ordered.length)order.push(ordered);
            await saveTarget(room,target,'code');
          }
          if(!book.getMap('pages').has(pageId))book.getMap('pages').set(pageId,{title,createdAt,sourceLessonId:lesson.id,sourcePageId:page.id});
          book.getMap('groupNotebookMeta').set('restoredPageId',pageId);
          count++;
        }
        // Empty future lessons remain eligible for a later retry: old clients
        // may still prepare them before they load the new application version.
        if(count||['completed','cancelled'].includes(lesson.status))imports.set(lesson.id,{pages:count,at:new Date().toISOString()});
        if(count&&!book.getMap('groupNotebookMeta').get('initialized')&&!book.getMap('pages').has('main'))book.getMap('pages').set('main',{title:'Страница 1',createdAt:0,deleted:true});
        await saveTarget(base+'~pages',book,'board');
      }finally{for(const doc of opened)doc.destroy();}
    }
    if(!book.getMap('groupNotebookMeta').get('initialized'))book.getMap('groupNotebookMeta').set('initialized',true);
    await saveTarget(base+'~pages',book,'board');
    return book;
  };
  return {ensure(group){if(pending.has(group.id))return pending.get(group.id);const promise=importGroup(group).finally(()=>pending.delete(group.id));pending.set(group.id,promise);return promise;}};
}
