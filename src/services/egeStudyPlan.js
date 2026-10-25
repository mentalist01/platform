import {apiFetch} from './api.js';
export async function studyPlanRequest(input) {
  const response=await apiFetch('/api/ege-study-plan',{method:input?'PUT':'GET',cache:'no-store',
    ...(input?{headers:{'Content-Type':'application/json'},body:JSON.stringify(input),keepalive:true}:{})});
  const payload=await response.json();
  if(!response.ok) throw Object.assign(new Error(payload.error || 'Не удалось загрузить план'),{status:response.status,current:payload.current});
  return payload;
}
