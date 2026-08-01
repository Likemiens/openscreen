# Обновление персонального форка

## Модель веток

- `upstream/main` — оригинальный `getopenscreen/openscreen`;
- `origin/main` — чистое зеркало upstream;
- `origin/custom` — персональная версия с интеграциями;
- `feat/*` — короткие ветки следующих функций от `custom`.

Remotes уже настроены:

```text
origin   https://github.com/Likemiens/openscreen.git
upstream https://github.com/getopenscreen/openscreen.git
```

## Обычное обновление

Сначала убедиться, что рабочее дерево чистое и тесты текущей версии проходят.

```bash
git fetch upstream --prune
git switch main
git merge --ff-only upstream/main
git push origin main

git switch custom
git merge main
npx tsc --noEmit
npm run test
git push origin custom
```

`--ff-only` намеренно останавливает процесс, если `origin/main` случайно получил персональный commit.
Не исправлять это force push без отдельного аудита истории.

## Где вероятны конфликты

Низкий риск:

- `electron/integrations/*`;
- `src/lib/yandexDisk.ts`;
- product docs.

Средний риск:

- `electron/preload.ts` и `electron/electron-env.d.ts` — IPC surface;
- `electron/main.ts` — регистрация handlers;
- `src/App.tsx` — глобальные уведомления.

Повышенный риск:

- `src/hooks/useScreenRecorder.ts`;
- `src/components/launch/LaunchWindow.tsx`.

При конфликте сначала сохранить новый upstream flow, затем заново подключить маленький вызов
интеграции после того места, где сформирован `RecordingSession`.

## Проверка после обновления

```bash
npx tsc --noEmit
npm run test
npm run build-vite
```

Затем manual Windows smoke:

1. запись без Яндекс Диска;
2. запись с включённой загрузкой;
3. запись offline;
4. restart приложения и повторная запись;
5. проверка, что локальный файл и editor доступны во всех случаях.
