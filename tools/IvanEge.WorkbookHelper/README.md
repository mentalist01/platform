# IvanEge Workbook Helper

Windows-помощник для кнопки «Решать» на платформе. Работает без прав администратора и не получает браузерную сессию пользователя.

## Пользовательский сценарий

1. До публикации в Microsoft Store платформа раздаёт обычный ZIP с EXE, инструкцией и SHA-256. Прямой EXE остаётся резервной загрузкой. Подпись текущего файла проверяется отдельно: ZIP не заменяет доверенный Authenticode-сертификат и не гарантирует отсутствие предупреждений. Информация доступна на `/workbook-helper/`, браузерный способ решения остаётся доступным.
2. После запуска `IvanEgeWorkbookHelper.exe` программа спрашивает согласие, копирует себя в `%LOCALAPPDATA%\IvanEge\WorkbookHelper` и регистрирует `ivan-ege://` в `HKCU`. Права администратора и автозапуск Windows не используются.
3. После публикации основной канал установки — Microsoft Store. Windows устанавливает подписанный MSIX и регистрирует `ivan-ege://` из манифеста пакета. В пакетном режиме помощник не копирует себя и не изменяет реестр вручную.
4. Основная кнопка «Excel / LibreOffice» открывает ссылку вида `ivan-ege://workbook/open?origin=...&ticket=...`. Отдельная кнопка «В браузере» сохраняет браузерный режим без установки.
5. `https://ivan100.ru` и loopback-адреса разработки (`localhost`, `127.0.0.1`, `::1`, с любым dev-портом) разрешены автоматически. Для другого нового HTTPS-origin помощник спрашивает разрешение; обычный HTTP вне loopback запрещён.
6. Одноразовый ticket обменивается на scoped workbook token. Таблица скачивается в `%USERPROFILE%\Desktop\Иван на сотку\Решения` (fallback — Documents), получает Mark-of-the-Web `ZoneId=3` и открывается в LibreOffice при его наличии, иначе в Excel. Ручной выбор программы имеет приоритет. Для `.xls`, `.xlsm`, `.xlsb` метка записывается и читается обратно: при любой ошибке проверки helper сохраняет файл и показывает его в Проводнике, но не открывает автоматически.
7. Для заданий с исходным текстом (например, № 26 и № 27) helper по тому же scoped token отдельно скачивает `.txt`, `.csv` или `.tsv` (не больше 16 МБ), сверяет SHA-256, сохраняет уникальную копию в папке `Задания` и открывает её именно через `notepad.exe`. Одновременно открывается пустая таблица; FileSystemWatcher и автосохранение следят только за таблицей, исходный текст никогда не отправляется как решение.
8. FileSystemWatcher следит за сохранениями, делает устойчивый snapshot, сравнивает SHA-256 и отправляет только изменившийся файл. Если Excel или LibreOffice при первом `Ctrl+S` создаёт новую копию через «Сохранить как», помощник продолжает отслеживать эту копию: при одной открытой работе автоматически, при нескольких — после выбора исходной работы. Формат новой копии должен совпадать с исходным. Несколько таблиц и несколько локальных копий одной таблицы могут отслеживаться одновременно: каждый локальный файл получает свой watcher. Для новой решённой работы при первом изменённом сохранении помощник один раз просит название; отмена не отправляет файл, а выбранное имя сохраняется для сетевых повторов и больше не запрашивается после успешной отправки.

Поддерживаются рабочие форматы `.xls`, `.xlsx`, `.xlsm`, `.xlsb`, `.ods`, `.fods`. В версии 1.3.3 несжатые `.fods` упаковываются в `.ods` только для отправки: формулы и локальный открытый файл сохраняются. Лимит отправки — 64 МБ сжатой копии; несжатый `.fods` читается потоком до 512 МБ. Через «Сохранить как» допустим переход `.fods` → `.ods`. Остальные форматы должны совпадать с исходным; шаблоны `.xlt`, `.xltx`, `.ots` отклоняются.

