# Tradezilla Journal

A trading journal for NQ / ES futures. Pure static React app — all data (trades and
screenshots) is stored in your browser via IndexedDB, so it runs anywhere static files
can be hosted, including GitHub Pages. No backend required.

## Requirements

Node.js 18 or newer (includes npm). Check with `node --version`.

## First-time setup

From this folder, run once:

```
npm run setup
```

## Run locally

```
npm run dev      # Vite dev server with hot reload
```

Or build and preview the production bundle:

```
npm run build
npm start        # serves the built app
```

## Deploy to GitHub Pages

1. Push this folder to a GitHub repository (branch `main`).
2. In the repo: Settings → Pages → Build and deployment → Source: **GitHub Actions**.
3. The included workflow (`.github/workflows/deploy.yml`) builds the client and
   deploys it on every push to `main`.

Your site will be at `https://<username>.github.io/<repo>/`.

## Features

- Log trades with date, time, symbol (NQ/ES quick-select plus free field), direction,
  entry/exit, contracts, stop loss, take profit, commissions, setup tag, session
  (London/NY/Asia) and notes. Result in points and dollars plus R multiple are computed
  automatically.
- Attach entry/exit chart screenshots per trade (stored in the browser).
- Edit and delete trades.
- Dashboard: total P&L, win rate, profit factor, average win/loss, largest win/loss,
  expectancy and an equity curve.
- Calendar with daily P&L colouring.
- Analysis broken down by symbol (NQ vs ES), setup, session and direction.
- Filters by symbol, date range, setup, session and direction.
- CSV export and import, plus full JSON backup and restore (backups include
  screenshot images).

## Point values

Dollar-per-point defaults are applied automatically: NQ = 20, ES = 50, MNQ = 2, MES = 5.
Any other symbol defaults to 1 and you can override the point value on any trade.

## Where your data lives — important

All data is stored **in your browser** (IndexedDB), per device and per browser.
That means:

- Clearing site data / browsing data for the site deletes your journal.
- Data does not sync between devices or browsers.
- Use the Data tab regularly to download a full JSON backup (it includes screenshots).
  Restore it on any device to move or recover your data.

## Migrating from the old server version

If you used the previous Express-based version, open the old app, download a JSON
backup from the Data tab, then use Restore in this version. Trades transfer fully;
screenshots from v1 backups are not included (they lived on the server) and will
need re-attaching.

## Try it with sample data

Open the Data tab and import `sample-trades.csv` to see the app populated, then delete
those trades or restore an empty backup when you want a clean journal.
