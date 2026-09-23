import RutubeViewingHelp from './RutubeViewingHelp';
import React, { useState } from 'react';
import { Download, ExternalLink, Video, Monitor, CheckCircle2, Copy, RefreshCw } from 'lucide-react';
import { api } from '../services/api';

const panelUrl = 'http://127.0.0.1:18765/';
const status = { waiting: 'Ожидаем OBS', recording: 'Идёт запись', saved: 'Сохранено на компьютере', uploading: 'Загрузка в Rutube', processing: 'Обработка в Rutube', ready: 'Видео готово', error: 'Нужно действие в пульте' };
const button = 'inline-flex items-center justify-center gap-2 rounded-xl border border-violet-200 bg-white px-4 py-3 text-sm font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-50';
const instructions = [
  ['Демонстрация и случайная остановка', [
    'В звонке на платформе включите демонстрацию окна, вкладки или экрана. OBS автоматически покажет именно выбранное изображение; после выключения демонстрации вернётся к платформе. В пульте должен быть включён автовыбор демонстрации.',
    'Для Телемоста включите в пульте «Автоматически: платформа ↔ LibreOffice». Когда вы работаете в документе LibreOffice, он записывается крупно; вернулись на платформу — запись вернулась вместе с вами. Любой документ выбирается автоматически. «Перерыв» и ручной выбор источника имеют приоритет; кнопка «Платформа» возвращает автоматику.',
    'Если случайно остановили запись посреди урока, нажмите «Продолжить запись урока». Помощник проверит текущее занятие и соединит части перед прикреплением. Не нужно создавать отдельную ручную запись без привязки.',
  ]],
  ['Первая установка на Windows', [
    'Скачайте помощник кнопкой выше. Нажмите правой кнопкой по ZIP → «Извлечь всё». В распакованной папке дважды нажмите Install.cmd.',
    'Установщик проверит OBS Studio, Node.js, FFmpeg и Microsoft Edge. Если чего-то нет, предложит установить. Дождитесь окончания; если Windows запросит разрешение на установку компонента, подтвердите его. Затем откроется мастер настройки.',
    'В мастере выберите диск и папку для видео. Далее откройте платформу в отдельном окне с одной вкладкой, запустите настройку OBS и выберите окно, микрофон и источник звука разговора. Для звонка на платформе выберите её окно; для Телемоста — окно Телемоста.',
    'Получите код подключения в этом разделе и вставьте его в шаг «Платформа» в пульте. Код действует 5 минут. Один преподаватель может подключить один активный компьютер.',
    'Сделайте минутную пробную запись с собеседником. Прослушайте её: должны быть слышны вы и собеседник, а выбранное окно должно быть видно. Тест автоматически закончится и останется на компьютере.',
    'Нажмите «Войти в свой Rutube» в пульте. Войдите в отдельном окне Edge, которое откроет помощник, затем нажмите «Проверить вход» и включите автозагрузку. Вход в другом браузере не подходит.',
    'Вернитесь сюда и включите «Автоматически записывать уроки». Настройка готова: при следующих входах в Windows помощник запускается сам.',
  ]],
  ['Перед первым уроком дня', [
    'Откройте платформу и пульт. Нажмите «Начать сегодняшний день»: OBS запустится и проверит сохранённые источники и папку записи. Ежедневно проходить настройку заново не нужно.',
    'Если компьютер не на связи, откройте ярлык «IVAN100 - Запись уроков» на рабочем столе Windows. Если указано «Проверьте источники», откройте пульт: он покажет, какое окно или устройство недоступно.',
    'Проверьте изображение, микрофон и звук разговора в пульте. При смене наушников, микрофона или приложения заново выберите источники и прослушайте пробную запись.',
    'Начните нужное занятие на платформе. Для Телемоста сначала запустите занятие на платформе, затем перейдите в звонок: один только вход в Телемост запись не запускает. В пульте появятся «Идёт запись» и счётчик времени.',
  ]],
  ['Во время урока: платформа, LibreOffice и Python', [
    'Держать вкладку пульта открытой необязательно. Она управляет помощником, который работает в фоне.',
    'Для показа программы откройте её, нажмите в пульте «Обновить окна», выберите её в списке и нажмите «Окно программы». Кнопка «Платформа» возвращает окно платформы. «Весь экран» записывает весь выбранный монитор.',
    'Кнопка «Горячие клавиши» включает Ctrl + Alt + 1 (платформа), 2 (программа), 3 (монитор), 4 (перерыв). «Перерыв» записывает чёрный экран и тишину. После перерыва выберите нужное изображение.',
    'Переключение изображения в пульте не меняет демонстрацию экрана ученикам в звонке. Микрофон и звук разговора продолжают записываться при смене окон. Другие звучащие вкладки того же браузера тоже могут попасть в запись — закройте их или используйте для звонка отдельный браузер.',
  ]],
  ['Между уроками и после последнего занятия', [
    'Завершите урок кнопкой на платформе. Через несколько секунд OBS остановит запись и сохранит файл. При потере связи в звонке платформы запись продолжится: есть 5 минут на переподключение. Если звонок не восстановился, запись остановится; следующий урок запускает отдельный файл. Просто выход из звонка Телемоста не заменяет завершение урока на платформе.',
    'Начинайте следующий урок на платформе обычным способом. Он получит отдельную запись. Предыдущее видео загружается в фоне; останавливать и запускать OBS вручную не нужно.',
    'После последнего урока оставьте компьютер включённым, подключённым к интернету и без перехода в сон до статуса «Видео готово». Не закрывайте окно Rutube во время загрузки или модерации.',
    'Когда видео готово, оно автоматически прикрепляется к соответствующему занятию в расписании. Доступ в Rutube — «только по ссылке». Локальные MKV и MP4 остаются в выбранной папке и сами не удаляются.',
  ]],
  ['Если что-то не работает', [
    'Пульт не открывается: запустите ярлык помощника на этом компьютере. Если его нет — скачайте и установите помощник. Ссылка на пульт не управляет другим компьютером.',
    'OBS просит настройку WebSocket: закройте OBS в перерыве между занятиями и снова нажмите «Запустить и настроить OBS» в мастере. Во время записи OBS не закрывайте.',
    'Нет изображения или голоса: откройте нужные окна, нажмите «Обновить окна» и проверьте источники в мастере. Голос ученика проверяется с говорящим собеседником. Сохраните источники и повторите тест.',
    'Запись не началась: проверьте включение автоматической записи здесь и готовность компьютера. Откройте пульт и прочитайте причину. «Начать вручную» — запасной режим: такую запись нужно остановить в пульте, она сама не привяжется к уроку. Уже пропущенные минуты восстановить нельзя.',
    'Загрузка прервалась: файл остаётся на компьютере. В пульте у записи нажмите «Продолжить загрузку». Если нужен вход в Rutube, войдите через кнопку помощника. При уже созданном видео помощник проверит его, чтобы не сделать копию.',
    'Если Rutube требует ручного действия: закончите публикацию с доступом «только по ссылке», скопируйте полную закрытую ссылку (включая ?p=…) и вставьте её у нужной записи в пульте → «Прикрепить». После обработки видео появится на платформе.',
    'Заканчивается место: дождитесь окончания записи и загрузки, выберите другую папку в мастере. Новые видео пойдут туда; прежние останутся в старой папке. Проверьте готовое видео на платформе перед ручным удалением локальных копий.',
  ]],
  ['Другой компьютер или другой преподаватель', [
    'На новом компьютере войдите на платформу, откройте этот раздел и повторите установку и мастер настройки. Получение и использование нового кода заменяет предыдущий подключённый компьютер.',
    'Сначала дождитесь завершения записей и загрузок на старом компьютере. Файлы видео и очередь загрузки между компьютерами не переносятся автоматически.',
    'Каждый преподаватель устанавливает помощник под своим пользователем Windows, получает код в своём аккаунте платформы и входит в свой Rutube. Готовые записи остаются доступны на платформе независимо от используемого компьютера.',
  ]],
];

