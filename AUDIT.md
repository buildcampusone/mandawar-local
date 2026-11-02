# Mandawar Mart - Final Audit (1 Nov 2026)

## Verified
- Browser tests: 78/78 pass (`node --test tests/*.mjs`). Cloud Functions tests: 46/46 pass (`cd functions && npm i && npm test`).
- Every JS module passes a syntax check; every DOM id and i18n key used by the new home screen exists (Hindi + English).
- New customer home rendered at 390px, 320px, 1280px, dark mode and English: no page errors, no horizontal overflow.
- Reorder card, cart stepper and category jump tested in a browser with sample data.

## Not verified (needs you)
1. Firestore rules tests (`rules-tests`) need the Firebase emulator + Java: not run here.
2. Not run against live Firebase / on a real phone (login, real products, real orders, push, Razorpay).
3. Google Fonts blocked in the test sandbox, so Poppins Devanagari was not seen; check Hindi text on a real device.

## Open gaps (by priority)
HIGH
- Online payment (Razorpay) is not built: COD only.
- App Check is off (`ENFORCE_APP_CHECK` / reCAPTCHA key empty): the public Firebase key can be used by any script. Do DEPLOY.md Step 10 before going public.
- `VAPID_KEY` must be set for push notifications.
MEDIUM
- Language is mixed: the home screen is fully Hindi/English, but cart, checkout, my-orders, address, rating, cart.js messages and `addCheck` toasts are still Hinglish. Move them to `i18n.js`.
- Bottom nav is Home / Cart / Orders / Profile (shared with owner + rider). The design's "Categories" tab is not built.
- On mobile the home screen hides the topbar, so the side drawer is reachable only through the Profile tab.
- Delivery strip shows stored settings only. There is no "free delivery above Rs X" field (needs a Firestore rules change).
- Department tiles use the first letter of the English name; owner should name departments in Hindi or add icons.
LOW
- Product photos are only owner-uploaded JPEG data URLs (no Storage CDN): large product lists get heavy.
- Cart limit is 5 items / 20 qty each; "Order again" truncates bigger orders to 5 lines.
- Orders are read as the last 20 only, so "Order again" only looks that far back.
- Banners on the home have no admin preview for the new CTA/dots look.
- No automated UI tests (only logic tests).

## Changes in this version
- New customer home design (customer.html, mart.css, product-grid.js, home-core.js, browse.js, i18n.js, shell.js `data-view`).
- Removed dead code (`deptEmoji`, `badgeFor`) and their tests; service worker cache bumped to v6; README updated.
- Removed `node_modules` and lock files from the zip.
