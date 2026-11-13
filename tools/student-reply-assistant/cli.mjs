import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {ROOT,loadConfig,saveConfig,AssistantRunner} from './runner.mjs';
import {styleExamples,chatAllowed} from './inbox.mjs';
import {loadToken} from './token-store.mjs';

export async function main(args=process.argv.slice(2)) {
  const [command='help',...rest]=args;
  if(command==='init') {
    const filename=path.join(ROOT,'config.local.json');
    if(fs.existsSync(filename))return console.log('Existing local configuration preserved.');
    const config=JSON.parse(fs.readFileSync(path.join(ROOT,'config.example.json'),'utf8'));
    config.codexThreadId=rest[0]||'';saveConfig(config);return console.log('Created local settings. No Telegram connection has been made.');
  }
  if(command==='import-style') {
    const config=loadConfig();if(!config.telegramOwnerId)throw Error('Select your Telegram account first');
    const exported=JSON.parse(fs.readFileSync(path.resolve(rest[0]),'utf8'));
    if(!chatAllowed(config,Number(exported.id)))throw Error('Import an export belonging to a selected pupil chat');
    const examples=styleExamples(exported,config.telegramOwnerId);
    const filename=path.join(ROOT,'private/style-examples.json');fs.mkdirSync(path.dirname(filename),{recursive:true});
    const old=fs.existsSync(filename)?JSON.parse(fs.readFileSync(filename,'utf8')).examples:[];
    const unique=[...new Map([...old,...examples].map(example=>[JSON.stringify([example.question,example.answer]),example])).values()].slice(-200);
    fs.writeFileSync(filename,JSON.stringify({version:1,examples:unique},null,2),{mode:0o600});
    return console.log(`Imported ${examples.length} text reply examples locally. No model request was made.`);
  }
  if(command==='run') {
    const runner=new AssistantRunner(loadConfig(),{onStatus:console.log});await runner.start(process.env.IVAN100_ASSISTANT_BOT_TOKEN||await loadToken(path.join(ROOT,'private')));
    process.once('SIGINT',()=>runner.stop());process.once('SIGTERM',()=>runner.stop());return;
  }
  if(command==='serve') {
    const {serve}=await import('./ui-server.mjs');return serve();
  }
  console.log('Commands: init [thread-id] | serve | run | import-style <selected-chat-result.json>');
}
if(import.meta.url===pathToFileURL(process.argv[1]||'').href)main().catch(()=>{console.error('Could not start. Check the local settings and connection instructions in README.md.');process.exitCode=1;});
