# Kharcha — spend tracker (Expo + Vercel + MongoDB Atlas)

One codebase → **Android, iOS and Web**, with a free backend and database.

| Layer     | Tech                                   | Cost                |
|-----------|----------------------------------------|---------------------|
| App + web | Expo (React Native, Expo Router)       | Free                |
| Backend   | Vercel serverless function (`api/`)    | Free (Hobby)        |
| Database  | MongoDB Atlas M0                       | Free (512 MB)       |
| Builds    | EAS Build (Expo)                       | Free tier (queued)  |

## Features
- Email + password accounts (bcrypt, JWT, lockout after 5 bad attempts), **recovery key** for password reset (no email service needed), sign out of all devices, **delete account** (store requirement)
- Spent / Received / Saved transactions, safe calculator in the amount box (`120+45×2`), search & filters, calendar view
- **Safe to spend today**, projected month-end spend, no-spend streak, month-vs-month comparison, category donut, daily bars, highlights
- Monthly category **budgets** with warnings, **savings goals** with "save ₹X/month" nudges
- **Recurring** transactions (rent, salary, SIPs) auto-added
- **Split bills** with friends and settle-up tracking
- CSV export, 9 currencies (Indian digit grouping for ₹), dark mode

## Layout
```
api/[...path].ts   single Vercel function -> server/router.ts
server/            routes (auth, transactions, summary, plan), Mongo, validation
app/               screens (Expo Router)
src/               api client, auth, theme, UI components
```

## Run it
See **SETUP.md** (10 minutes: Atlas → Vercel → EAS → stores).
