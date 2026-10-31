# Mandawar

**Mandawar - Your Local Marketplace.** A mobile-first marketplace for every kind of local shop in Mandawar, Dausa, Rajasthan.

## Stack
HTML5, CSS3, vanilla JavaScript ES Modules, Firebase (Auth: e-mail+password with e-mail verification and Google, no SMS + Firestore + Cloud Functions + Hosting + FCM push).

## Roles
Customer, Shopkeeper, Delivery partner (rider), Admin (admin is created by hand in the Console: set `users/{uid}.role = "admin"`).

## What works today
COD orders with live status, stock handling, delivery fee / minimum order, rider claim + hand-back, order expiry (15 min no answer, 30 min no rider), customer cancel before a rider takes it, push notifications (needs `VAPID_KEY`), commission ledger + wallet, shopkeeper earnings screen, admin: shop approval, riders, commission rate, settlements, cancel stuck order, block / unblock users. Online payment (Razorpay) is NOT built yet.

## Tests
- `cd functions && npm test` (Cloud Functions logic)
- `node --test tests/*.mjs` (browser logic)
- `cd rules-tests && npm i && npm test` (Firestore rules, needs the emulator)

## Structure notes
- `shared/config/categories.js` - ONE list of shop categories. If you add one, also add its id to `firestore.rules` (shops.create).
- `shared/styles/tokens.css` - ONE green colour system. `shared/components/shell.js` - sidebar used by all panels (`data-panel="viewId"`).
- Brand: official name **Mandawar**, tagline *Your Local Marketplace*; strings in `shared/config/brand.js`.
- Setup and deploy steps: `DEPLOY.md`.
