import {apiFetch,getStoredAuthToken,parseApiError} from './api.js';
import {resolveApiUrl} from '../utils/runtimeUrls.js';
export async function preparedRequest(path,input,method='POST',signal){
  const response=await apiFetch(path,{method:input===undefined?'GET':method,...(input===undefined?{}:input instanceof FormData?{body:input}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}),signal,cache:'no-store'});
  if(!response.ok){const error=new Error(await parseApiError(response));error.status=response.status;throw error;}return response.json();
}
export function preparedAssetUrl(value){const url=new URL(resolveApiUrl(value),window.location.href);url.searchParams.set('_auth',getStoredAuthToken());return url.toString();}
export const preparedSelectionKey=room=>`prepared-task:${room}`;
