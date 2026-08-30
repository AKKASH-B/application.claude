# SpendPulse — Product Requirements

## Problem statement
Build a mobile app from the supplied Akash Spends concept, updated into a spending dashboard with charts, categories, and monthly summaries.

## Architecture
- Expo SDK 54 React Native frontend with Expo Router.
- FastAPI backend on port 8001 with MongoDB persistence.
- REST endpoints under `/api/transactions` for list, create, update, and delete.

## User personas
- Individuals who want a calm, quick view of monthly spending.
- Users who need lightweight category and cash-flow visibility without a full banking connection.

## Core requirements (static)
- Show running balance, income, spending, savings, and recent transactions.
- Support expense and income entry with category, amount, date, and optional note.
- Provide category bars, cash-flow comparison, analytics, and category views.
- Persist transactions in MongoDB and keep mobile controls touch-friendly.

## Implemented
- 2026-08-22: Replaced starter image screen with SpendPulse dashboard using the botanical palette and native navigation.
- 2026-08-22: Added Mongo-backed transaction CRUD APIs with valid calendar-date validation.
- 2026-08-22: Added overview, analytics, categories, monthly summary cards, empty states, and add-transaction bottom sheet.
- 2026-08-22: Verified API CRUD and Expo phone preview; added stable testIDs for key controls.
- 2026-08-22: Added email/password sign-up, login, secure session restore, logout revocation, and private per-user transaction queries.
- 2026-08-22: Added keyboard-aware transaction entry scrolling and authenticated regression coverage.
- 2026-08-22: Added monthly per-category budgets (`/api/budgets` GET/PUT/DELETE), progress bars with warning/over-budget colors, and a top-of-screen alert when spending exceeds any limit.
- 2026-08-22: Switched login to username-based auth (email still collected at signup for recovery). Added forgot-password + reset flow using Emergent-managed Resend to email a single-use 30-minute reset code. Existing users migrated automatically.
- 2026-08-22: Added long-press → Edit / Delete on any recent transaction row. Edit reuses the transaction editor (pre-filled, calls PUT). Delete opens a custom Confirm sheet (works on native + web preview) and calls DELETE. Forgot Password sheet now shows a spam-folder hint.
- 2026-08-22: Renamed transaction types to Transferred / Received (UI only; DB stays expense/income). Split categories per type: Transferred = Food/Transport/Bills/Rent/Shopping/Health/Travel/Other; Received = Salary/Interest/Trading/Other. Added month picker on Overview. Added Settings bottom sheet (avatar or bottom-nav) with Change Password, Export CSV, Log Out. Backend: POST /api/auth/change-password and GET /api/transactions/export?month=YYYY-MM.

## Prioritized backlog
- P0: None remaining for the current dashboard MVP.
- P1: Add edit/delete actions from the recent activity list; add month navigation.
- P2: Add exportable monthly reports, receipt attachments, password reset, and optional account sync.

## Next tasks
1. Add transaction edit and delete affordances.
2. Add historical month picker and budget progress per category.

## Changelog — 2026-08-23 (ported repo AkkashSaBa/Antrom into workspace)
- Add Transaction now has a third **Savings** tab alongside Transferred and Received, with its own categories (Emergency Fund, Goal, Investment, Retirement, Other) and gold styling.
- Savings is tracked separately and does **not** change the Total Balance (money set aside). The monthly summary "Savings" metric now reflects real savings entries.
- Total Balance = Received − Transferred. When Transferred exceeds Received the balance now shows a **minus sign in red** on the hero card.
- Backend: `Transaction.type` accepts `savings` in addition to `expense`/`income`.
- Env: added JWT_SECRET; EMERGENT_EMAIL_KEY left blank (forgot-password email out of scope — degrades gracefully).


## Changelog — 2026-08-23 (features)
- Fixed forgot-password: set the provisioned EMERGENT_EMAIL_KEY so reset codes actually send (email proxy returns 202). Verified 11/11.
- **Savings Goals**: new backend GET/PUT/DELETE /api/savings-goal (per-user target). Overview shows a circular progress ring (react-native-svg) of cumulative savings vs target, with set/edit/remove sheet. Ring turns green at 100%.
- **Low Balance Alert**: gentle warning card on Overview shown only when Total Balance is negative (transferred > received), explaining the shortfall.
- Verified end-to-end by testing agent (iteration 7): 11/11 backend + all frontend flows, no bugs.


## Changelog — 2026-08-23 (multi-goal savings)
- Reworked single savings goal into **multiple named goals**. Backend: /api/savings-goals CRUD (name, target, target_date, celebrated). Transactions gained optional goal_id; deleting a goal unassigns its savings transactions.
- **Multiple Goals**: Overview lists a card + progress ring per goal; Add Transaction Savings tab tags savings to a chosen goal (or General).
- **Monthly Save Nudge**: goals with a target date show "Save ₹X/mo to reach by <Mon YYYY>" (remaining ÷ months left).
- **Goal Celebration**: hitting a goal (saved ≥ target) fires a one-time confetti + badge modal (react-native-confetti-cannon); celebrated flag persisted server-side so it never repeats. Reached goals show a "Reached" badge.
- Verified by testing agent (iteration 8): 20/20 backend + all frontend flows, no blocking issues.


