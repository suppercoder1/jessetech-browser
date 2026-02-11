# JesseTech Browser

A fast, lightweight desktop browser built with Electron, with **SearXNG** as the default search engine.

## Features

- Default search via `https://searxng.jessetech.nl`
- Tabbed browsing
- Private tab and private window modes
- Bookmarks, history, and downloads UI
- Find in page (`Cmd/Ctrl + F`)
- Keyboard shortcuts for common actions
- Dark mode, light mode, and system theme option
- Session restore and settings persistence
- Per-site permissions controls
- Security indicator (Lock / Warn / Unsafe)

## Tech Stack

- Electron
- JavaScript (Vanilla)
- electron-builder (macOS packaging)

## Getting Started

### 1. Install dependencies

```bash
npm install
2. Run in development
npm start
3. Build for macOS
npm run dist
Build outputs are generated in the dist/ folder.

Project Structure
app/
  index.html
  renderer.js
  main.js
  assets/
build/
dist/
package.json
Keyboard Shortcuts (macOS)
Cmd + L Focus address bar
Cmd + T New tab
Cmd + W Close tab
Cmd + R Reload
Cmd + F Find in page
Cmd + , Open settings
Cmd + Shift + T Reopen closed tab
Cmd + Plus / Minus / 0 Zoom in / out / reset
Notes
Private browsing data is isolated from normal history.
Build artifacts (dist/, build/) and dependencies (node_modules/) should not be committed to Git.
License
MIT (or your preferred license)

