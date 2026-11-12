import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_TRIAL_INVITATION,normalizeTrialMeetingUrl,normalizeTrialInvitationTemplate,trialInvitationMessage} from './trialInvitation.js';

test('trial invitations preserve teacher wording and replace the selected meeting link only',()=>{
  const first='https://telemost.yandex.ru/j/123',second='https://telemost.yandex.ru/j/456';
  const template='Привет!\nНачинаем через час.\nВот ссылка: {ссылка}';
  assert.equal(trialInvitationMessage(template,first),'Привет!\nНачинаем через час.\nВот ссылка: '+first);
  assert.equal(trialInvitationMessage(template,second),'Привет!\nНачинаем через час.\nВот ссылка: '+second);
  assert.equal(trialInvitationMessage(undefined,first),DEFAULT_TRIAL_INVITATION.replace('{ссылка}',first));
  assert.equal(trialInvitationMessage(template,''),'');
  for(const invalid of ['',null,'Привет без ссылки','a'.repeat(4001)+'{ссылка}'])assert.throws(()=>normalizeTrialInvitationTemplate(invalid));
});

test('meeting links accept clearing and HTTPS while rejecting executable or credential-bearing links',()=>{
  assert.equal(normalizeTrialMeetingUrl('  https://telemost.yandex.ru/j/123  '),'https://telemost.yandex.ru/j/123');
  assert.equal(normalizeTrialMeetingUrl(''),'');
  for(const invalid of ['javascript:alert(1)','data:text/html,test','http://example.com','https://name:password@example.com','https://telemost.yandex.ru/j/a\nb','https://localhost/a','telemost.yandex.ru/j/123',null])assert.throws(()=>normalizeTrialMeetingUrl(invalid));
});
