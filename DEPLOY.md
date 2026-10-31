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
