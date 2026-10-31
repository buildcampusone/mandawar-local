# Mandawar Mart: deploy (Step 1)

## Owner account (one store, one owner)
1. Sign up in the app like a customer (e-mail + verify), with the e-mail you will use as the owner.
2. Firebase Console -> Firestore -> `users/{your uid}` -> set `role` to `admin`.
3. Log in again: you land on the owner dashboard (`admin.html`). First visit asks you to set up the store (name, address, phone); this creates `storeSettings/main`. Then open **Departments** and tap "17 departments jodein", then add products (pick a department for each) and delivery settings.
4. Public signup can only create customers. There is no seller registration any more.


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

## Step 4 (removed in Mandawar Mart): commission ledger + wallet
- Mandawar Mart has one owner and no sellers, so the commission ledger, wallets, settlements and `config/platform` are gone (Cloud Functions, rules, admin screens, index). Old docs in those collections, if any, stay in Firestore but nothing reads them. Delete them in the Console when you like.
- Deploy rules + indexes + functions: `firebase deploy --only firestore,functions`

## Step 6: delivery partners (admin panel -> "Delivery Partners")
- New callable Cloud Functions (region `asia-south1`, `maxInstances: 3`): `setDeliveryRole`, `findUserByPhone`, `listDeliveryPartners`. Each one re-reads `users/{caller}.role` from Firestore and refuses anyone who is not `admin`.
- Only `customer -> delivery` and `delivery -> customer` are allowed. Admin accounts and your own account are never changed. A rider with an order where `deliveryBoyId == rider` and `status == out_for_delivery` cannot be removed.
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
- **Live orders:** owner orders update by themselves; a new order gives a toast, beep, vibration and (if allowed) a phone notification, and the tab title shows "(n)". Customers get the same when a shop accepts / rejects / sends / delivers an order. These alerts work while the app is open or in the background. Alerts to a fully closed app need Firebase Cloud Messaging (VAPID key + sender function) and are NOT included.
- **Cart:** photo, +/- buttons, per-item total, red warnings for sold-out / low-stock / removed items, order button disabled until fixed or while offline, double-tap protected, "Order track karein" button after ordering.
- **Test after deploy (on a phone, HTTPS):** open the site, add to home screen, open it once online, switch on airplane mode, reopen: shops should load and the red "Internet nahi hai" strip should show. Then a second phone: place an order as customer while the shopkeeper page is open and check the alert.
- Deploy: `firebase deploy --only hosting` (no rules or functions change in this step).


## Step 8: rider assignment + delivery fee + minimum order
- **Order flow now:** `placed` -> shop Accept -> `accepted` (open pool) -> a rider taps **Delivery lein** -> `out_for_delivery` (+ `deliveryBoyId`, `riderName`, `riderPhone` written in the SAME update, so only one rider can win) -> rider taps **Delivered** -> `delivered`. The shopkeeper can no longer move an order past `accepted` (firestore.rules).
- **Rider page:** `delivery.html` (+ `modules/delivery/jobs.js`). A rider signs up as customer; admin -> Delivery Partners makes them a rider; they log out/in and land here. Riders can read only `accepted` orders and their own.
- **Delivery fee + minimum order:** taken from the shop's own settings (`storeSettings/main.delivery.deliveryFee / minimumOrderAmount`). New order fields: `subtotal`, `deliveryFee`, `total = subtotal + deliveryFee`. Rules reject a fee that differs from the shop's setting and a subtotal below the minimum.
- **Before deploy:** (1) make at least one rider, otherwise accepted orders wait forever; (2) any order currently `out_for_delivery` from before this change has no `deliveryBoyId` and nobody can mark it delivered: finish those by hand in the Console first; (3) `cd functions && npm test`, `node --test tests/*.test.mjs`; (4) `firebase deploy --only firestore:rules,functions,hosting`. Rules were NOT run in the emulator here (firebase-tools is not installed in this sandbox and there is no internet): test claim / deliver / fee / minimum in `firebase emulators:start` before going live.

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
- **Existing users** (signed up before OTP) are not locked out of login. They see a "Verify number" banner on the customer page, and cannot order or register a shop until they verify.
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


## Step 11: order expiry, push, blocking (new)
1. `firebase deploy --only firestore:rules,firestore:indexes,functions` (the new index `orders: status + createdAt` takes a few minutes to build; `expireStaleOrdersJob` needs the Blaze plan + Cloud Scheduler).
2. **Push**: Console -> Project settings -> Cloud Messaging -> Web Push certificates -> Generate key pair. Paste the public key into `VAPID_KEY` in `shared/config/firebase.js`, redeploy hosting. Owner/riders/customers tap "Alerts chalu karein" once. iPhone needs the app added to the Home Screen.
4. **Abuse / cost safety (do these in the Console, code cannot do them)**: App Check (reCAPTCHA v3) -> paste the site key in `APP_CHECK_SITE_KEY`, run for a few days, then set `ENFORCE_APP_CHECK=1` in `functions/.env`; Authentication -> Settings -> SMS region policy = India only; set a billing budget alert; Google Cloud Console -> Credentials -> restrict the browser API key to your site's domain.
5. CSP is still `Report-Only`. Watch the reports, then rename the header to `Content-Security-Policy` in `firebase.json`.