export default function LessonRecordingSection({ recorder }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const settings = recorder.settings;
  const device = settings?.devices?.[0];
  const action = async (fn) => {
    setBusy(true); setError(''); setNotice('');
    try { await fn(); await recorder.refresh(); } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  const download = async () => {
    const blob = await api.downloadDesktopRecorder();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = 'IVAN100-Recorder-Windows.zip';
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
    setNotice('Архив скачан. Распакуйте его и дважды нажмите Install.cmd. После установки откроется мастер настройки.');
  };
  return <section className="mx-auto max-w-6xl space-y-5 pb-8" aria-label="Запись уроков">
    <header className="rounded-3xl bg-gradient-to-br from-violet-600 to-purple-700 p-6 text-white shadow-lg sm:p-8">
      <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-violet-100"><Video size={16} /> Уроки на компьютере</div>
      <h1 className="text-3xl font-extrabold">Запись уроков</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-violet-100">Помощник сохранит занятие на вашем компьютере, загрузит в Rutube и прикрепит к нужному уроку.</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <a className={button} href={panelUrl} target="_blank" rel="noreferrer"><ExternalLink size={17} /> Открыть пульт в новой вкладке</a>
        <button className={button} disabled={busy} onClick={() => action(download)}><Download size={17} /> Скачать помощник для Windows</button>
      </div>
      <p className="mt-3 text-xs leading-5 text-violet-100">Windows 10/11 · ZIP с установщиком · Пульт открывается на компьютере, где установлен помощник.</p>
    </header>
    {(error || recorder.error) && <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error || recorder.error}</p>}
    {notice && <p role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</p>}
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="rounded-3xl border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold text-slate-900">Мой компьютер</h2><button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Обновить состояние" disabled={busy} onClick={() => action(() => recorder.refresh())}><RefreshCw size={17} /></button></div>
        <div className="my-4 flex items-center gap-3 rounded-2xl bg-slate-50 p-4"><Monitor className={device?.online && device.ready ? 'text-emerald-600' : 'text-slate-400'} size={27} /><div><p className="font-semibold text-slate-900">{device?.name || 'Подключите помощник'}</p><p className="mt-1 text-sm text-slate-500">{!settings ? 'Получаем состояние…' : device?.online ? (device.ready ? 'На связи · OBS готов к записи' : 'На связи · проверьте источники в пульте') : device ? 'Не на связи · откройте ярлык помощника в Windows' : 'Подключение нужно при первой настройке'}</p></div></div>
        <label className="flex items-start gap-3 text-sm font-semibold text-slate-800"><input className="mt-1 accent-violet-600" type="checkbox" checked={recorder.enabled} disabled={busy || !settings} onChange={(event) => action(() => api.desktopRecording('settings', { enabled: event.target.checked }, 'PUT'))} /><span>Автоматически записывать уроки<span className="mt-1 block text-xs font-normal leading-5 text-slate-500">Включите после настройки и проверки звука. Начало и завершение занятия на платформе управляют записью.</span></span></label>
        <div className="mt-5 border-t border-slate-100 pt-4"><button className={button} disabled={busy} onClick={() => action(async () => setCode((await api.desktopRecording('pair', {})).code))}>Получить код подключения</button>
          {code && <div className="mt-3"><label htmlFor="recorder-pair-code" className="text-xs text-slate-600">Вставьте в шаг «Платформа» в пульте. Код действует 5 минут.</label><div className="mt-2 flex gap-2"><input id="recorder-pair-code" className="min-w-0 flex-1 rounded-xl border p-3 text-sm" readOnly value={code} onFocus={e => e.target.select()} /><button className={button} aria-label="Скопировать код" onClick={() => action(async () => { await navigator.clipboard.writeText(code); setNotice('Код скопирован. Вставьте его в пульт помощника.'); })}><Copy size={17} /></button></div></div>}
          <p className="mt-3 text-xs leading-5 text-slate-500">Один активный компьютер на преподавателя. Подключение нового компьютера заменит старое. Другой преподаватель использует свой аккаунт платформы и свой Rutube.</p></div>
      </section>
      <section className="rounded-3xl border border-slate-200 bg-white p-6"><h2 className="text-lg font-bold text-slate-900">Настроить один раз</h2>
        <ol className="mt-5 space-y-4">{[
          ['Установите помощник', 'Скачайте ZIP, распакуйте и запустите Install.cmd.'],
          ['Пройдите мастер в пульте', 'Папка для видео → изображение и звук → код подключения.'],
          ['Проверьте запись и войдите в Rutube', 'Прослушайте тест, войдите в отдельном окне помощника и включите автозагрузку.'],
        ].map(([title, text], index) => <li key={title} className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-700">{index + 1}</span><div><p className="text-sm font-semibold text-slate-900">{title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{text}</p></div></li>)}</ol>
        <div className="mt-5 flex flex-wrap gap-3"><a className={button} href={`${panelUrl}#setup`} target="_blank" rel="noreferrer">Открыть мастер <ExternalLink size={15} /></a><a className={button} href="#recording-instructions">Подробная инструкция ↓</a></div>
      </section>
    </div>
    <section className="rounded-3xl border border-violet-100 bg-violet-50 p-6"><h2 className="font-bold text-slate-900">Каждый урок — отдельная запись</h2><p className="mt-2 text-sm leading-6 text-slate-600">Нажмите «Начать сегодняшний день» в пульте → подключайтесь к урокам на платформе. Между уроками можно сразу переключаться к следующему ученику: помощник сам меняет файл. Помощник загружает видео в фоне. После последнего урока оставьте компьютер включённым до статуса «Видео готово».</p></section>
    <section className="rounded-3xl border border-slate-200 bg-white p-6"><h2 className="text-lg font-bold text-slate-900">Последние записи</h2>
      {settings?.jobs?.length ? <ul className="mt-3 divide-y divide-slate-100">{settings.jobs.map(job => <li key={job.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><p className="text-sm font-semibold text-slate-900">{job.title}</p><p className={`mt-1 text-xs ${job.status === 'error' ? 'text-rose-600' : 'text-slate-500'}`}>{status[job.status] || job.status}{job.error && ` · ${job.error}`}</p></div>{job.status === 'ready' ? <span className="flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 size={16} /> Прикреплено к уроку</span> : job.status === 'error' && <a className={button} href={panelUrl} target="_blank" rel="noreferrer">Открыть пульт</a>}</li>)}</ul> : <p className="mt-3 text-sm text-slate-500">Здесь появятся записи занятий после подключения помощника.</p>}
    </section>
    <section id="recording-instructions" className="scroll-mt-6 rounded-3xl border border-slate-200 bg-white p-6"><h2 className="text-xl font-bold text-slate-900">Как пользоваться записью уроков</h2><p className="mb-4 mt-2 text-sm text-slate-500">От первой установки до готового видео в расписании.</p>
      {instructions.map(([title, steps], index) => <details key={title} open={index === 0 ? true : undefined} className="border-t border-slate-100 py-4"><summary className="cursor-pointer text-sm font-semibold text-slate-800">{title}</summary><ol className="ml-5 mt-4 list-decimal space-y-3 text-sm leading-6 text-slate-600">{steps.map(step => <li key={step} className="pl-1">{step}</li>)}</ol></details>)}
    </section>
    <RutubeViewingHelp />
  </section>;
}
