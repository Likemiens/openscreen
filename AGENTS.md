# AGENTS.md

OpenScreen is a free, open-source screen recorder and video editor (Electron + React + TypeScript + Pixi.js) maintained as a continuation of the original v1.5.0 release. This file is the canonical guide for any AI coding agent working in this repo.

## Setup commands

- Install deps: `npm install` (Node 22.22.1, npm 10.9.4 — see `package.json#engines`)
- Start dev:    `npm run dev` (Vite dev server; Electron window opens via `vite-plugin-electron`)
- Build:        `npm run build` (TypeScript check + Vite build + electron-builder)
- Typecheck:    `npx tsc --noEmit` (CI runs this; no standalone script)
- Test (unit):  `npm run test` (Vitest, jsdom env)
- Test (browser): `npm run test:browser` (Vitest + Playwright, requires `npm run test:browser:install` first)
- Test (e2e):   `npm run test:e2e` (Playwright)
- Lint:         `npm run lint` (Biome 2.4)
- Format:       `npm run format` (Biome, tabs, double quotes, 100-col)
- i18n check:   `npm run i18n:check` (validates the 13 locale files)

## Project layout

- `src/` — React app: UI, editor components, timeline, i18n, captioning/cursor/exporter libs
- `src/lib/deviceFrame.ts` — device mockup geometry and fixed screen proportions, shared by the preview (`videoPlayback/layoutUtils.ts`) and the exporter (`exporter/frameRenderer.ts`); change the frame there, never in one renderer only
- `src/components/video-editor/timeline/clipPieces.ts` + `ClipTrack.tsx` — the clip row: the video as pieces; a removed piece is a `TrimRegion`, split points are `clipSplits` in editor state
- `src/components/video-editor/studioControls.tsx` — the Studio inspector's building blocks (section, segmented, slider row, select, number field, toggle); `FramePanel.tsx` is the reference use
- `src/lib/captioning/` — transcription (Whisper via transformers.js in a worker) and the `.txt`/`.srt` writers; the models are not bundled: `electron/ipc/speechModels.ts` downloads them on first use into `<userData>/speech-models` and serves them, and the ONNX runtime, over `openscreen-asr://` (decision D-025). In a headless check, copy a filled `speech-models` folder into the temp profile to skip the download
- Packaging ships no `node_modules` (`"!node_modules"` in `electron-builder.json5`): main and preload are bundled by Vite. A dependency the main process must load from `node_modules` at runtime (a native module) has to be added back to `files`
- `electron/` — main process, IPC, recording orchestration
- `electron/native/` — **native** capture helpers: `screencapturekit/` (Swift, macOS) and `wgc-capture/` (C++/Win32, Windows). These are built and shipped with the app, not loaded from npm
- `docs/` — architecture, engineering roadmaps, testing guides
- `tests/` — Playwright e2e specs + fixtures
- `scripts/` — native build scripts, diagnostic tools
- `nix/`, `flake.nix` — Linux packaging
- `release/`, `dist-electron/` — build artifacts (gitignored)

## Code style

