# ListIt

A desktop app to manage your anime, series and movie watchlist — built with Electron and SQLite.

> Personal and offline-first. No tracking, no accounts of ours — and no credentials
> in this repository. Cloud sync is optional, off by default, and runs entirely on a
> Firebase project you own.

---

## Features

- **Grid view** with poster art, progress bars and status color-coding
- **Detailed panel** — episodes, seasons/deliveries, tags, descriptions
- **Smart +1 ep button** — auto-increments the in-progress season when content has multiple seasons
- **Tag system** — built-in (anime, serie, pelicula) + custom tags, with full management UI
- **Alternative names** — search by Japanese/English title or synonyms
- **MyAnimeList import** — search via the official MAL API (Jikan as automatic fallback), auto-fills title, description, episode count and image
- **Add seasons from MAL** — search and attach new seasons to an existing series, without duplicate entries
- **Optional cloud sync** — keep your library in step across computers using your own Firebase project
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
├── lib/                 Main-process modules (never loaded by the renderer)
│   ├── backup.js        Daily DB backup + manual export
│   ├── logger.js        File logger (%APPDATA%/listit/listit.log)
│   ├── credenciales.js  Encrypted local credential store (safeStorage)
│   ├── mal-oficial.js   Official MyAnimeList v2 client
│   ├── mal-adaptador.js Official MAL response → Jikan v4 shape (pure)
│   ├── proveedor-mal.js Official API with Jikan fallback
│   ├── snapshot.js      Library snapshot: build, validate, hash, compress (pure)
│   └── firestore-sync.js  Optional Firestore upload/download
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
└── tests/               Vitest unit tests
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

## Configuration

Nothing here ships with the app. Both integrations are supplied by you at runtime
and stored **only on your machine**, encrypted with Electron's `safeStorage`
(DPAPI on Windows) in `%APPDATA%\ListIt\credenciales.json`.

They deliberately live outside the SQLite database, because `exportarBd` and the
daily backup copy the whole `.db` file — anything kept in the `settings` table
would end up inside every backup and every exported copy you share.

### MyAnimeList (required for search)

1. Sign in at [myanimelist.net/apiconfig](https://myanimelist.net/apiconfig) → **Create ID**
2. App type `web`; redirect URL can be `http://localhost/` (unused — this app does
   not use the OAuth user flow)
3. Copy the **Client ID**. The **Client Secret is not needed** and is never requested
4. In ListIt: **Settings → MyAnimeList**, paste it, press *Comprobar y guardar*

Without a Client ID the app falls back to the unofficial [Jikan](https://jikan.moe)
API, whose search endpoint has been returning `504` since July 2026
([jikan-rest#610](https://github.com/jikan-me/jikan-rest/issues/610)).

### Cloud sync (optional, off by default)

Syncs your whole library between computers through **your own** Firebase project.

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com)
2. **Authentication** → enable the **Email/Password** provider → add a user
3. **Firestore Database** → create one
4. **Project settings** → *Your apps* → add a **Web app** → copy the `firebaseConfig` block
5. **Firestore → Rules**, paste this so each account can only reach its own data:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /usuarios/{uid}/{documento=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

6. In ListIt: **Settings → Sincronización**, paste the config block plus the email
   and password of the user from step 2, and press *Activar sincronización*

**How it works.** The whole library is serialised, gzipped and stored as a single
document at `usuarios/{uid}/listit/snapshot`. A ~300-entry library compresses to
roughly 170 KB, comfortably under Firestore's 1 MiB per-document limit; the app
refuses to upload if it ever would not fit.

**Last writer wins**, so the safeguards matter:

- Uploading warns if the cloud copy changed since your last sync
- Downloading warns if this computer has changes you never uploaded
- A local backup is always written to `backups/listit-pre-sync-*.db` before the
  library is replaced
- The `settings` table is **not** synced — it mixes local preferences with
  migration markers that describe this installation only

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
