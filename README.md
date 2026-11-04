<p align="center">
  <img src="https://marquee-five-sigma.vercel.app/og.png" alt="Marquee. Draw a box. Hit record. Send the clip. A free, open source screen recorder for Windows, macOS and Linux" width="820" />
</p>

# Marquee

A free, open source screen recorder for Windows, macOS and Linux: draw a box, record, and send the clip the moment you stop. Studio is there when a video needs polish.

**Stage:** in progress · **Timeline:** since 1 August 2026, ongoing · **Customer:** internal · **Updated:** 4 November 2026

[Website](https://marquee-five-sigma.vercel.app) · [Download](https://github.com/Likemiens/openscreen/releases/latest) · [User guide](docs/guide.md) · [Brand assets](https://marquee-five-sigma.vercel.app/brand) · [Code](https://github.com/Likemiens/openscreen)

> [!NOTE]
> Marquee is the new name of **OpenScreen Creator Edition**, chosen on 4 November 2026. Until the rename lands, the app, its installers and its folders still say OpenScreen.

## About

Marquee is for people who need to show something on their screen: it records a short clip of part of the screen, saves it, and lets you send it, with no settings screen between the hotkey and the file. Longer recordings open in Studio for framing, cutting and export. It is a fork of OpenScreen, created by [Siddharth Vaddem](https://github.com/siddharthvaddem), archived after v1.5.0 and continued at [getopenscreen/openscreen](https://github.com/getopenscreen/openscreen) with the original author's approval; [@Likemiens](https://github.com/Likemiens) has developed this fork since 1 August 2026. It is not production-grade software: expect bugs, rough edges and occasional breaking changes.

**In scope:** area, window and screen recording, Studio, on-device transcripts, share links through Yandex Disk, the website. **Out of scope:** paid tiers or features behind a paywall (it is MIT-licensed and free for personal and commercial use), code-signed installers, a Nix package for this fork, analytics in the app or on the website.

## Now

- **Done:** OpenScreen Creator Edition 1.9.0 shipped on 26 October 2026 for Windows, macOS and Linux. The Marquee website, logo and brand page went live on 4 November 2026.
- **Next:** release 1.10.0, prepared on the `feedback-fixes` branch (clips saved instantly on Windows, a timeline that closes the gap after a cut, steady system audio); rename the app to Marquee, in progress (a new app name moves the settings folder, so settings have to be carried over); merge the website into this repository ([#1](https://github.com/Likemiens/openscreen/pull/1)). No dates yet.

## Results

- **Shipped in 1.9.0:** quick clips (hotkey, area, MP4 in your folder), Studio (device mockups at real proportions, crop by the pixel, a clip track you cut into pieces, export from one button), transcripts as `.txt` and `.srt` made on your computer, and share links through Yandex Disk.
- **Measured:** the Windows installer went from 290 MB to about 157 MB in 1.9.0. Transcribing a 77-second meeting takes about 14 s on a mid-range GPU and about 31 s on the processor. In 1.10.0, saving a 1512×1080 clip takes about 0.6 s instead of about 2 s and no longer grows with the clip's length.

## Metrics

| Metric | Goal | Actual | Source |
| --- | --- | --- | --- |
| GitHub stars | not set | ![GitHub stars](https://img.shields.io/github/stars/Likemiens/openscreen?label=stars) | GitHub, live |
| Release downloads, all files | not set | ![Release downloads](https://img.shields.io/github/downloads/Likemiens/openscreen/total?label=downloads) | GitHub Releases, live |
| Yandex Disk publishes that succeed | 95% or more | not measured | [PRD](docs/prd.md) pilot target; the app has no analytics |
| Local recordings lost to an upload or export error | 0 | not measured | [PRD](docs/prd.md) pilot target |
| Website visitors | not set | not counted | the website sets no cookies and runs no analytics |

## How it works

| Step | You | Marquee |
| --- | --- | --- |
| 1 | Download the installer for your system from [Releases](https://github.com/Likemiens/openscreen/releases/latest) | The installers are not code-signed, so the first launch needs one extra step (below) |
| 2 | Press the record hotkey and drag out an area, or pick a window or the whole screen | Quality (720p, 1080p or Original) and frame rate (30 or 60) are set before you record |
| 3 | Press the hotkey again to stop | The MP4 is already in your folder; its card offers Copy file, Copy link (Yandex Disk), Show in folder, Transcribe, Edit in Studio, or dragging the clip into a chat |
| 4 | Open Studio when the video needs polish | Device frames, backgrounds, aspect ratio, crop, cuts, captions, and export to MP4 or GIF from one button |

Every option, with screenshots, is in the [user guide](docs/guide.md). Download only from this repository's [Releases](https://github.com/Likemiens/openscreen/releases): other websites using the OpenScreen name are not affiliated with it.

### Windows

Run `OpenScreen-Custom-<version>-Setup.exe`. If SmartScreen says "Windows protected your PC", click **More info → Run anyway**. The installer asks whether to add transcription (26 MB; the speech model downloads the first time you transcribe).

### macOS

Use `OpenScreen-Mac-arm64-<version>.dmg` on Apple Silicon (M1 and later) or `OpenScreen-Mac-x64-<version>.dmg` on Intel. If Gatekeeper blocks the app, run `xattr -rd com.apple.quarantine /Applications/OpenScreen.app` in Terminal, then allow Screen Recording and Accessibility in **System Settings → Privacy & Security**. Details and the fix for upgrade permission problems: [install guide](docs/guide.md#macos).

### Linux

Use the `.AppImage` (any distro), `.deb` (Debian, Ubuntu) or `.pacman` (Arch). Commands, the sandbox fix and what differs between systems are in the [install guide](docs/guide.md#linux).

## Materials

| What | Where |
| --- | --- |
| Website and brand assets | [marquee-five-sigma.vercel.app](https://marquee-five-sigma.vercel.app), [brand page](https://marquee-five-sigma.vercel.app/brand) |
| Downloads and release notes | [Releases](https://github.com/Likemiens/openscreen/releases), [docs/releases](docs/releases), [1-minute demo video](https://github.com/Likemiens/openscreen/releases/download/v1.9.0/OpenScreen-demo.mp4) |
| User guide | [docs/guide.md](docs/guide.md) |
| Product and decisions (in Russian) | [PRD](docs/prd.md), [decision log](docs/decisions.md), [fork roadmap](docs/customization-roadmap.md) |
| Upstream | [siddharthvaddem/openscreen](https://github.com/siddharthvaddem/openscreen) (original, archived), [getopenscreen/openscreen](https://github.com/getopenscreen/openscreen) (continuation), [upstream roadmap](ROADMAP.md) |
| Community | [OpenScreen Discord](https://discord.gg/VvT6Vtnyh), [upstream issues](https://github.com/getopenscreen/openscreen/issues) |
| License | [MIT](LICENSE): by using this software, you agree that the authors are not liable for any issues, damages, or claims arising from its use. Wallpapers 19–167 in `public/wallpapers` come from the [Super Visuals — Backgrounds Library](https://www.figma.com/design/rd1wo2a08HDyumdphnNiqC/Super-Visuals--Backgrounds-Library) on Figma and remain under that library's own terms, not the MIT License. |

## For new contributors

- **Who is who:** [@Likemiens](https://github.com/Likemiens) owns and maintains this fork: product, code and releases. Upstream OpenScreen and its community live at [getopenscreen/openscreen](https://github.com/getopenscreen/openscreen) and on Discord.
- **Where to start:** this README, then [AGENTS.md](AGENTS.md) for setup, checks and testing the recorder on real Windows and macOS, and [CONTRIBUTING.md](CONTRIBUTING.md). Forks and contributions are welcome: [fork it](https://github.com/Likemiens/openscreen/fork) and make it yours.
- **Agreements:** `creator-edition` is the default branch; `main` mirrors upstream and is merged into `creator-edition` ([how](docs/upstream-sync.md)). No paid tiers or upsells. Cloud integrations stay apart from the recorder, and a local recording is never deleted before its upload is verified ([decision log](docs/decisions.md), D-001 to D-003).

## Open questions

For [@Likemiens](https://github.com/Likemiens):

- When 1.10.0 and the first release under the Marquee name ship, and in which order.
- Whether the repository and the installer files take the Marquee name too.
- Whether to turn on Issues in this repository: they are off, while the website links to them.
- Goals for downloads and stars.

## For developers

Electron, React, TypeScript and Pixi.js, built with Vite; native capture helpers in Swift (macOS, ScreenCaptureKit) and C++ (Windows Graphics Capture). Node 22.22.1 and npm 10.9.4.

```bash
npm install
npm run dev          # recorder + Studio with hot reload
npm run test         # unit tests
npm run build:win    # Windows installer in release/<version>/
```

`npm run build:win` first compiles the native Windows capture helper, which needs Visual Studio Build Tools with the C++ workload. If the prebuilt helpers are already in `electron/native/bin/win32-x64/`, the installer can be packaged without that toolchain:

```bash
npx tsc && npx vite build && npx electron-builder --win --config.npmRebuild=false
```

`npx playwright test tests/e2e/quick-clip.spec.ts` drives the real app on Windows: it selects an area, records a few seconds of the screen, and checks the saved clip. Run `npm run build-vite` first. Lint, typecheck, browser and end-to-end tests, and notes for AI agents are in [AGENTS.md](AGENTS.md).

Secrets: the Yandex Disk token is entered in the app and stored encrypted with Electron `safeStorage`, never in the repository; release and CI secrets are listed in [docs/secrets.md](docs/secrets.md). The website is a static site in `site/`, deployed on Vercel; it arrives with [#1](https://github.com/Likemiens/openscreen/pull/1).
