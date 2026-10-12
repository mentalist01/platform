import {getStoredAuthToken,parseApiError} from './api.js';
import {resolveApiUrl} from '../utils/runtimeUrls.js';
export async function requestLessonPages(room,input,signal) {
  const response=await fetch(resolveApiUrl(input?'/api/lesson-pages':`/api/lesson-pages?room=${encodeURIComponent(room)}`),{
    method:input?'POST':'GET',headers:{Authorization:`Bearer ${getStoredAuthToken()}`,...(input?{'Content-Type':'application/json'}:{})},
    ...(input?{body:JSON.stringify({...input,room})}:{}),signal,
  });
  if(!response.ok)throw Error(await parseApiError(response));
  return response.json();
}
