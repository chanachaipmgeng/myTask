# Man-day Scorecard

Local Angular + Syncfusion board that scores closed tickets in man-days, with separate development indexes for R&D and Implement. Sample people and tickets come from the 2568 team report. There is no myProject API and no salary page.

## Run

```bash
cd /agent/manday-scorecard
npm install
npm start
```

Open http://127.0.0.1:4200 . The board has the team dashboard, people, tickets, and a new-work queue.

Closed tickets can be imported from CSV or JSON on the tickets page. Sample files are at `/samples/closed-tickets.csv` and `/samples/closed-tickets.json`. The Sync button reads `/fixtures/myproject-tickets.json`, a local stand-in for myProject. It does not call an API host and does not write scores back.

Production build:

```bash
npm run build
```

`npm run verify` checks the scoring rules, including the Implement bug-fix at 100 and the R&D spike at 100.

Put `SYNCFUSION_LICENSE` in the gitignored `.env` file (see `.env.example`). `npm start` and `npm run build` read that value and register it. If it is unset, the Syncfusion trial banner stays.
