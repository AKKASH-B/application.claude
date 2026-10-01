# Setup & publishing guide

Everything is free except the store developer accounts (Google Play: one-time US$25, Apple: US$99/year).

## 0. Install & check locally (Windows)
Double-click `setup.bat` (or run it in Command Prompt). It installs packages, aligns Expo versions,
type-checks, runs the tests and builds the web app. Logs go to `logs\`.

## 1. Database — MongoDB Atlas (free)
1. https://www.mongodb.com/cloud/atlas/register → create a **free M0** cluster (pick Mumbai/`ap-south-1` if available).
2. **Database Access** → add a user + password.
3. **Network Access** → add `0.0.0.0/0` (Vercel uses changing IPs; auth is by username/password).
4. **Connect → Drivers** → copy the `mongodb+srv://...` string. This is `MONGODB_URI`.

## 2. Backend + web — Vercel (free)
1. https://vercel.com → sign in with GitHub → **Add New → Project** → import this repository.
   If the repo contains other folders, set **Root Directory** to `kharcha`.
2. Leave build settings as they are (`vercel.json` sets them).
3. **Environment Variables** (Production + Preview):
   - `MONGODB_URI` = the Atlas string from step 1
   - `JWT_SECRET` = run `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - `DB_NAME` = `kharcha` (optional)
4. Deploy. Check `https://YOUR-APP.vercel.app/api/health` → `{"ok":true,...}`.
   The same URL is also the **web app**, and `/privacy` is your **privacy-policy URL** for the stores.

## 3. Point the mobile app at the backend
In `eas.json`, replace both `https://REPLACE-WITH-YOUR-VERCEL-URL` with your Vercel URL.
Edit `SUPPORT_EMAIL` in `src/config.ts` (shown in the privacy policy).

## 4. Build the apps (EAS, free tier)
```
npm install -g eas-cli
eas login
eas init            # links the project, fills extra.eas.projectId in app.json
eas build -p android --profile preview      # APK you can install on your phone to test
eas build -p android --profile production   # .aab for Google Play
eas build -p ios --profile production       # needs an Apple Developer account
```

## 5. Publish
**Google Play:** create a developer account → Play Console → Create app → upload the `.aab`
(or `eas submit -p android`) → fill the store listing from `STORE_LISTING.md` → Data safety → submit.
New personal accounts must run a **closed test with 12+ testers for 14 days** before production access.

**Apple App Store:** Apple Developer Program → App Store Connect → create the app (bundle id `com.akkash.kharcha`)
→ `eas submit -p ios` → add screenshots + privacy answers → submit for review.

## Notes
- Free-tier cold starts: the first request after idle can take 1–2 s.
- Atlas M0 + Vercel Hobby comfortably handle thousands of users for a personal-finance app.
- Hobby plan is for non-commercial use; move to Vercel Pro if you start charging.
