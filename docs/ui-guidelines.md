# UI guidelines for personal customizations

## Product feel

OpenScreen остаётся recorder-first инструментом: HUD должен помогать начать запись, а не становиться
панелью администрирования. Новые функции должны быть opt-in, спокойными и не менять основной путь
`source → record → stop → local draft → publish/editor`.

## HUD

- одна новая функция — одна понятная иконка;
- активное состояние: emerald; запись/опасное действие: red; временное внимание: amber;
- сложные настройки открываются в компактной панели, а не разворачивают основную строку;
- во время записи настройки, способные изменить pipeline, disabled;
- tooltip и `aria-label` обязательны;
- персональная сборка использует только horizontal HUD;
- после Stop основная строка заменяется карточкой локального draft с названием и двумя CTA;
- включённая камера всегда показывает live preview до записи;
- cursor tooltip описывает текущее состояние, а не только следующее действие переключателя.

## Feedback

- действие, которое длится больше 300 ms, показывает pending state;
- фоновые операции не блокируют редактор;
- success сообщает результат и место сохранения;
- error говорит, что произошло и какое действие исправит ситуацию;
- цвет не используется как единственный носитель статуса.

## Forms and secrets

- секрет показывается только как password input и очищается после сохранения;
- сохранённый секрет никогда не возвращается в renderer;
- destructive action (`Disconnect`, удаление очереди) визуально отделяется от primary CTA;
- настройки имеют безопасный default: off.

## Components and styling

- переиспользовать `Button`, `Tooltip` и существующие Tailwind-токены;
- не добавлять UI-библиотеку ради одной панели;
- сохранять текущие radius, translucent surfaces и spacing rhythm;
- не вводить magic colors, если существует семантический цвет состояния;
- персональная сборка фиксирована на русском; перед upstream PR восстанавливается полный i18n scope.

## Definition of Done

- keyboard/Escape/close path работают;
- long copy и error не ломают layout;
- loading, empty, success, failure и disconnected states покрыты;
- маленький экран не клипует draft card, webcam preview и Yandex panel;
- screen recorder продолжает работать при полном отказе интеграции.