- TypeScript strict mode (`tsconfig.json`). No `any` (Biome `noExplicitAny` is `warn` — don't add new `any`).
- Biome handles lint AND format. Tabs, double quotes, 100-col width, LF line endings. Run `npm run lint:fix` before committing.
- React functional components only. Hooks at top level (Biome `useHookAtTopLevel` is `error`).
- Imports: use the `useImportType` discipline (Biome organizes them).
- Husky + lint-staged runs Biome on staged `*.{ts,tsx,js,jsx,mts,cts,json}`.
- The repo is pre-1.x and not production-grade — rough edges are expected, but new code should be clean.

## Testing instructions

- Unit tests live next to source as `*.test.ts` / `*.test.tsx` (Vitest, jsdom).
- Browser tests use `vitest.browser.config.ts` (Playwright headless) — only run when DOM/Pixi rendering matters.
- E2E tests are in `tests/e2e/` (Playwright). Some specs are platform-specific (e.g. `windows-native-checklist.spec.ts`).
- `tests/e2e/quick-clip.spec.ts` drives the **real** recorder on Windows without computer-use: it launches the built app (`npm run build-vite` first), picks an area in the overlay, records a few seconds of the actual screen with the native helper, and checks the saved MP4 (size, codec, crop), the tray/idle behaviour and the Studio hand-off. It launches the repo root, not `dist-electron/main.js`, so the helpers under `electron/native/bin/` resolve. Set `OPENSCREEN_E2E_SCREENSHOTS=<dir>` to keep screenshots of the app's own windows.
- Add a test for every new behavior in the same package as the code under test.
- All tests must pass before opening a PR. CI runs `npm run test` and `npm run test:browser` on every PR.

## Headless Studio checks (no windows on screen)

For editor-only changes you do not need the desktop: `HEADLESS=true` keeps every window hidden, and together with `--user-data-dir=<temp folder>` it also skips the tray icon, the global hotkeys and the machine-wide single-instance lock — so Playwright's `_electron` can drive Studio while someone is using the machine, even with an installed OpenScreen running beside it. Always pass a temporary `--user-data-dir`: without it the run takes the lock (and silently quits if OpenScreen is open) and works in the real profile. `tests/e2e/studio-frame.spec.ts` is the pattern (and `tests/e2e/gif-export.spec.ts` upstream): copy a fixture into `<userData>/recordings`, call `setCurrentVideoPath` + `switchToEditor` from the HUD page, then work in the editor page.

- **Reload the editor page before exporting.** Under Playwright the debugger creates a script context for the window's initial `about:blank`; the editor window has `webSecurity: false`, so that context is reused for the app page and it lacks the secure-context WebCodecs classes (`VideoEncoder is not defined`). `await editor.reload()` gives a proper context. This only happens under the test driver, not in a normal launch.
- Native dialogs block a hidden window: replace `pick-export-save-path` with `ipcMain.handle` and `dialog.showOpenDialog` from `app.evaluate` rather than opening them.
- A hidden window only paints when asked: take two or three throwaway `page.screenshot()` calls before the one you keep, or the WebGL preview may be a frame behind.
- Quit with `app.exit(0)`; `app.quit()` is vetoed by the unsaved-changes prompt and leaves the single-instance lock held.
- Studio's export lives in the title-bar **Export** menu (`ExportMenu.tsx`): `testId-export-panel-button` opens it, `testId-mp4-format-button` / `testId-gif-format-button` pick the format, `testId-export-button` is **Save to computer…**, `studio-export-publish` / `studio-export-connect-yandex` are the Yandex Disk actions. Stub `get-yandex-disk-settings` and `upload-recording-to-yandex-disk` to exercise Publish without an account.
- The timeline lays itself out against the video's duration, which a WebM reports late: wait for the duration label before clicking positions on the clip row (`[data-timeline-row="clip"]`, pieces are `clip-piece`, actions `clip-split-button` / `clip-remove-button` / `clip-restore-button`).
- The editor always has two Pixi applications alive during an export (preview + export renderer). Destroy a Pixi app only through `destroyPixiApp` (`src/lib/pixiDestroy.ts`); `app.destroy(true)` releases Pixi's global pools and kills the other one.

## Desktop E2E testing with computer-use

Unit/browser tests can't exercise real capture (native screen recording, a physical webcam, the tray). To verify a recording/editor feature end to end, drive the actual Electron app with the **computer-use** MCP (screenshot + click/type on the desktop). This is the required "manual smoke test on real Windows/macOS" for native changes.

**Launch the app**

- Normal: `npm run dev` — Vite serves the renderer and `vite-plugin-electron` opens the Electron window. The main process logs `Global shortcut registered: CommandOrControl+Shift+O` (shows the HUD) and `Record shortcut registered: <accelerator>` (starts/stops a capture) when ready. The record shortcut is the first free one of Win+Shift+R, Ctrl+Alt+R, Win+Shift+X, Ctrl+Shift+Space, or the user's own from `app-settings.json`.
- The app is **tray-resident** on Windows/macOS: closing the HUD hides it, and a HUD hidden for 60 s (`OPENSCREEN_HUD_IDLE_RELEASE_MS` overrides) is destroyed and rebuilt on demand from persisted settings. With no window the process is still alive — quit from the tray menu or HUD **⋯ → Quit OpenScreen**. `--hidden` starts straight into the tray (used by Launch at login).
- The app is single-instance: a lock dir at `%TEMP%/openscreen-single-instance-<user>.lock` (macOS: `$TMPDIR`). If a stale Electron process holds it, a new launch quits silently (exit 0, no window). Kill leftover `electron` processes and delete that lock dir before relaunching.
- **From a git worktree** (no `node_modules`/native binaries): junction/symlink `node_modules` from the main checkout (deps are usually identical — check `package-lock.json`), and copy the prebuilt native capture binaries from `electron/native/bin/<platform>/` (gitignored — rebuilding needs the full VS/Xcode toolchain). Then `npm run dev` works normally.

**Granting access**

- `request_access` resolves names against installed apps. A **dev build runs as `electron.exe`** (or `Electron.app`), *not* the installed `Openscreen` — grant **`electron.exe`** or the dev window stays masked in screenshots. Non-allowlisted windows are masked (solid rectangles); the screenshot note lists their process names to add.

**The HUD widget** (recording controller)

- Frameless, transparent, always-on-top, `skipTaskbar`, centered at the **bottom of the primary display** (`createHudOverlayWindow`, 600×160). It is **click-through** (`setIgnoreMouseEvents(true, { forward: true })`): moving the real cursor over an interactive control makes that region clickable and shows its tooltip, so `mouse_move` → screenshot → `left_click` works; a blind click on empty HUD area passes through to the desktop.
- Control row (left→right): drag handle, **capture mode** segmented control (`Area` / `Window` / `Screen`; the selected one shows its target, and clicking any of them opens its picker), system-audio toggle, mic toggle, **camera toggle**, **format** chip (`1080p · 60` → quality, frame rate, countdown, cursor mode), **Record**, **⋯** (save folder, record shortcut, launch at login, Yandex Disk, presets, Open Studio, Quit), **×** (hide to tray). Record is never disabled: with no target it opens the matching picker and records once a target is chosen. In `Area` mode it always goes through the area picker, which offers the previous area.
- Everything above the bar (panels, the mic/camera tray, the finished-clip card, notices) lives in one bottom-anchored stack (`data-hud-stack`); the window is resized to fit that stack. Styles are in `src/components/launch/hud.module.css`.
- **Area picker**: a full-display transparent overlay window (`windowType=region-selector`). Drag to select, then **Record** (Enter), **Done** (keep the area without recording) or **Cancel** (Esc). While an area records, a click-through outline window (`region-frame`) sits just outside it.
- **Two finish paths.** A recording with the system cursor and no camera track is a *quick clip*: it is saved to the clips folder right after Stop (copied as-is, or cropped/scaled by `src/lib/quickClipRunner.ts`) and shown as a card. An editable cursor or a camera track keeps the Studio draft panel (**Save anywhere** / **Edit in Studio** / **Publish & get link**).

**The tray icon** (bottom-right notification area)

- Because the HUD skips the taskbar and can be minimized/hidden, the **system-tray icon is the reliable way to refocus the app**: **left-click or double-click reopens/focuses the HUD** (`showMainWindow`). Its icon swaps to a red dot while recording.
- **Right-click → context menu**: *Record Area…* / *Open* / *Quit* when idle, or ***Stop Recording*** while recording (mirrors the HUD's stop). Tooltip shows `OpenScreen — <shortcut> to record` or `Recording: <source>`. Use this to stop a recording if the HUD isn't reachable.

**End-to-end flow (record → edit)**

1. On the HUD: pick **Window** or **Screen** (the picker opens → select a thumbnail → **Share**; a single display is selected without the picker), then click the **camera** toggle to enable the camera. (The camera is unavailable in `Area` mode.)
2. Click **Record**; the HUD shrinks to a timer with pause/restart/delete and a red **Stop** (a countdown overlay shows first if one is set in the format panel).
3. Stop via the HUD's red button (or tray → *Stop Recording*, or the record shortcut). Because there is a camera track, the draft panel appears above the bar: click **Edit in Studio** and the **editor window opens** with the screen recording and the webcam PiP. (Without camera and with the cursor "In video", Stop saves a clip instead and shows the clip card.)
4. Exercise the feature in the editor (e.g. Full Camera: press **C** to add a segment on the timeline, scrub to see the webcam grow to fullscreen and ease back; **Ctrl+Z** / **Ctrl+Shift+Z** undo/redo).
5. Capture a screenshot as proof. Clean up: stop `npm run dev`, remove temporary worktree junctions/lock.

## PR & commit conventions

- Branch from `main`; never push to it directly.
- Commit messages: short imperative summary, optional body. Recent style mixes conventional-ish prefixes (`ci:`, `chore:`, `fix:`) with plain messages — either is fine, just be consistent within a PR.
- **PR titles must follow Conventional Commits** (`feat:`, `fix:`, `chore:`, `refactor:`, `perf:`, `docs:`, `test:`, `build:`, `ci:`, `style:`, `revert:`). Enforced by the `semantic-pr` job in `ci.yml`. This feeds GitHub's auto-generated release notes with clean categories.
- Open PR via `gh pr create` once CI is green.
- PR template is in `.github/pull_request_template.md`.

## Release flow

Two `workflow_dispatch` workflows cut a release with a pre-release candidate (RC) first, then promote to stable. Trunk-based, no extra branch. Full operational guide in `.harness/docs/git-workflow.md` § Release flow.

- **Cut RC**: Actions → "Cut a release candidate" → Run workflow. Inputs: `bump` (patch|minor|major), `rc_number` (default 1), optional `target_version` override. Snaps issues out of the rolling `Next Release` milestone into a versioned `vX.Y.Z` milestone, bumps `package.json`, pushes the `vX.Y.Z-rc.N` tag, which triggers the existing `build.yml` to publish a GitHub pre-release. Notarization is skipped on RCs. Notifies `#rc-testing` on Discord.
- **Promote RC**: Actions → "Promote RC to stable release" → Run workflow. Input: `rc_tag` (e.g. `v1.5.0-rc.2`), optional `release_notes_extra`. Closes the `vX.Y.Z` milestone, strips `-rc.N` from `package.json`, pushes `vX.Y.Z` tag, which triggers `build.yml` to publish a stable release (full notarization, Tier 3 homebrew/winget/nix/aur fires). Notifies `#announcements` on Discord.
- **Manual fallback**: `git tag vX.Y.Z-rc.N <sha> && git push origin vX.Y.Z-rc.N` does the same as Cut RC (minus the milestone migration and Discord announce) — useful for emergency cuts.

Both workflows require the `OPENSCREEN_RELEASE_TOKEN` secret (a fine-grained PAT with `contents: write` + `issues: write`). This is the standard fix for `release: published` not triggering downstream workflows when the release is created by `GITHUB_TOKEN`. See `docs/secrets.md`.

**Release branches freeze the build between cut and promote.** Every RC cut creates `release/vX.Y.Z-rc.N`. The branch is *not* merged into `main` until the stable tag is published; only cherry-picks of bugfixes land on the release branch during the RC window. The stable tag points at the branch tip (RC + cherry-picks), then `promote.yml` opens a `release/vX.Y.Z-sync → main` PR to bring main into line. This contract exists because of the v1.6.0 incident (2026-07-05) where the original promote workflow tagged `main` instead of the RC snapshot, causing 23 unreleased commits to ship in `v1.6.0`. Full rules in `.harness/docs/git-workflow.md` § Release branches.

## Security

- Never commit secrets. `.env.example` exists; real `.env` is gitignored.
- `macos.entitlements` controls macOS permissions — review when touching native recorder.
- Native helpers run with elevated privileges on user systems; treat code in `electron/*-helper/` as security-sensitive.

## Specialized notes

- **Native capture is platform-fragile**: macOS uses ScreenCaptureKit (Swift), Windows uses WGC (C++/Win32). CI runs on Linux only — manual smoke test on real macOS/Windows is required for native changes.
- **Pixi.js v8** is the rendering engine. Filters come from `pixi-filters` and `@pixi/filter-drop-shadow`. GSAP + `motion` for animation.
- **i18n**: 13 locales in `src/i18n/locales/<locale>/` (e.g. `src/i18n/locales/en/settings.json`). The `i18n:check` script validates them — run it after touching translation files.
- **Build pipeline**: `npm run build` is full electron-builder. For iterating on renderer only, use `npm run build-vite` (Vite + tsc, no packaging).
- **README tone**: the project is explicitly "not production-grade" and free forever — don't add paywalls, premium tiers, or upsell language to UI/copy.
