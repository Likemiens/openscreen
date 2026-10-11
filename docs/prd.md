# PRD: OpenScreen Personal Creator Edition

- Статус: **READY WITH CONDITIONS**
- Владелец: Александр
- Дата: 1 августа 2026, обновлено 7 октября 2026
- Текущий срез: quick clip — хоткей → область → Stop → готовый файл → ссылка или файл

## 1. Product direction

OpenScreen — персональная основа для быстрого производства продуктовых видео. Мы сохраняем
recorder-first flow и добавляем функции только там, где они сокращают путь
`идея → запись → готовый файл → публикация`.

Главный сценарий (срез от 7 октября 2026) — **quick clip**: хоткей, выбор области, запись, Stop.
Качество и FPS выбраны заранее; клип с курсором в кадре сохраняется в папку пользователя сразу
после Stop, без редактора. Карточка клипа даёт Copy link (Яндекс Диск), Copy file, перетаскивание,
Show in folder и Edit in Studio. Подробности — D-011…D-015 в `docs/decisions.md`.

Запись с редактируемым курсором или камерой идёт прежним путём. После Stop приложение создаёт
локальную запись, пользователь задаёт название, при необходимости меняет Quality/FPS и выбирает
один из трёх явных путей:

1. **Save Anywhere** — пользователь выбирает путь, OpenScreen скрыто собирает итоговый MP4.
2. **Publish & Get Link** — OpenScreen скрывается, в фоне собирает итоговый MP4, отправляет его в
   `disk:/OpenScreen Exports`, публикует отдельный файл и копирует его URL.
3. **Edit in Studio** — пользователь редактирует ролик и затем выбирает **Publish** или
   **Save Local**.

Автопубликации после Stop нет. Успех показывается только после проверки типа и размера файла на
Яндекс Диске; уведомление содержит действие для открытия конкретного видео.

## 2. Product principles

- локальная запись — source of truth до подтверждения облака;
- публикация является явным пользовательским действием;
- немедленная публикация и публикация из редактора используют один MP4 export pipeline, поэтому
  webcam, cursor overlay и остальные визуальные слои не теряются;
- сетевой сбой никогда не удаляет локальные данные;
- персональная сборка англоязычная и не показывает неиспользуемые Notes, language picker и
  vertical tray;
- повторяющиеся recording setup сохраняются как локальные Recording Recipes и применяются одним
  действием без изменения native recorder;
- creator-focused изменения живут в `creator-edition`, а `main` остаётся зеркалом upstream.

## 3. Goal and metrics

Focus outcome: от хоткея до файла, который можно отправить, — без единого экрана настроек; от
Stop до ссылки в буфере — один клик.

Метрики пилота:

- не менее 95% запущенных публикаций завершаются успешно;
- 0 публикаций без явного нажатия Publish/«Опубликовать»;
- 0 потерянных локальных записей при ошибке API или export;
- 0 локальных удалений без серверной проверки размера;
- webcam preview появляется до старта записи;
- сохранённый recipe восстанавливает capture/export setup одним действием;
- пользователь всегда понимает разницу между системным и редактируемым курсором.

## 4. MVP scope

Входит:

- экран завершённой записи с полем названия;
- фоновая публикация итогового MP4 без показа редактора;
- видимые действия **Publish** и **Save Local** в редакторе;
- OAuth-токен, зашифрованный Electron `safeStorage`;
- проверка точной публичной папки и размера загруженного файла;
- последовательная upload queue, потоковая отправка и один retry для 429/5xx;
- опциональное удаление локального export и source bundle после подтверждения, включённое по
  умолчанию;
- toast и системное уведомление с переходом в общую папку;
- webcam preview в HUD;
- HUD с timer, Stop, Restart и Delete, исключённый из screen capture;
- английский интерфейс без language picker, Notes и vertical tray;
- post-recording launcher с Quality (720p/1080p/Source), FPS (30/60), Save Anywhere,
  Edit in Studio и Publish & Get Link.
- Recording Recipes: Product Demo, Quick Update, Tutorial и custom recipes с source, mic, camera,
  system audio, cursor, countdown, Quality и FPS.
- Quick clip: запись области, окна или экрана; Quality (720p/1080p/Original) и FPS (30/60) до
  записи; автосохранение MP4 в выбранную папку; карточка клипа с Copy link, Copy file, drag-out,
  Show in folder, Edit in Studio.
