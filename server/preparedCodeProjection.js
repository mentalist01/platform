import {COLLAB_SOLUTIONS_MAP_KEY,COLLAB_SOLUTION_PAGES_KEY,DEFAULT_COLLAB_CODE_PAGE_ID,getCollabSolutionChannels} from '../src/utils/collabSolutions.js';
import {preparedTaskTitle} from '../src/utils/preparedTaskTitle.js';
import {preparedRunSources,preparedTaskSource} from '../src/utils/preparedRunSources.js';

// Project once into the existing editor. Never replace or rename old tabs, and
// never replay the old recorder snapshot over subsequent collaborative edits.
export function projectPreparedCode(doc,run) {
  const pageId=run.room.split('~page~')[1]||DEFAULT_COLLAB_CODE_PAGE_ID;
  const catalog=doc.getMap(COLLAB_SOLUTIONS_MAP_KEY),links=doc.getMap('preparedCodeLinks');
  const sources=new Map(preparedRunSources(run).map(source=>[source.id,source]));
  doc.transact(()=>{for(const card of run.cards){
    if(run.tasks[card.index]?.kind==='theory')continue;
    if(!/^prepared-[a-f0-9-]{36}$/.test(card.codeId))throw Error('Invalid prepared code identity');
    if(!links.has(card.codeId)&&!catalog.has(card.codeId)) {
      const channels=getCollabSolutionChannels(doc,card.codeId);
      if(!channels.codeText.length&&card.code?.text)channels.codeText.insert(0,card.code.text);
      if(!channels.runMap.size){for(const [key,value] of Object.entries({status:'idle',output:card.code?.output||'',input:card.code?.input||'',stdinDraft:card.code?.input||'',customFiles:[],debugBreakpoints:[]}))channels.runMap.set(key,value);}
      doc.getMap(COLLAB_SOLUTION_PAGES_KEY).set(card.codeId,pageId);
      catalog.set(card.codeId,{id:card.codeId,name:preparedTaskTitle(run.tasks[card.index],card.index).slice(0,80),createdAt:(Date.parse(run.createdAt)||0)+card.index});
    }
    // Repair source labels/order on existing tabs too, without replaying code,
    // changing user names or restoring deleted tabs. Recovery runs repeatedly.
    const metadata=catalog.get(card.codeId),source=preparedTaskSource(run,run.tasks[card.index],card.index);
    if(metadata&&source.id){
      const preparedGroup={runId:run.id,setId:source.id,name:source.name||'Набор',firstIndex:sources.get(source.id).firstIndex,index:card.index};
      if(JSON.stringify(metadata.preparedGroup)!==JSON.stringify(preparedGroup))catalog.set(card.codeId,{...metadata,preparedGroup});
    }
    if(!links.has(card.codeId))links.set(card.codeId,{runId:run.id,cardId:card.id});
  }},'prepared-code:import');
}
