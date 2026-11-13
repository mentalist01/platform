import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {serve} from './ui-server.mjs';
import {ROOT} from './runner.mjs';
import {loadToken} from './token-store.mjs';

// The fixed loopback port is also the instance lock. Windows releases it on
// termination; another startup never starts a second Telegram poller.
export async function startDesktop({port=5638,tokenLoader=loadToken,stateDirectory=path.join(ROOT,'private'),runner}={}) {
  let panel;
  try {panel=await serve({port,onReady:()=>{},stateDirectory,...(runner?{runner}:{})});}
  catch(error){if(error.code==='EADDRINUSE')return null;throw error;}
  let retry;
  const connect=async()=>{
    try {
      const token=await tokenLoader(stateDirectory);
      if(!token){panel.runner.status='Нужно подключить Telegram в локальной панели';return;}
      await panel.runner.start(token);
    } catch {
      panel.runner.status='Ожидаем соединение с Telegram; повтор через 10 секунд';
      retry=setTimeout(connect,10000);retry.unref();
    }
  };
  const originalClose=panel.close;
  panel.close=async()=>{clearTimeout(retry);await originalClose();};
  await connect();
  fs.writeFileSync(path.join(stateDirectory,'desktop-status.json'),JSON.stringify({startedAt:new Date().toISOString(),port,mode:'drafts-only'}),{mode:0o600});
  return panel;
}
if(import.meta.url===pathToFileURL(process.argv[1]||'').href)startDesktop().catch(()=>{console.error('Не удалось запустить локального помощника.');process.exitCode=1;});