Версия из Microsoft Store обновляется штатными средствами Store. Для резервной EXE-версии перед ручным обновлением нужно выбрать «Выход» в старом значке трея, затем запустить свежий EXE.

## Автообновление EXE · с версии 1.5.2

Помощник проверяет подписанный `https://ivan100.ru/downloads/workbook-helper-update.json` при запуске и каждые восемь часов работы. Можно отключить автоматическую проверку или вызвать её вручную в меню трея. Для старых помощников требуется одна ручная установка 1.5.2. MSIX продолжает обновляться средствами Store.

Манифест содержит base64-поля `payload` и `signature`: ECDSA P-256 / SHA-256, DER-подпись, доверенный SPKI-ключ встроен из `update-public-key.json`. Подписанный payload фиксирует продукт, четыре компонента версии, HTTPS-адрес неизменяемого EXE, длину и SHA-256. Разрешён только путь `/downloads/updates/IvanEgeWorkbookHelper-<version>.exe` на ivan100.ru; редиректы, чужие продукты, слишком большие пакеты и автоматическое понижение версии отвергаются. Это собственная проверка подлинности обновлений, не Authenticode и не сертификат издателя Windows.

Загрузка выполняется в `%LOCALAPPDATA%/IvanEge/WorkbookHelper/updates`. Пока открыта общая таблица, есть ожидающая отправки команда, не опубликованная общая версия или конфликт, автоматическая замена EXE запрещена. Отдельные таблицы с FileSystemWatcher блокируют замену до остановки слежения или следующего запуска помощника. Отдельный процесс ожидает завершения старого помощника, повторно проверяет пакет, запускает `--self-test` и атомарно заменяет только EXE с сохранением `.previous`. Протокольные запросы передаются новой версии без записи билетов в файлы. Рабочие книги, файлы восстановления и доверенные сайты не удаляются. Ошибка загрузки или проверки не останавливает текущую сессию. Настройки защиты Windows не меняются, интернет-метка нового EXE сохраняется.

Для выпуска: увеличьте версию, соберите DirectExe/SignedExe, подпишите манифест командой `node tools/IvanEge.WorkbookHelper/update.mjs --key <локальный-закрытый-ключ-вне-репозитория>`, затем выполните сборку сайта. Упаковка проверит подпись и совпадение версии/хеша EXE, добавит неизменяемый файл в downloads/updates. Новый указатель манифеста публикуется после соответствующего EXE. Закрытый ключ следует хранить отдельно и резервировать защищённым способом; на сервер и в Git он не передаётся. Публичный ключ в уже установленных клиентах менять без плана ротации нельзя.

Проверки: `node --test tools/IvanEge.WorkbookHelper/update.test.mjs`, `--self-test`, `--verify-update-manifest <manifest> <exe>` и изолированный `--update-install-check <manifest> <exe>`.

## Серверный контракт

### Совместная таблица · Windows 1.5.2

Участники индивидуального урока нажимают «Решать через помощник таблиц». Программа выбирается автоматически; преподаватель может выбрать Excel или LibreOffice рядом с кнопкой. Групповые ученики получают сохранённый файл преподавателя для просмотра. Для синхронизации фильтров и исправления прокрутки нужен помощник 1.5.1 у обоих участников. Старые версии сохраняют обычный режим, но не подключаются к новой общей таблице.

Помощник запускает отдельный экземпляр Excel или отдельный короткий временный профиль LibreOffice через его встроенный Python. Уже открытые личные документы не подключаются. Таблица преобразуется в рабочую копию XLSX без выполнения макросов. Значения, обычные формулы, сплошная заливка и границы ячеек синхронизируются по ячейкам; сохранение Ctrl+S публикует общую версию на доску и в конспекты. Порядок строк после сортировки, обычные фильтры значений, числовые условия и скрытые строки передаются другим участникам. Группировка дат, цветовые, динамические и top-N фильтры пока отклоняются с явным сообщением. Прокрутка, масштаб, текущий лист и собственное выделение остаются локальными; экспорт снимка и получение правок сохраняют положение окна. Структурные изменения требуют актуальной версии всего документа. Для фильтра есть отдельная компактная команда без пересылки всех ячеек. Изменение одной и той же ячейки не перезаписывается молча: участник выбирает свои изменённые ячейки или общую версию, полная копия до выбора остаётся локально.

