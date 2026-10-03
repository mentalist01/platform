'use strict';
const http = require('node:http');

// Use the same local session as the helper UI. Never expose the key to a website.
function createRecorderStateReader({ port = 18765 } = {}) {
  let key;
  const get = route => new Promise((resolve, reject) => {
    const request = http.get({ hostname: '127.0.0.1', port, path: route, headers: route === '/state' && key ? { 'x-recorder-key': key } : {} }, response => {
      let body = '';
      response.on('data', chunk => { body += chunk; if (body.length > 2 * 1024 * 1024) request.destroy(new Error('Некорректный ответ пульта')); });
      response.on('error', reject);
      response.on('end', () => resolve({ status: response.statusCode, body }));
    });
    request.setTimeout(1500, () => request.destroy(new Error('Пульт не отвечает')));
    request.on('error', reject);
  });
  return async () => {
    try {
      let response = await get('/state');
      if (response.status === 403) {
        const page = await get('/');
        key = page.status === 200 && page.body.match(/const\s+key\s*=\s*['"]([A-Za-z0-9_-]{32,128})['"]/)?.[1];
        if (!key) throw new Error('Не удалось подключиться к пульту');
        response = await get('/state');
      }
      if (response.status !== 200) throw new Error('Не удалось проверить состояние пульта');
      const state = JSON.parse(response.body);
      if (!state || !Array.isArray(state.jobs)) throw new Error('Неизвестное состояние пульта');
      return state;
    } catch (error) {
      if (error.code === 'ECONNREFUSED') { key = undefined; return null; }
      throw error;
    }
  };
}
module.exports = { createRecorderStateReader, readRecorderState: createRecorderStateReader() };