- Глобальный хоткей записи (старт и стоп), работа из трея, опциональный автозапуск.
- Studio: вкладка Frame — мокапы устройств с настоящими пропорциями экрана (phone, tablet, laptop;
  browser повторяет видео), быстрый aspect ratio, Scale, обрезка в пикселях исходника, фон;
  открытие любого видеофайла (кнопка, drag-and-drop, `⋯ → Edit a video file…` в HUD); дорожка
  клипа с разрезанием и удалением кусков; экспорт из одной кнопки Export (Save to computer /
  Publish & copy link). Подробности — D-016…D-022.

Non-goals:

- Authorization Code + PKCE;
- GIF-публикация (GIF можно сохранить локально);
- очередь, переживающая перезапуск приложения;
- несколько аккаунтов или облачных провайдеров;
- внешняя аналитика.

## 5. User journey and states

1. Пользователь один раз подключает Яндекс Диск в HUD.
2. Выбирает Recording Recipe или вручную настраивает source/devices. Custom recipe восстанавливает
   доступный source, mic, camera, system audio, cursor, countdown и export defaults.
3. Записывает и нажимает Stop.
4. Видит подтверждение «Запись сохранена локально» и вводит название.
5. Выбирает Quality/FPS и действие:
   - **Save Anywhere**: выбирает путь; hidden editor собирает MP4; уведомление открывает файл;
   - **Publish & Get Link**: hidden editor собирает MP4; main process загружает файл, публикует
     отдельный resource и копирует ссылку; системное уведомление открывает видео;
   - **Edit in Studio**: редактирует и выбирает **Publish** или **Save Local**.
6. При ошибке export/upload локальный source остаётся доступен.

Состояния: локальный draft, Yandex disconnected, background export, uploading, verified success,
auth/quota/network error, local cleanup pending/deleted.

## 6. Functional requirements

- FR-1: Stop никогда сам не запускает сетевой запрос.
- FR-2: renderer никогда не получает сохранённый OAuth-токен обратно.
- FR-3: publish IPC принимает только export внутри каталога записей OpenScreen.
- FR-4: удалённый путь всегда остаётся внутри `disk:/OpenScreen Exports`.
- FR-5: webcam и визуальные слои входят в публикуемый MP4.
- FR-6: локальная очистка выполняется только после server-side size verification.
- FR-7: при активном редакторе очистка откладывается до выхода.
- FR-8: повторная публикация с тем же названием идемпотентна (`overwrite=true`).
- FR-9: success toast и native notification дают действие «Открыть».
- FR-10: built-in recipe не фиксирует конкретные hardware device IDs и применим на другом устройстве.
- FR-11: custom recipe сохраняет конкретные device/source IDs, но отсутствующий source не заменяется
  первым найденным окном.
- FR-12: Quality/FPS активного setup копируются в completed draft и становятся defaults post-recording
  launcher.
- FR-13: quick clip сохраняется в папку пользователя без сетевых запросов; публикация — отдельное
  явное действие и никогда не удаляет файл из этой папки.
- FR-14: если быстрый путь сохранения не сработал, сырая запись остаётся и открывается панель draft.
- FR-15: хоткей записи, занятый системой или другим приложением, заменяется следующим свободным
  из списка; активное сочетание показывается в HUD и в меню трея.

## 7. Non-functional requirements

- без новых runtime-зависимостей;
- TypeScript strict-safe;
- токен не логируется и не хранится в `localStorage`;
- recipe state хранится отдельно от secrets в versioned localStorage и безопасно игнорирует
  повреждённые данные;
- upload не буферизует весь файл в RAM;
- native recorder contracts не меняются;
- background editor не появляется в taskbar и после постановки upload возвращает приложение в
  скрытый HUD;
- приложение и дочерние Windows-процессы брендированы как `OpenScreen`.

## 8. Release and acceptance

Пилот выпускается из `creator-edition`. Перед релизом:

- typecheck, unit tests, lint, i18n check и Windows build проходят;
- `npx playwright test tests/e2e/quick-clip.spec.ts` проходит на Windows (область → запись →
  обрезанный клип, копирование без перекодирования, трей, передача в Studio);
- выполнен smoke-test `record → name → editor → Save Local`;
- выполнен smoke-test `record + webcam → Publish → notification → Yandex folder`;
- проверены invalid token и offline error;
- установщик обновляет предыдущую сборку, а процессы/shortcut показывают имя и иконку OpenScreen.