## Changelog — 2026-08-23 (data persistence / session bug)
- BUG: logout + quick re-login erased data. Root cause: JWT signed only {sub, iat, exp} at second precision → same-second re-login produced an identical token already on the revoked denylist → 401 "Session ended" → app couldn't load data.
- FIX: create_token now adds a unique jti (uuid4) per login, so every token is unique and re-login never collides with a revoked token. Data is keyed by stable user id and persists across unlimited logout/login cycles.
- Also hardened GET /api/savings-goals to tolerate legacy single-goal docs (defaults for name/celebrated/created_at) so it never 500s.
- No Apple Sign-In exists in the app (never implemented).
- Verified by testing agent (iteration 9): 6/6 backend + 5/5 frontend rapid logout/login cycles preserve data, no session errors.

3. Add optional statement import after the core manual workflow is reviewed.
## Changelog — 2026-06 (mobile OTP auth, calendar, calculator, split & admin bug fixes)
- AUTH REWORK: Switched from username/email to **mobile number + password** with a **demo OTP** step (integration_expert playbook followed). Signup collects name, mobile, password, confirm password, then send-otp (demo code returned in response + shown in on-screen banner) and verify. Login is mobile + password. Forgot-password now uses OTP-based reset (send-otp purpose=reset → reset-password). First user to sign up becomes admin. Backend: /api/auth/send-otp, updated /signup, /login, /reset-password; users keyed by normalized mobile with partial-unique index; hashed OTP challenges in otp_challenges with TTL.
- BUG FIX — Split add member: removed the Expo-Go/web-incompatible phonebook contacts tab; AddMemberSheet now has reliable Manual + Saved-friends tabs with inline errors.
- BUG FIX — Delete split: replaced Alert.alert confirm (callbacks don't fire on web) with an in-app confirm modal (confirm-delete-split). Delete now works on web + native and also removes the linked transaction. Delete is available for finalized splits too.
- BUG FIX — Admin delete user & delete transaction: replaced Alert.alert confirms with in-app confirm modals (confirm-delete-user, confirm-delete-admin-tx).
- FEATURE — Date-wise entries: Add/Edit transaction sheet now has a DATE field with a custom month-grid Calendar picker (src/components/Calendar.tsx). Entries save on the chosen date.
- FEATURE — Calendar tab: browse entries by date (dots mark days with entries), per-day summary + entry list.
- FEATURE — Calculator: built-in calculator popup (src/components/Calculator.tsx) launched from the amount field; evaluates expressions and fills the amount.
- FEATURE — Analytics month-vs-month comparison card (Transferred/Received/Savings vs previous month).
- Verified: backend 8/8 pytest (iter10) + frontend Playwright e2e; all three reported bugs confirmed fixed.

## Changelog — 2026-06 (auth reversal to username+email-verification, calculator & past-date fixes)
- BUG FIX — Calculator: root cause was opening the Calculator as a separate <Modal> while the Add-Transaction Modal was already open (nested modals fail on real Android devices; only worked on web preview). Refactored Calculator into an in-place absolute overlay rendered INSIDE the add-transaction modal. Rewrote calc logic (no setState-in-updater). Verified 150×2=300 applies to amount.
- BUG FIX — Previous-date entry: date picker was also a nested <Modal>; moved it to an in-place overlay inside the add-transaction modal (allowFuture too). After saving, the dashboard month auto-switches to the entry's month so past/future-dated entries are visible.
- AUTH REWORK (per user): reverted from mobile+OTP to **username + password** login. Signup collects username, phone, email, password, confirm password — NO OTP. Instead, EMAIL VERIFICATION via Emergent-managed Resend: account created unverified, 6-digit code emailed; login is BLOCKED (403 EMAIL_NOT_VERIFIED) until verified via /api/auth/verify-email. Added resend-verification, and email-code-based forgot/reset (/api/auth/forgot-password + /api/auth/reset-password by username+code).
- ADMIN: username `akkash_saba` (and phone 9597021231) always promoted to admin (ADMIN_USERNAMES/ADMIN_PHONES env). Pre-created verified admin akkash_saba/password123.
- Email integration: EMERGENT_EMAIL_KEY + EMAIL_FROM_NAME=SpendPulse in backend .env; guardrail gate + async send_email from playbook.
- Verified: backend 12/12 pytest (iter11) + full frontend Playwright e2e; both reported bugs fixed, auth gate + admin confirmed.

## Changelog — 2026-06 (verification badge, zero-balance fix, split contact import)
- FEATURE — Verified badge: dashboard header shows a Verified/Unverified pill (verified-badge / unverified-badge); admin user cards show per-user verified/unverified pill (admin-verify-<username>).
- BUG FIX — Zero/false-minus balance: total balance now uses an epsilon guard (|balance|<0.5 → 0) so an empty account shows ₹0 with no low-balance alert; real negatives (e.g. -₹175) still show correctly with the alert.
- FEATURE — Split local contact import: re-added a Contacts tab (default) to AddMemberSheet using expo-contacts with full permission handling (undetermined→request, denied→retry, blocked→Open Settings via Linking). Graceful web fallback ("works in the mobile app"). Manual (New) + Saved Friends tabs retained. Native phonebook import works on device / Expo Go only.
- Verified: backend 7/7 pytest (iter12) + full frontend Playwright e2e; all three items confirmed.
