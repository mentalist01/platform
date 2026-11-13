import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {ROOT,loadConfig,saveConfig,AssistantRunner} from './runner.mjs';
import {styleExamples,chatAllowed} from './inbox.mjs';
import {loadToken} from './token-store.mjs';
import {TemplateLibrary} from './templates.mjs';

export async function main(args=process.argv.slice(2)) {
  const [command='help',...rest]=args;
  if (command === 'send-approved') {
    if (rest.length) throw Error('No message or recipient arguments are accepted');
    const panel = new URL(fs.readFileSync(path.join(ROOT, 'private', 'panel-url.txt'), 'utf8').trim());
    if (panel.protocol !== 'http:' || panel.hostname !== '127.0.0.1') throw Error('Invalid local panel URL');
    const response = await fetch(panel.origin + '/api/send-approved-reply', {
      method: 'POST',
      headers: {'x-assistant-key': panel.hash.slice(1), 'Content-Type': 'application/json'},
      body: '{}',
      redirect: 'error',
      signal: AbortSignal.timeout(32000),
    });
    console.log(JSON.stringify(await response.json()));
    return;
  }
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
  if(command==='import-templates') {
    const config=loadConfig();if(!config.templateSource)throw Error('Configure the exact template group first');
    const library=new TemplateLibrary(path.join(ROOT,'private/template-library.json'),config);
    const data=library.import(JSON.parse(fs.readFileSync(path.resolve(rest[0]),'utf8')));
    return console.log(`Imported ${Object.keys(data.entries).length} template messages in ${Object.keys(data.topics).length} topics locally.`);
  }
  if(command==='run') {
    const runner=new AssistantRunner(loadConfig(),{onStatus:console.log});await runner.start(process.env.IVAN100_ASSISTANT_BOT_TOKEN||await loadToken(path.join(ROOT,'private')));
    process.once('SIGINT',()=>runner.stop());process.once('SIGTERM',()=>runner.stop());return;
  }
  if(command==='serve') {
    const {serve}=await import('./ui-server.mjs');return serve();
  }
  console.log('Commands: init [thread-id] | serve | run | send-approved | import-style <selected-chat-result.json> | import-templates <template-group-result.json>');
}
if(import.meta.url===pathToFileURL(process.argv[1]||'').href)main().catch(()=>{console.error('Could not start. Check the local settings and connection instructions in README.md.');process.exitCode=1;});
