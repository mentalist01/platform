const text=(v,max)=>typeof v==='string'?v.trim().slice(0,max):'';
const list=(v,max=12)=>Array.isArray(v)?v.slice(0,max).map(x=>text(x,600)).filter(Boolean):[];
export function normalizeTechnicalIssue(value) {
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const summary=text(value.summary,240),actual=text(value.actual,1800);
  if(!summary||!actual)return null;
  return {summary,actual,expected:text(value.expected,1200),steps:list(value.steps),
    observedAt:text(value.observedAt,100),uncertainties:list(value.uncertainties),
    evidenceMessageIds:Array.isArray(value.evidenceMessageIds)?[...new Set(value.evidenceMessageIds.filter(x=>Number.isSafeInteger(x)&&x>0))].slice(0,20):[],
    severity:['lesson_blocked','degraded','minor'].includes(value.severity)?value.severity:'degraded'};
}
