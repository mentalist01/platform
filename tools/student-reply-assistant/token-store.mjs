import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';

// Windows DPAPI binds the saved token to the current Windows account.
// The plaintext is piped via stdin, never put into process arguments or logs.
export function protect(value, decrypt=false) {
  if(process.platform!=='win32')return Promise.reject(Error('Windows token storage is unavailable'));
  const operation=decrypt?"[Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($v),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))":"[Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($v),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))";
  const script="$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Security; [Console]::InputEncoding=[Text.UTF8Encoding]::new($false); [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); $v=[Console]::In.ReadToEnd(); [Console]::Out.Write("+operation+")";
  return new Promise((resolve,reject)=>{
    const proc=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    let output='';proc.stdout.setEncoding('utf8');proc.stdout.on('data',part=>{output+=part;});proc.stderr.resume();
    const timer=setTimeout(()=>{proc.kill();reject(Error('Secure token storage timed out'));},15000);
    proc.once('error',()=>{clearTimeout(timer);reject(Error('Secure token storage failed'));});
    proc.once('exit',code=>{clearTimeout(timer);code===0&&output?resolve(output):reject(Error('Secure token storage failed'));});
    proc.stdin.end(value);
  });
}
export async function saveToken(directory,token) {
  if(typeof token!=='string'||!/^\d+:[A-Za-z0-9_-]{20,}$/.test(token))throw Error('Invalid bot token');
  const sealed=await protect(token);fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(path.join(directory,'bot-token.dpapi'),sealed,{mode:0o600});
}
export async function loadToken(directory) {
  const file=path.join(directory,'bot-token.dpapi');
  return fs.existsSync(file)?protect(fs.readFileSync(file,'utf8'),true):null;
}
