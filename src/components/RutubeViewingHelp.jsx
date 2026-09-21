import React from 'react';

const links = [
  ['Chrome на компьютере — uBlock Origin Lite', 'https://chromewebstore.google.com/detail/ublock-origin-lite/ddkjiahejlhfcafbddmgiahcphecmpfh'],
  ['Edge на компьютере — uBlock Origin Lite', 'https://microsoftedge.microsoft.com/addons/detail/ublock-origin-lite/cimighlppcgcoapaliogpjjdehbnofhn'],
  ['Firefox, в том числе Android — uBlock Origin', 'https://addons.mozilla.org/firefox/addon/ublock-origin/'],
  ['Safari на iPhone, iPad и Mac — uBlock Origin Lite', 'https://apps.apple.com/app/ublock-origin-lite/id6745342698'],
];

export default function RutubeViewingHelp() {
  return <details className="m-3 rounded-xl border border-violet-200 bg-violet-50 p-3 text-xs leading-5 text-slate-700">
    <summary className="cursor-pointer font-semibold text-violet-800">Мешает реклама в видео?</summary>
    <p className="mt-3">Можно попробовать блокировщик рекламы. Выберите свой браузер — ссылки ведут в официальные магазины расширений.</p>
    <ul className="my-3 space-y-2">{links.map(([label, href]) => <li key={href}><a href={href} target="_blank" rel="noreferrer" className="font-semibold text-violet-700 underline underline-offset-2">{label} ↗</a></li>)}</ul>
    <ol className="ml-4 list-decimal space-y-1"><li>Откройте ссылку в браузере, в котором смотрите урок, и установите расширение. На iPhone/iPad после установки включите его в настройках расширений Safari.</li><li>Вернитесь на страницу урока и обновите её. На Android открывайте платформу в Firefox с установленным расширением.</li><li>Если встроенный плеер не запускается, попробуйте ссылку «Открыть на Rutube». Если проблема появилась после установки расширения, временно отключите его для этой страницы.</li></ol>
    <p className="mt-3">Удаление всей рекламы Rutube не гарантируется: результат зависит от браузера и способа показа рекламы. Расширение действует в своём браузере, а не в приложении Rutube. Установка необязательна.</p>
  </details>;
}
