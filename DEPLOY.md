# Mandawar: deploy (Step 1)

One-time:
    npm i -g firebase-tools
    firebase login
    cd functions && npm install && cd ..

Test rules/functions locally first (needs Java for the Firestore emulator):
    firebase emulators:start

Deploy:
    firebase deploy --only firestore:rules,firestore:indexes,storage   # rules first
    firebase deploy --only hosting
    firebase deploy --only functions                                   # needs Blaze plan

First admin: sign up normally, then in Firebase Console -> Firestore -> users/<uid>
set field `role` to "admin" (rules block admin self-signup on purpose).

## Step 3: stock restore (Cloud Function `restoreStockOnClose`)
- Triggers when an order moves into `rejected` or `cancelled`; adds the ordered qty back to each product, once (marker field `stockRestoredAt` on the order).
- Region is `asia-south1` (functions/index.js). A Firestore trigger must be in the same region/multi-region as the Firestore database. If `firebase deploy --only functions` complains about that, either change the region in `setGlobalOptions` or tell me the database location.
- Run `cd functions && npm test` (no emulator needed). Deploy: `firebase deploy --only functions` (Blaze plan).

## Step 4: commission ledger + wallet (Cloud Function `recordCommissionOnDelivered`)
- When an order becomes `delivered`: writes `ledger/{orderId}` (one row per order, doc id = orderId so it can't repeat) and updates `wallets/{shopId}`. All amounts are integer paise.
- COD logic: shopkeeper keeps the cash, so `commissionDuePaise` = what the shopkeeper owes the platform.
- **Set the rate before launch:** create doc `config/platform` in the Firebase console with field `commissionPercent` (number, 0-100). If the doc is missing the rate is 0%, so ledger rows are written with commission 0. Each row stores the rate used at that time.
- Clients can only READ their own wallet/ledger (firestore.rules). Deploy rules + indexes + functions:
  `firebase deploy --only firestore,functions`
- Orders delivered before this function was deployed are not back-filled.

## Step 6: delivery partners (admin panel -> "Delivery Partners")
- New callable Cloud Functions (region `asia-south1`, `maxInstances: 3`): `setDeliveryRole`, `findUserByPhone`, `listDeliveryPartners`. Each one re-reads `users/{caller}.role` from Firestore and refuses anyone who is not `admin`.
- Only `customer -> delivery` and `delivery -> customer` are allowed. Admin / shopkeeper accounts and your own account are never changed. A rider with an order where `deliveryBoyId == rider` and `status == out_for_delivery` cannot be removed.
- Every change writes `roleAudit/{autoId}` (`actorUid, targetUid, from, to, createdAt`). Rules deny all client access to it; read it in Firebase Console.
- Deploy (rules + functions + hosting, one command):
      cd functions && npm install && npm test && cd ..
      firebase deploy --only firestore:rules,functions,hosting
  Callables need the Blaze plan, same as the other functions. No new Firestore index is needed.
- First deploy of a callable: if the admin page says "Something went wrong", open Firebase Console -> Functions and check the three functions show up in `asia-south1`.
- Rider accounts still sign up as `customer`; make them a rider from the panel. Role is changed on `users/{uid}` only, so the rider logs out and in again to be routed by the new role.

## Step 7: offline app, live orders, order alerts, better cart
- **Install + offline:** `service-worker.js` (was an empty file before) + `offline.html` + `shared/services/pwa.js` (loaded on every page). Pages, CSS and JS are pre-cached; after a deploy the app shows "Naya version aaya hai - Update". If you add a `.js`/`.css` file under `shared/` or `modules/`, add it to `PRECACHE` in `service-worker.js` (`node --test tests/*.test.mjs` fails and tells you which file is missing). Bump `VERSION` there to force everyone's cache to rebuild.
- **Offline data:** Firestore now keeps a local cache (`shared/config/firebase.js`), so shops, products and old orders open without internet. Placing an order is blocked while offline. The cache is wiped on logout (shared phones).
- **Live orders:** shopkeeper orders update by themselves; a new order gives a toast, beep, vibration and (if allowed) a phone notification, and the tab title shows "(n)". Customers get the same when a shop accepts / rejects / sends / delivers an order. These alerts work while the app is open or in the background. Alerts to a fully closed app need Firebase Cloud Messaging (VAPID key + sender function) and are NOT included.
- **Cart:** photo, +/- buttons, per-item total, red warnings for sold-out / low-stock / removed items, order button disabled until fixed or while offline, double-tap protected, "Order track karein" button after ordering.
- **Test after deploy (on a phone, HTTPS):** open the site, add to home screen, open it once online, switch on airplane mode, reopen: shops should load and the red "Internet nahi hai" strip should show. Then a second phone: place an order as customer while the shopkeeper page is open and check the alert.
- Deploy: `firebase deploy --only hosting` (no rules or functions change in this step).


## Step 8: rider assignment + delivery fee + minimum order
- **Order flow now:** `placed` -> shop Accept -> `accepted` (open pool) -> a rider taps **Delivery lein** -> `out_for_delivery` (+ `deliveryBoyId`, `riderName`, `riderPhone` written in the SAME update, so only one rider can win) -> rider taps **Delivered** -> `delivered`. The shopkeeper can no longer move an order past `accepted` (firestore.rules).
- **Rider page:** `delivery.html` (+ `modules/delivery/jobs.js`). A rider signs up as customer; admin -> Delivery Partners makes them a rider; they log out/in and land here. Riders can read only `accepted` orders and their own.
- **Delivery fee + minimum order:** taken from the shop's own settings (`shops/{id}.delivery.deliveryFee / minimumOrderAmount`). New order fields: `subtotal`, `deliveryFee`, `total = subtotal + deliveryFee`. Rules reject a fee that differs from the shop's setting and a subtotal below the minimum.
- **Commission:** charged on items (`subtotal`) only. Ledger rows now also hold `itemsPaise`, `deliveryFeePaise`, `riderId`. Old orders without `subtotal` still work (fee = 0).
- **Before deploy:** (1) make at least one rider, otherwise accepted orders wait forever; (2) any order currently `out_for_delivery` from before this change has no `deliveryBoyId` and nobody can mark it delivered: finish those by hand in the Console first; (3) `cd functions && npm test`, `node --test tests/*.test.mjs`; (4) `firebase deploy --only firestore:rules,functions,hosting`. Rules were NOT run in the emulator here (firebase-tools is not installed in this sandbox and there is no internet): test claim / deliver / fee / minimum in `firebase emulators:start` before going live.
- **Open question for the payout step:** the rider now collects the cash, but `wallets.commissionDuePaise` still assumes the shop holds it. Who pays whom (rider -> platform -> shop) is decided in the settlement step.

## Step 9: mobile OTP + Google login
**One-time Firebase Console setup (nothing works until this is done):**
1. Authentication -> Sign-in method -> enable **Google** (set the support email) and **Phone**.
2. Authentication -> Settings -> Authorized domains: make sure `mandawar-local.web.app`, `mandawar-local.firebaseapp.com` and your own domain (if any) are listed.
3. Authentication -> Settings -> SMS region policy: allow **India (IN)**.
4. SMS costs: the free Spark plan has a very small daily SMS allowance; real users need the **Blaze** plan (you already need it for functions). While testing, add fake numbers under Phone -> "Phone numbers for testing" (no real SMS is sent or billed).
5. Deploy: `firebase deploy --only firestore:rules,hosting`.

**What changed**
- `login.html` / `modules/auth/login.js`: Google button, "mobile OTP login", and one OTP screen used by every flow. Signup = email + password -> OTP -> profile is created. Google or phone login with no profile yet -> "complete your profile" (name, role, and a number to verify if the login has none).
- `firestore.rules`: `users` create needs `request.auth.token.phone_number == '+91' + phone` (the number is really OTP-verified and cannot be faked from the browser); a profile's phone can change only to a verified number; **placing an order** and **registering a shop** need a verified number.
- **Existing users** (signed up before OTP) are not locked out of login. They see a "Verify number" banner on the customer / shopkeeper pages, and cannot order or register a shop until they verify.
- Riders and admins: riders were customers first so they are already verified; admin accounts are untouched.
- Still not done: email verification for password accounts, App Check (reCAPTCHA keys) for the SMS endpoint, and changing the phone number later (the field is read-only on purpose).

## Step 10: OTP + Firebase security hardening
**Code changes (already in this zip)**
- `shared/services/otp-guard.js`: resend wait doubles (30s, 60s, 2m, 4m, 8m), max 5 OTPs per number and 8 per phone per hour, 5 wrong codes lock that number for 15 minutes. Used by the login page and the "verify number" sheet. It protects against accidents and Send-button hammering; it is NOT a security boundary (a user can clear localStorage). The real limits are the Console settings below.
- **App Check (website side):** `shared/config/firebase.js` -> `APP_CHECK_SITE_KEY`. Empty = off, nothing changes. Cloud Functions read `ENFORCE_APP_CHECK` from `functions/.env` (0 = off).
- **Order flood guard:** new function `guardOrderFlood`. If a customer already has 3 other orders waiting at `placed`, or 5 other orders in the last 10 minutes, the NEW order is cancelled (reason in `cancelReason`) and stock is restored by `restoreStockOnClose`. New index: orders `customerUid + createdAt` (deploy indexes first, or the function logs an index error).
- **Rules:** a shop with `isOpen == false` or `delivery.suspended == true` can no longer receive orders even if someone bypasses the UI.
- **Headers:** HSTS and `Cross-Origin-Opener-Policy: same-origin-allow-popups` (needed for Google sign-in popup) are on. A `Content-Security-Policy-Report-Only` header is added: it blocks nothing, it only logs violations in the browser console. Browse every page once, fix anything it complains about, then rename it to `Content-Security-Policy`.

**Firebase Console checklist, in this order**
1. **API key restriction (do this first, 5 minutes):** Google Cloud Console -> APIs & Services -> Credentials -> the "Browser key" used in `firebaseConfig` -> Application restrictions: HTTP referrers -> add `https://mandawar-local.web.app/*`, `https://mandawar-local.firebaseapp.com/*` and your own domain. The key stays public, but it then only works from your websites.
2. **SMS region policy:** Authentication -> Settings -> SMS region policy -> Allow only India. Blocks SMS-pumping to foreign numbers.
3. **Budget alert:** Billing -> Budgets & alerts -> set a monthly budget (e.g. Rs 500) with alerts at 50/90/100 percent. A bot that gets past everything else is then noticed within hours, not at month end.
4. **App Check:** App Check -> Apps -> your web app -> register **reCAPTCHA v3** (create the key at google.com/recaptcha/admin, add your domains), paste the SITE key into `APP_CHECK_SITE_KEY`, deploy hosting.
   - Wait 2-3 days. App Check -> APIs shows the share of verified requests per product (Firestore, Functions, Authentication).
   - When Firestore and Authentication show nearly 100% verified, click **Enforce** on them. Then, in `functions/.env`, set `ENFORCE_APP_CHECK=1` and redeploy functions.
   - Local testing: open the site on `localhost` once, copy the debug token from the browser console into App Check -> Manage debug tokens.
   - Enforcing too early locks out real users, and anyone with a cached old version of the app (this build bumps the service worker to v4 so they update).
5. **reCAPTCHA / SMS fraud protection (optional, strongest):** upgrade Authentication to Identity Platform and turn on "SMS toll fraud protection" under Authentication -> Settings.
6. **Admin accounts:** keep the number of admins tiny; admin = a field `role: "admin"` on `users/{uid}` set by you in the Console (rules block self-signup as admin). Use a Google account with 2-step verification for the Console itself.

**Deploy:** `firebase deploy --only firestore:rules,firestore:indexes,functions,hosting`

**Not tested here:** the sandbox has no firebase-tools / emulator and no internet, so the rules (including the new shop-open check) and the real OTP and App Check flows have only been reviewed, not run. Pure logic (OTP guard, abuse guard, commission, cart, events) is unit-tested.


## Step 11: order expiry, push, settlements, blocking (new)
1. `firebase deploy --only firestore:rules,firestore:indexes,functions` (the new index `orders: status + createdAt` takes a few minutes to build; `expireStaleOrdersJob` needs the Blaze plan + Cloud Scheduler).
2. **Push**: Console -> Project settings -> Cloud Messaging -> Web Push certificates -> Generate key pair. Paste the public key into `VAPID_KEY` in `shared/config/firebase.js`, redeploy hosting. Shopkeepers/riders/customers tap "Alerts chalu karein" once. iPhone needs the app added to the Home Screen.
3. **Commission**: Admin panel -> "Commission & Orders" -> set the rate. Until you do, commission is 0 %. When a shop pays you, press "Payment mila (settle)".
4. **Abuse / cost safety (do these in the Console, code cannot do them)**: App Check (reCAPTCHA v3) -> paste the site key in `APP_CHECK_SITE_KEY`, run for a few days, then set `ENFORCE_APP_CHECK=1` in `functions/.env`; Authentication -> Settings -> SMS region policy = India only; set a billing budget alert; Google Cloud Console -> Credentials -> restrict the browser API key to your site's domain.
5. CSP is still `Report-Only`. Watch the reports, then rename the header to `Content-Security-Policy` in `firebase.json`.


## Step 12: Login 2.0 - e-mail + password, NO SMS OTP (new)
What changed: mobile OTP login/signup is gone. Signup = name + mobile + role + e-mail + password -> a verification link is mailed -> the person taps it -> "I have verified" -> dashboard. Google login still works (Google already verified the address). "Forgot password?" sends a reset mail.
1. Firebase Console -> Authentication -> Sign-in method: keep **Email/Password** and **Google** on. You may switch **Phone** off (nothing uses it now; no SMS cost).
2. Authentication -> Settings -> Authorized domains: your hosting domain must be listed (verification / reset links use it).
3. Authentication -> Templates: edit the "Email address verification" and "Password reset" mails (Hindi/English text, sender name "Mandawar"). Free on the Spark plan.
4. Deploy rules + hosting: `firebase deploy --only firestore:rules,hosting`.
5. Rules now require a verified e-mail for **placing an order** and **registering a shop** (`identityVerified()` in firestore.rules). Old accounts that verified their phone by OTP earlier still pass.
6. The mobile number is contact information only (for delivery). It is NOT verified and two accounts can hold the same number, so when you make someone a rider (Admin -> Riders) check the name as well as the number.
7. Rider and admin accounts made in the Console do not need e-mail verification.

## IMPORTANT: Spark plan limits
Cloud Functions cannot be deployed on the free Spark plan (Google requires Blaze). Login 2.0 itself needs no functions, but these features DO need them: stock restore when an order is cancelled, commission wallet/ledger, order flood guard, order expiry, push notifications, rider management, admin settlements/blocking. Blaze has a free monthly quota, so a small town usually pays Rs 0 - set a budget alert. Without Blaze: keep the app on Spark, skip `functions`, and accept that those features do not run.