Общие правки отменяются кнопками «Отменить мою правку» и «Вернуть» в окне помощника. Нативная история Undo офисного приложения после получения удалённых правок может сбрасываться. Ширина столбцов, числовые форматы, шрифты, объединения, диаграммы, рисунки и макросы совместно не синхронизируются; для такой работы остаётся обычный режим. Массивные формулы, внешние связи, градиентные/узорные заливки отклоняются с понятным сообщением. Совместный режим macOS в эту версию не входит.

Перед отправкой команды помощник сохраняет журнал ожидания и XLSX-копию в `%LOCALAPPDATA%/IvanEge/WorkbookHelper/live-pending`. Токены в журнал не записываются. При обрыве сети команда повторяется с тем же идентификатором, после перезапуска предлагается согласовать сохранившийся конфликт. Небольшие правки передаются по событиям изменённых ячеек без обязательного полного XLSX-экспорта; локальная модель с ожидающей командой записывается до отправки, а полная предыдущая копия остаётся для восстановления. Массовые и неизвестные операции проходят проверку полного снимка; резервная сверка выполняется ограниченно по времени. Получение обычных удалённых ячеек не экспортирует всю книгу. Сервер подтверждает правки только после fsync журнала и ограничивает объём истории и число документов в памяти.

Дополнительные scoped маршруты: `GET /workbook-helper/v1/live/state`, `POST /live/initialize`, `POST /live/sync`, `POST /live/checkpoint`. Последние три пути имеют префикс `/workbook-helper/v1`. Полный PUT файла в этом режиме отклоняется, чтобы старая локальная копия не затёрла общие правки.

Проверка настоящих приложений с изолированным сервером: `node tools/workbook-live-prototype/backend-native-check.mjs output/<unique-directory> excel-calc`. Также доступны `excel-excel`, `calc-excel`, `calc-calc`. Нужны установленные приложения; тесты создают только свои книги и отдельные профили.

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

Для явно обозначенной временной загрузки до появления Store-версии используется сжатая сборка:

```powershell
& tools\IvanEge.WorkbookHelper\build.ps1 -Target DirectExe -PublishDownload
```

Она также проходит self-test, но без сертификата остаётся неподписанной и поэтому может вызвать предупреждение браузера, SmartScreen или антивируса. Этот режим не следует выдавать за подписанную сборку.

Оба артефакта не требуют установленного .NET. Для прямой раздачи подпись снижает число репутационных предупреждений, но не гарантирует отсутствие SmartScreen на первых загрузках нового издателя. Наиболее предсказуемый массовый канал — Microsoft Store.

`scripts/build.mjs` формирует `downloads/IvanEgeWorkbookHelper.zip`, `workbook-helper-release.json` и `IvanEgeWorkbookHelper.sha256` из опубликованного EXE. Упаковка не пересобирает программу и не изменяет её хеш или существующую подпись. Сверяется PE-формат и наличие ожидаемой версии; поле `embeddedSignature` означает только наличие таблицы подписи, а не проверенное доверие к сертификату. Для подписанной сборки обязательно выполнить проверку SignTool.

По умолчанию используется `/downloads/IvanEgeWorkbookHelper.zip`. Прежняя конфигурация `/downloads/IvanEgeWorkbookHelper.exe` переключается на этот ZIP без изменения серверного `.env.production`. После публикации можно указать окончательную HTTPS-ссылку в Microsoft Store. Пустой override по-прежнему отключает установку; внешняя ссылка EXE сохраняется.

