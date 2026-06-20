# ListIt

A desktop app to manage your anime, series and movie watchlist — built with Electron and SQLite.

> Personal and offline-first. No accounts, no cloud, no tracking.

---

## Features

- **Grid view** with poster art, progress bars and status color-coding
- **Detailed panel** — episodes, seasons/deliveries, tags, descriptions
- **Smart +1 ep button** — auto-increments the in-progress season when content has multiple seasons
- **Tag system** — built-in (anime, serie, pelicula) + custom tags, with full management UI
- **Alternative names** — search by Japanese/English title or synonyms
- **MyAnimeList import** — search via Jikan API, auto-fills title, description, episode count and image
- **Add seasons from MAL** — search and attach new seasons to an existing series, without duplicate entries
- **Resizable detail panel** — drag the panel edge to widen it; the width is remembered
- **Dashboard** — KPIs (total entries, estimated hours), status donut chart, tag bars, activity timeline
- **Activity log** — tracks created, status changes and season completions
- **Settings** — default tag, dark/light theme
- **Keyboard shortcuts** — `Ctrl+N` new, `Ctrl+F` search, `Ctrl+,` settings, `Ctrl+Z` undo, `?` shortcuts, `Esc` close
- **Auto-backup** — daily SQLite copy in `%APPDATA%/listit/backups/` (keeps last 10)

---

## Tech stack

| Layer | Technology |
|---|---|
| Desktop shell | [Electron](https://electronjs.org) 35 |
| Database | [SQLite](https://sqlite.org) via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) |
| Frontend | Vanilla JS (ES modules), CSS variables, Canvas API |
| Build | [electron-builder](https://www.electron.build) — NSIS (Windows), DMG (macOS), AppImage (Linux) |
| Tests | [Vitest](https://vitest.dev) + happy-dom |

---

## Project structure

```
ListIt/
├── main.js              Electron main process + IPC handlers
├── preload.js           Context bridge (window.api)
├── db.js                SQLite layer — all queries, migrations, transactions
├── lib/
│   ├── backup.js        Daily DB backup + manual export
│   └── logger.js        File logger (%APPDATA%/listit/listit.log)
├── src/
│   ├── index.html       App shell (markup only)
│   ├── styles/
│   │   ├── base.css     CSS variables, reset, theme (dark/light)
│   │   ├── layout.css   Header, sidebar, main area, detail panel
│   │   └── components.css  All UI components
│   └── js/
│       ├── state.js     Single shared state object
│       ├── api.js       Re-export of window.api
│       ├── main.js      Listeners, keyboard shortcuts, app init
│       ├── lib/         Pure utilities (colors, image, search, escape, mal)
│       └── ui/          UI modules (grid, detail, modal, add-season, dashboard, tags, settings…)
├── scripts/
│   ├── seed-sample.js   Insert sample data for testing
│   └── generate-icons.js  Generate .ico/.icns/.png from source PNG
└── tests/               Vitest unit tests (15 tests, 3 files)
```

---

## Getting started

```bash
# Install dependencies
npm install

# Run in development
npm start

# Run tests
npm test

# Build installer
npm run dist          # → dist/ListIt Setup 1.0.0.exe

# Insert sample data (close the app first)
npm run seed

# Generate app icons (needs src/img/icono-source.png ≥ 1024×1024)
npm run icons
```

---

## Data storage

All data is stored locally in SQLite (`%APPDATA%\listit\listit.db` on Windows).  
A daily backup is created automatically at `%APPDATA%\listit\backups\listit-YYYY-MM-DD.db`.  
You can also save a manual copy with the **Copia de seguridad** button.

### Database schema

| Table | Purpose |
|---|---|
| `contenido` | Main entries (title, status, episodes, image…) |
| `entregas` | Seasons / deliveries per entry |
| `tags` | Categories (anime, serie, pelicula + custom) |
| `contenido_tags` | Many-to-many content↔tags |
| `contenido_nombres` | Alternative search names |
| `actividad` | Event log (created, status change, season watched) |
| `settings` | User preferences (theme, default tag, default order) |

---

## License

ISC — Lino Soriano
