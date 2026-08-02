# PRD: OpenScreen Personal Creator Edition

- Статус: **READY WITH CONDITIONS**
- Владелец: Александр
- Дата: 1 августа 2026
- Текущий срез: локальный черновик → редактирование или ручная публикация в Яндекс Диск

## 1. Product direction

OpenScreen — персональная основа для быстрого производства продуктовых видео. Мы сохраняем
recorder-first flow и добавляем функции только там, где они сокращают путь
`идея → запись → готовый файл → публикация`.

После Stop приложение всегда сначала создаёт локальную запись. Пользователь задаёт название и
выбирает параметры Quality/FPS и один из трёх явных путей:

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
- creator-focused изменения живут в `creator-edition`, а `main` остаётся зеркалом upstream.

## 3. Goal and metrics

Focus outcome: от Stop до понятного решения о судьбе записи — один экран и не более одного клика
после ввода названия.

Метрики пилота:

- не менее 95% запущенных публикаций завершаются успешно;
- 0 публикаций без явного нажатия Publish/«Опубликовать»;
- 0 потерянных локальных записей при ошибке API или export;
- 0 локальных удалений без серверной проверки размера;
- webcam preview появляется до старта записи;
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

Non-goals:

- Authorization Code + PKCE;
- GIF-публикация (GIF можно сохранить локально);
- очередь, переживающая перезапуск приложения;
- несколько аккаунтов или облачных провайдеров;
- внешняя аналитика.

## 5. User journey and states

1. Пользователь один раз подключает Яндекс Диск в HUD.
2. Выбирает source, при необходимости включает webcam и видит preview.
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

## 7. Non-functional requirements

- без новых runtime-зависимостей;
- TypeScript strict-safe;
- токен не логируется и не хранится в `localStorage`;
- upload не буферизует весь файл в RAM;
- native recorder contracts не меняются;
- background editor не появляется в taskbar и после постановки upload возвращает приложение в
  скрытый HUD;
- приложение и дочерние Windows-процессы брендированы как `OpenScreen`.

## 8. Release and acceptance

Пилот выпускается из `creator-edition`. Перед релизом:

- typecheck, unit tests, lint, i18n check и Windows build проходят;
- выполнен smoke-test `record → name → editor → Save Local`;
- выполнен smoke-test `record + webcam → Publish → notification → Yandex folder`;
- проверены invalid token и offline error;
- установщик обновляет предыдущую сборку, а процессы/shortcut показывают имя и иконку OpenScreen.
