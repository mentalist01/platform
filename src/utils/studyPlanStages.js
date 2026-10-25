// Stages reference canonical topics/part numbers. Pupil progress never uses stage IDs.
export function studyPlanStages(plan) {
  return plan.stages||plan.order.map(blockId=>({id:blockId,blockId,fromPart:1,toPart:Math.max(1,plan.blocks[blockId].parts.length),x:plan.blocks[blockId].x,y:plan.blocks[blockId].y}));
}
export function studyStageLabel(stage) {
  return stage.fromPart===stage.toPart?`часть ${stage.fromPart}`:`части ${stage.fromPart}–${stage.toPart}`;
}
export function studyPlanDisplay(plan) {
  const stages=studyPlanStages(plan);
  return {...plan,order:stages.map(stage=>stage.id),blocks:Object.fromEntries(stages.map(stage=>[stage.id,{...plan.blocks[stage.blockId],...stage}]))};
}
export const studyStageFor=(plan,id)=>studyPlanStages(plan).find(stage=>stage.id===id);
export function withStudyStages(plan,stages) {
  return {...plan,stages,order:[...new Set(stages.map(stage=>stage.blockId))]};
}
export function splitStudyStage(plan,id,after) {
  const stages=studyPlanStages(plan),stage=stages.find(stage=>stage.id===id);
  if(!stage||!Number.isInteger(after)||after<stage.fromPart||after>=stage.toPart)return plan;
  const next={...stage,id:`${stage.blockId}~${after+1}`,fromPart:after+1,y:Math.min(15000,stage.y+190)};
  const index=stages.indexOf(stage);
  return withStudyStages(plan,[...stages.slice(0,index),{...stage,toPart:after},next,...stages.slice(index+1)]);
}
export function mergeStudyStages(plan,blockId) {
  const stages=studyPlanStages(plan),first=stages.find(stage=>stage.blockId===blockId);
  if(!first)return plan;
  return withStudyStages(plan,stages.flatMap(stage=>stage.blockId!==blockId?[stage]:stage===first?[{...stage,id:blockId,fromPart:1,toPart:Math.max(1,plan.blocks[blockId].parts.length)}]:[]));
}
export function validStudyStages(plan) {
  if(plan.stages===undefined)return true;
  if(!Array.isArray(plan.stages)||plan.stages.some(stage=>!stage||typeof stage!=='object')||plan.stages.length>400||new Set(plan.stages.map(stage=>stage.id)).size!==plan.stages.length)return false;
  if(JSON.stringify([...new Set(plan.stages.map(stage=>stage?.blockId))])!==JSON.stringify(plan.order))return false;
  for(const blockId of plan.order) {
    const stages=plan.stages.filter(stage=>stage?.blockId===blockId),count=Math.max(1,plan.blocks?.[blockId]?.parts?.length||0);
    let next=1;
    for(const stage of stages) {
      if(!Number.isInteger(stage.fromPart)||!Number.isInteger(stage.toPart)||stage.fromPart!==next||stage.toPart<next||stage.toPart>count)return false;
      if(stage.id!==(next===1?blockId:`${blockId}~${next}`)||!Number.isFinite(stage.x)||!Number.isFinite(stage.y)||stage.x<0||stage.y<0||stage.x>15000||stage.y>15000)return false;
      next=stage.toPart+1;
    }
    if(next!==count+1)return false;
  }
  return true;
}