Для `SignedExe` нужен действующий сертификат с Code Signing EKU, доступом к закрытому ключу и доверенной цепочкой. Сборка проверяет срок, назначение, Authenticode, timestamp и `signtool verify /pa /all /tw`. Самоподписанный сертификат и обычный TLS-сертификат не заменяют подпись издателя. Закрытые ключи, PIN токена и документы владельца никогда не добавляются в репозиторий или архив загрузки.

Для ложных срабатываний сначала зафиксируйте точную формулировку, продукт, версию EXE и SHA-256. Репутационное предупреждение SmartScreen об неизвестном издателе отличается от антивирусного обнаружения. Обращение направляется производителю, который выдал обнаружение; нельзя считать чистый результат одной проверки доказательством отсутствия всех предупреждений. Упаковка не должна использовать пароли, обфускацию, удаление Mark-of-the-Web, исключения антивируса или отключение проверок.


## Исправление установки · 1.5.3

Ручная установка проверяет точное совпадение нового файла по SHA-256. Заблокированная старая копия не запускается как успешно обновлённая: установщик предлагает сохранить таблицы, завершить прежний помощник и повторить замену. Проверка на заблокированном файле входит в self-test. Версия запущенного процесса видна в меню возле часов и передаётся в User-Agent автоматически. Отдельные копии для LibreOffice запускаются через soffice.exe, а не через каталог program.

Установщик снимает атрибут ReadOnly только с собственного заменяемого EXE, сохраняя остальные атрибуты и восстанавливая прежние при неудачной замене. Это проверено для ручной и автоматической установки; права доступа Windows, Mark-of-the-Web и антивирусные проверки сохраняются. Пользователям 1.5.0 требуется однократная ручная установка новой версии.

## Live typing and push notifications · 1.5.4

The authenticated WebSocket carries only transient cursor/draft frames and revision/checkpoint hints. Durable commands retain their idempotent HTTP journal and fsync-before-send local recovery. The channel reconnects with bounded backoff and falls back to polling; credentials stay in the Authorization header and never enter the URL. Server authorization is checked on every presence update and periodically on idle sockets.

Calc reads the active cell editor or focused formula input through the scoped document's accessibility API. It never inspects unrelated windows or captures global keystrokes. Drafts are limited to 4096 characters, expire separately from cursors and are shown in the click-through presence overlay, never written into the book. No export or incoming native write is performed while the local Calc editor holds unconfirmed input. Excel receives previews; its own unconfirmed input is not yet captured.

Large-book recovery serialization streams stable nodes under the existing workbook gate instead of cloning the full workbook repeatedly. The recovery schema and flush-before-send guarantee are unchanged.


## Update before opening and compact presence · 1.5.5

An unopened workbook request stays in the tray queue until the automatic update check finishes. A verified staged release takes priority over queued requests at a safe point, and the existing updater forwards those requests to the new process. Checks use a five-second manifest deadline; downloads are bounded to 90 seconds to keep the three-minute launch ticket valid. Network or update-launch failure opens the current version instead of trapping the request. Open or unsaved sessions still block replacement. The launch gate is covered by native self-tests, including concurrent checks, pending requests, disabled updates and retry backoff.

Presence uses a distinct color per active participant (up to the existing 32-person limit), stable across cursor changes and same-actor reconnect. The native overlay draws only the border and a four-pixel corner marker. Names and color keys are in the tray menu, away from workbook contents; typing previews remain transient.


## Sparse reconciliation and hover names · 1.5.6

After complete convergence the client tracks touched cell properties and compares/applies only that set. A full snapshot, structural replacement, filter event or oversized set invalidates this shortcut. Conditional native writes still compare the expected value; skipped properties retain their original version until explicit conflict resolution or successful application. Local pending recovery is flushed before send using the unchanged schema. Native Calc/Excel checks cover a concurrent unsubmitted edit injected between receiving state and applying its delta.

