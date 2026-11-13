import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const allowedMethods = new Set(['getMe', 'getWebhookInfo', 'getUpdates', 'getFile', 'getBusinessConnection']);
export class TelegramReader {
  constructor(token, request = fetch) {
    if (!/^\d+:[\w-]{20,}$/.test(token || '')) throw Error('Configure a separate assistant bot token in the local environment');
    this.token = token; this.request = request;
  }
  async call(method, body = {}, signal) {
    if (!allowedMethods.has(method)) throw Error('This assistant only reads Telegram');
    return this.#request(method, body, signal);
  }
  async #request(method, body, signal) {
    let response;
    try {response = await this.request(`https://api.telegram.org/bot${this.token}/${method}`, {method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:signal || AbortSignal.timeout(65000)});}
    catch {throw Error('Telegram connection failed; retry without exposing bot credentials');}
    const data = await response.json();
    if (!response.ok || data.ok !== true) {
      const error = Error(`Telegram ${method} failed (${response.status}); check connection and bot settings`);
      error.telegramRejected = data.ok === false && Number.isInteger(data.error_code);
      throw error;
    }
    return data.result;
  }
  getBusinessConnection(connectionId) {
    return this.call('getBusinessConnection', {business_connection_id: connectionId}, AbortSignal.timeout(10000));
  }
  async sendApprovedReply({connectionId, chatId, text}) {
    if (!connectionId || !Number.isSafeInteger(chatId) || chatId <= 0 || typeof text !== 'string' || !text.trim() || text.length > 4096) {
      throw Error('Invalid approved Telegram reply');
    }
    const result = await this.#request('sendMessage', {
      business_connection_id: connectionId,
      chat_id: chatId,
      text,
      link_preview_options: {is_disabled: true},
    }, AbortSignal.timeout(15000));
    if (!Number.isSafeInteger(result?.message_id) || result.message_id <= 0 ||
        result.chat?.id !== chatId || result.chat.type !== 'private' ||
        (result.business_connection_id && result.business_connection_id !== connectionId)) {
      throw Error('Telegram delivery could not be confirmed');
    }
    return result;
  }
  async check() {
    const me = await this.call('getMe'), hook = await this.call('getWebhookInfo');
    if (!me.is_bot) throw Error('The account is not a bot');
    if (hook.url) throw Error('This bot already has a webhook. Create a separate bot; the existing integration was not changed');
    if (me.can_connect_to_business !== true) throw Error('Enable Secretary / Business mode in BotFather first');
    return {username:me.username};
  }
  updates(offset, signal, templatesEnabled=false) {
    return this.call('getUpdates',{offset,timeout:45,allowed_updates:['business_connection','business_message','edited_business_message','deleted_business_messages',...(templatesEnabled?['message','edited_message']:[])]},signal);
  }
  async download(file, folder, maxBytes) {
    if (file.bytes > maxBytes) throw Error('File is larger than the configured limit');
    const meta = await this.call('getFile',{file_id:file.id});
    if (!meta.file_path || !/^[\w./-]+$/.test(meta.file_path) || meta.file_path.split('/').includes('..') || meta.file_size > maxBytes) throw Error('Telegram returned an invalid or oversized file');
    const response = await this.request(`https://api.telegram.org/file/bot${this.token}/${meta.file_path}`,{redirect:'error',signal:AbortSignal.timeout(60000)});
    if (!response.ok || Number(response.headers.get('content-length') || 0) > maxBytes) throw Error('Cannot download the attachment');
    const chunks=[]; let size=0;
    for await (const chunk of response.body) {size+=chunk.length;if(size>maxBytes){await response.body.cancel?.().catch(()=>{});throw Error('Attachment exceeds the limit');}chunks.push(chunk);}
    const bytes=Buffer.concat(chunks), ext=path.extname(file.name).replace(/[^.a-zA-Z0-9]/g,'').slice(0,12);
    const filename=path.join(folder,createHash('sha256').update(file.id).digest('hex')+ext);
    fs.mkdirSync(folder,{recursive:true}); fs.writeFileSync(filename,bytes,{mode:0o600});
    return {name:file.name,path:filename,kind:file.kind,bytes:size};
  }
}
