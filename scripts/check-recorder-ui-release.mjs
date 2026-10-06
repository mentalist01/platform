import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {recorderPackage,recorderRelease} from '../server/recorderPackage.js';

const [mode='local',directory='dist']=process.argv.slice(2);
const html=fs.readFileSync(path.join(directory,'index.html'),'utf8');
const entry=html.match(/src="(\/assets\/[^" ]+\.js)"/)?.[1];
if(!entry)throw Error('Client entry not found');
const source=fs.readFileSync(path.join(directory,entry.slice(1)),'utf8');
const feature=source.match(/LessonRecordingSection-[A-Za-z0-9_-]+\.js/)?.[0];
if(!feature)throw Error('Recorder instructions bundle not found');
const featurePath=`/assets/${feature}`,featureSource=fs.readFileSync(path.join(directory,featurePath.slice(1)),'utf8');
for(const text of ['Скачать пульт для Windows','Установка и инструкция','Найти объяснение и задать запись в домашку','Архив и теория'])if(!featureSource.includes(text))throw Error(`Missing recorder help: ${text}`);
const installer=`/assets/IVAN100-Recorder-Windows-${recorderRelease().manifest.version}.zip`;
const recorderSources=JSON.parse(recorderRelease().bundle).files;
for(const marker of ['python-studio','python-recorder" open','Предпросмотр Python','Окно редактора для Python','Микрофон для Python','/python/configure','/material/stop'])if(!recorderSources['panel.html'].includes(marker))throw Error(`Missing independent Python recorder: ${marker}`);
for(const marker of ['PYTHON_SCENES','PYTHON_INPUTS','ensurePythonSources','selectPython'])if(!recorderSources['obs.mjs'].includes(marker))throw Error(`Missing Python capture isolation: ${marker}`);
if(!recorderSources['python-capture.mjs'])throw Error('Python capture module missing from Windows update');
if(!fs.readFileSync(path.join(directory,installer.slice(1))).equals(recorderPackage()))throw Error('Installer differs from the current recorder source');
console.log('Recorder onboarding and current Windows installer verified.');
if(mode==='verify'){
  const get=async pathname=>{
    const response=await fetch(`https://ivan100.ru${pathname}`,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw Error(`${pathname}: HTTP ${response.status}`);
    if(pathname===installer&&!response.headers.get('Content-Type')?.includes('zip'))throw Error('Installer has incorrect content type');
    return Buffer.from(await response.arrayBuffer());
  };
  if(!(await get('/')).toString('utf8').includes(entry))throw Error('Production serves a different client');
  const digest=data=>crypto.createHash('sha256').update(data).digest('hex');
  for(const asset of [featurePath,installer])if(digest(await get(asset))!==digest(fs.readFileSync(path.join(directory,asset.slice(1)))))throw Error(`Published recorder asset mismatch: ${asset}`);
  console.log('Published recorder instructions and Windows download verified.');
}