Presence is a click-through, non-topmost window owned by the spreadsheet's root window. It remains visible on uncovered cells after focus changes, follows the native z-order and hides for a hidden/minimized workbook or expired frame. Hover hit-testing is clipped to the sheet viewport and shows the peer's name beside the pointer; no label is drawn otherwise. Names never enter workbook contents or undo history.


## Ordinary opening after startup failure · 1.5.7

If no native workbook was attached, a failed live startup requests a scoped ordinary grant before opening a distinct, protected copy through the system association. The existing file watcher uploads Ctrl+S saves to the board and notes. These explicit fallback sessions use last-save-wins for full files; ordinary tokens from the previous locked mode remain protected. Future opens of this asset use ordinary grants until its live mode is restarted. Existing native clients retain their own cell sessions; file saves follow the latest board version. A bounded server journal contains only version, engine, startup stage, HRESULT, error type and a redacted startup summary. Only the owning teacher can read the diagnostics API. No cell data or raw local log is uploaded.

Excel is shown before importing/converting a workbook; fatal startup errors also have a persistent copyable window when Windows balloons are disabled. A failed startup with no attached office document does not indefinitely block a safe helper update.


## Excel path compatibility and editor identification · 1.5.8

Shared sessions keep native working copies under a short per-user private workspace. Excel receives a distinct protected input file without task-name brackets; snapshots stay below its native path limit. Existing task downloads and recovery copies are retained. Optional AskToUpdateLinks is tolerated only when the member is absent; macros stay disabled and Workbooks.Open explicitly disables external link updates. The ODS-only named-style repair no longer probes Styles for unrelated formats.

An association lookup reads the normal editor name, product, version and executable basename through AssocQueryStringW and file version metadata. No local executable path, document contents or hardware identifiers are transmitted. Metadata reporting is bounded, best effort and does not block opening. It also works for ordinary grants. Teachers can restart live mode after fallback from the newest saved binary with a new epoch; old grants cannot write into the new session.

## Large workbook file autosave and Excel busy responses · 1.5.9

The 250,000 populated-cell / 18 MiB live-model bounds are retained. A native capacity exception or server HTTP 413 switches the already attached editor to whole-file saving instead of leaving it open without a saver. A complete raw XLSX export is retained in `data/recovered/` before requesting the existing fallback grant. The current native file is saved, watched and uploaded once; subsequent Ctrl+S saves use the ordinary file watcher, board history and Notes. There is no truncation, source reopening, editor closure or cell-model parse during transition. Native status polling continues without sending presence or cell patches. Whole-file uploads retain the 64 MiB bound and authorized last-save-wins semantics.

Excel temporary COM rejection 0x800AC472 is classified with RPC busy responses. It neither marks the workbook closed nor generates a synchronization warning. Test injection covers the actual native bridge response and its next successful call. Reproduce capacity regressions with `node tools/workbook-live-prototype/capacity-backend-check.mjs <new-output-directory>` and `WORKBOOK_NATIVE_CHECK_PYTHON` pointing to Python; this uses isolated loopback accounts, actual Excel/Calc instances, 300001-row opening and 270000-cell growth.


## Cell borders · 1.5.10

The shared model carries sparse `borders` independently from contents and fill. All four visual edges use canonical ownership by the upper/left cell to normalize Excel and Calc serialization. The helper supports the 13 OOXML line styles, RGB/theme/indexed colors, and clearing a border-only empty cell. Calc native reads match its XLSX export width thresholds so conditional writes agree with snapshots. Cell batches, recovery copies, undo/redo, journal limits and local viewport protection stay in place.

The feature is negotiated on exchange. Old sessions continue in their existing mode. A fresh format-capable epoch is created only when the old book is checkpointed and has no connected or recently active legacy client; the newest saved binary seeds it. Old tokens cannot overwrite a new epoch. Both participants should save, close and update the helper before reopening from the board. Large books retain whole-file fallback from 1.5.9.
