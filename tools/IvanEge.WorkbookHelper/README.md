# IvanEge Workbook Helper

Windows-помощник для кнопки «Решать» на платформе. Работает без прав администратора и не получает браузерную сессию пользователя.

## Пользовательский сценарий

1. До публикации в Microsoft Store платформа временно раздаёт прямую EXE-сборку. Она не подписана доверенным Authenticode-сертификатом, поэтому браузер, SmartScreen или антивирус могут показать предупреждение. На платформе это обозначено явно, а браузерный способ решения остаётся доступным.
2. После запуска `IvanEgeWorkbookHelper.exe` программа спрашивает согласие, копирует себя в `%LOCALAPPDATA%\IvanEge\WorkbookHelper` и регистрирует `ivan-ege://` в `HKCU`. Права администратора и автозапуск Windows не используются.
3. После публикации основной канал установки — Microsoft Store. Windows устанавливает подписанный MSIX и регистрирует `ivan-ege://` из манифеста пакета. В пакетном режиме помощник не копирует себя и не изменяет реестр вручную.
4. Кнопка «Решать» открывает ссылку вида `ivan-ege://workbook/open?origin=...&ticket=...`.
5. `https://ivan100.ru` и loopback-адреса разработки (`localhost`, `127.0.0.1`, `::1`, с любым dev-портом) разрешены автоматически. Для другого нового HTTPS-origin помощник спрашивает разрешение; обычный HTTP вне loopback запрещён.
6. Одноразовый ticket обменивается на scoped workbook token. Таблица скачивается в `%USERPROFILE%\Desktop\Иван на сотку\Решения` (fallback — Documents), получает Mark-of-the-Web `ZoneId=3` и открывается системной ассоциацией Excel/LibreOffice. Для `.xls`, `.xlsm`, `.xlsb` метка записывается и читается обратно: при любой ошибке проверки helper сохраняет файл и показывает его в Проводнике, но не открывает автоматически.
7. Для заданий с исходным текстом (например, № 26 и № 27) helper по тому же scoped token отдельно скачивает `.txt`, `.csv` или `.tsv` (не больше 16 МБ), сверяет SHA-256, сохраняет уникальную копию в папке `Задания` и открывает её именно через `notepad.exe`. Одновременно открывается пустая таблица; FileSystemWatcher и автосохранение следят только за таблицей, исходный текст никогда не отправляется как решение.
8. FileSystemWatcher следит за сохранениями, делает устойчивый snapshot, сравнивает SHA-256 и отправляет только изменившийся файл. Несколько таблиц и несколько локальных копий одной таблицы могут отслеживаться одновременно: каждый локальный файл получает свой watcher. Для новой решённой работы при первом изменённом сохранении помощник один раз просит название; отмена не отправляет файл, а выбранное имя сохраняется для сетевых повторов и больше не запрашивается после успешной отправки.

Поддерживаются рабочие форматы `.xls`, `.xlsx`, `.xlsm`, `.xlsb`, `.ods`, `.fods`. Шаблоны `.xlt`, `.xltx`, `.ots` отклоняются: приложение обычно делает для них Save As в другой файл, который нельзя надёжно продолжать отслеживать.

Версия из Microsoft Store обновляется штатными средствами Store. Для резервной EXE-версии перед ручным обновлением нужно выбрать «Выход» в старом значке трея, затем запустить свежий подписанный EXE.

## Серверный контракт

- `POST {origin}/workbook-helper/v1/exchange`, JSON `{ "ticket": "..." }`
- ответ: `{ token, workbookKey, fileName, revision, contentHash, expiresAt, requiresName, solutionName?, sourceText?: { fileName, contentHash, sizeBytes } }`
- `GET {origin}/workbook-helper/v1/content`
- `GET {origin}/workbook-helper/v1/source-text` — только когда exchange вернул `sourceText`; максимум 16 МБ, SHA-256 дублируется в `X-Source-Text-Content-Hash`
- актуальные `revision` и `contentHash` читаются из GET-заголовков `X-Workbook-Revision` и `X-Workbook-Content-Hash`
- `PUT {origin}/workbook-helper/v1/content`, multipart-поля `file`, `revision`, `contentHash` и `solutionName` для первого сохранения нового результата
- GET/PUT используют только `Authorization: Workbook <scoped-token>`

Редиректы не принимаются. Обычный web auth token в custom URI и helper не передаётся.

## Сборка

### MSIX для Microsoft Store (рекомендуется)

```powershell
& tools\IvanEge.WorkbookHelper\build.ps1 `
  -Target StoreMsix `
  -PackageIdentityName '<Name из Partner Center>' `
  -PackagePublisher '<Publisher из Partner Center>' `
  -PublisherDisplayName 'Иван на сотку'
```

Скрипт создаёт self-contained многофайловую сборку без runtime-самораспаковки, запускает `--self-test` и формирует `artifacts\IvanEgeWorkbookHelper_<version>_x64.msix`. Параметры identity и publisher должны точно совпадать со значениями в Partner Center. Для отправки MSIX в Store собственный сертификат не нужен: Microsoft проверит и подпишет пакет. Неподписанный MSIX нельзя раздавать ученикам напрямую.

### Резервный подписанный EXE

```powershell
& tools\IvanEge.WorkbookHelper\build.ps1 `
  -Target SignedExe `
  -CertificateThumbprint '<thumbprint доверенного code-signing сертификата>' `
  -PublishDownload
```

В этом режиме создаётся несжатый self-contained single-file, выполняется self-test, затем SignTool добавляет SHA-256 Authenticode-подпись и timestamp. `-PublishDownload` копирует файл в `public\downloads` только после успешной проверки подписи; публикация неподписанного EXE завершается ошибкой.

Оба артефакта не требуют установленного .NET. Для прямой раздачи подпись снижает число репутационных предупреждений, но не гарантирует отсутствие SmartScreen на первых загрузках нового издателя. Наиболее предсказуемый массовый канал — Microsoft Store.

Пока Store-версия проходит оформление, `VITE_WORKBOOK_HELPER_INSTALL_URL=/downloads/IvanEgeWorkbookHelper.exe` включает временную прямую загрузку. После публикации замените значение на окончательную HTTPS-ссылку страницы приложения в Store. Браузерный режим решения должен оставаться доступным в обоих вариантах.