## Step 12: Login 2.0 - e-mail + password, NO SMS OTP (new)
What changed: mobile OTP login/signup is gone. Signup = name + mobile + role + e-mail + password -> a verification link is mailed -> the person taps it -> "I have verified" -> dashboard. Google login still works (Google already verified the address). "Forgot password?" sends a reset mail.
1. Firebase Console -> Authentication -> Sign-in method: keep **Email/Password** and **Google** on. You may switch **Phone** off (nothing uses it now; no SMS cost).
2. Authentication -> Settings -> Authorized domains: your hosting domain must be listed (verification / reset links use it).
3. Authentication -> Templates: edit the "Email address verification" and "Password reset" mails (Hindi/English text, sender name "Mandawar Mart"). Free on the Spark plan.
4. Deploy rules + hosting: `firebase deploy --only firestore:rules,hosting`.
5. Rules now require a verified e-mail for **placing an order** and **registering a shop** (`identityVerified()` in firestore.rules). Old accounts that verified their phone by OTP earlier still pass.
6. The mobile number is contact information only (for delivery). It is NOT verified and two accounts can hold the same number, so when you make someone a rider (Admin -> Riders) check the name as well as the number.
7. Rider and admin accounts made in the Console do not need e-mail verification.

## IMPORTANT: Spark plan limits
Cloud Functions cannot be deployed on the free Spark plan (Google requires Blaze). Login 2.0 itself needs no functions, but these features DO need them: stock restore when an order is cancelled, commission wallet/ledger, order flood guard, order expiry, push notifications, rider management, admin settlements/blocking. Blaze has a free monthly quota, so a small town usually pays Rs 0 - set a budget alert. Without Blaze: keep the app on Spark, skip `functions`, and accept that those features do not run.

## Product screen update (mrp + group)
- `firestore.rules` now allows two optional product fields, `mrp` (number, 0 to 1,00,000) and `group` (text, 2 to 30 characters). Deploy the rules BEFORE shopkeepers use the new form fields, otherwise saving a product with them is refused:
      firebase deploy --only firestore:rules,hosting
- `service-worker.js` VERSION is `mandawar-mart-v1`, so everyone gets the new files on the next visit.
- `rules-tests` were not extended for these two fields; run `cd rules-tests && npm i && npm test` with the emulator once before deploying.



## Phase 4: departments, top-level products (READ BEFORE DEPLOYING)
- **Deploy rules first, then the site:** `firebase deploy --only firestore:rules,hosting,functions`. New collections: `storeSettings`, `categories`, top-level `products`. The old `shops/...` collection is closed by the rules.
- **No data is migrated.** Products or a store created in the earlier phases live under `shops/{uid}/...` and will not show up. Open the owner dashboard once: it asks you to set up the store again (creates `storeSettings/main`), then add the products again. If you have real products already, tell me and I will write a one-off copy script instead.
- **Old carts / orders:** a cart saved by the old app is dropped automatically. Existing orders keep working for riders and reviews, but their product photos/reorder will not resolve (the old product ids are gone).
- **Functions:** stock restore on reject/cancel now reads `products/{id}`; "new order" push goes to every account with `role == admin`.
- **Service worker cache** is bumped to `mandawar-mart-v2`, so phones pick up the new modules after one reload.
- **Checkout identity check** now matches the rules (verified e-mail). Before this, the client demanded an SMS-verified phone, which e-mail/Google accounts can never have, so nobody could order.
- Rules tests (`rules-tests`) were updated for the new collections but not run here (no emulator): run `cd rules-tests && npm i && npm test` and the whole `firestore.rules` file through `firebase deploy --only firestore:rules` (it prints syntax errors).

## Phase 5: customer home
- Deploy `firestore.rules` (new `banners` collection, product fields `bestSeller` / `featured`) before the site. Service-worker cache is now `mandawar-mart-v3`.
- Best Sellers / Featured stay empty until the owner taps "Best seller banao" / "Featured banao" on a product.
- Banners: no owner screen yet (Phase 6). To test, add a doc in Console -> `banners`: `title` (2-40 chars), `order` (number), `active` (true), optional `subtitle`, `target` (`deals`, `best`, `essentials` or a department id like `rice-grains`); `createdAt` can be any timestamp when added from the Console.
- "Previously bought" uses the existing `orders` index (`customerUid` + `createdAt`); no new index.
