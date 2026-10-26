const actorKey=auth=>`${auth.role}:${auth.id}`;
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};

export const preparedWriterView=(binding,auth,now)=>binding?{
  name:binding.name,isSelf:binding.actor===actorKey(auth),active:binding.until>now,
}:null;

export const preparedWriterAllows=(binding,auth,generation)=>Boolean(binding&&Number.isInteger(generation)&&generation>0&&binding.actor===actorKey(auth)&&
  (binding.generation===generation||binding.resumedGeneration===generation));

export function releasePreparedFile(card,assetId,auth,{allowWithoutSave=false}={}){
  const binding=card.bindings?.[assetId];
  if(!binding)return false;
  if(binding.actor!==actorKey(auth)&&!['teacher','admin'].includes(auth.role))fail(403,'Этот файл редактирует другой участник');
  if(!card.solutions[assetId]&&!allowWithoutSave)fail(409,'Решение ещё не сохранено. Нажмите Ctrl+S в таблице и дождитесь появления решения на доске.');
  binding.until=0;binding.generation++;delete binding.resumedGeneration;
  return true;
}

// Restore an existing installed helper token only after an explicit browser
// action. A revoked token cannot silently retake the file from another writer.
// Revision checks in saveSolution still protect newer work after a handover.
export function resumePreparedFile(store,run,card,assetId,auth){
  const binding=card.bindings?.[assetId],now=store.now();
  if(!binding)fail(409,'Сначала откройте этот файл через помощник таблиц.');
  if(binding.until>now&&binding.actor!==actorKey(auth))fail(409,`${binding.name} редактирует файл. Сначала дождитесь сохранения и передачи работы.`);
  const sessions=Object.values(store.data.sessions).filter(session=>session.expires>now&&session.runId===run.id&&session.cardId===card.id&&session.assetId===assetId&&actorKey(session.auth)===actorKey(auth));
  const session=sessions.sort((a,b)=>b.generation-a.generation)[0];
  if(!session)fail(409,'Не найдена действующая привязка открытой таблицы. Откройте файл через помощник заново или загрузите сохранённое решение.');
  card.bindings[assetId]={...binding,actor:actorKey(auth),name:auth.name||'Участник',until:now+60*60*1000,
    generation:binding.generation+1,resumedGeneration:session.generation};
}
