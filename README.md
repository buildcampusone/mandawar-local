# Mandawar Mart

**Mandawar Mart - Your Daily Grocery Store.** A mobile-first grocery shopping app for Mandawar, Dausa, Rajasthan. One store, one owner (converted from the old multi-shop "Mandawar" marketplace; phases 1-4 done).

## Stack
HTML5, CSS3, vanilla JavaScript ES Modules, Firebase (Auth: e-mail+password with e-mail verification and Google, no SMS + Firestore + Cloud Functions + Hosting + FCM push).

## Roles
Customer, Delivery partner (rider) and Admin = the store owner (created by hand in the Console: set `users/{uid}.role = "admin"`). Public signup creates customers only. No sellers, no seller approval.

## What works today
COD orders with live status, stock handling, delivery fee / minimum order, rider claim + hand-back, order expiry (15 min no answer, 30 min no rider), customer cancel before a rider takes it, push notifications (needs `VAPID_KEY`). Owner dashboard (`admin.html`): orders, products, store settings, riders. Online payment (Razorpay) is NOT built yet.

## Tests
- `cd functions && npm test` (Cloud Functions logic)
- `node --test tests/*.mjs` (browser logic)
- `cd rules-tests && npm i && npm test` (Firestore rules, needs the emulator)

## Structure notes
- `shared/config/units.js` - product units (must match `firestore.rules`).
- `shared/config/departments.js` - the 17 grocery departments (starting set), `STORE_ID = "main"`, and the pure helpers for name checks, ordering and moving departments (tests: `tests/departments.test.mjs`).

## Data model (Phase 4)
- `storeSettings/main` - the one store: name, address, phone, `isOpen`, `delivery{deliveryFee, minimumOrderAmount, estimatedPreparationMinutes, suspended}`. Owner creates it once.
- `categories/{id}` - grocery departments: `name`, `order`, `active`, `createdAt`. Owner adds, renames, reorders and deactivates them (Departments tab). Never deleted.
- `products/{id}` - top-level products (`name`, `price`, `mrp?`, `unit`, `stock`, `active`, `image?`, `categoryId?`). Only the owner writes them; a customer can only lower `stock` while placing an order.
- `banners/{id}` - home-screen offers: `title`, `subtitle?`, `image?` (JPEG data URL), `target?` (a section key like `deals`, or a department id), `order`, `active`. Customers read active ones; only the owner writes. The owner screen for them arrives in Phase 6 (until then add them in the Console).
- `orders` still carry `shopId = "main"` and `shopName` (kept so riders, reviews and push keep working); Phase 7 replaces this with `placeOrder`.
- `shared/styles/tokens.css` - ONE green colour system. `shared/components/shell.js` - sidebar used by all panels (`data-panel="viewId"`).
- Brand: official name **Mandawar Mart**, tagline *Your Daily Grocery Store*; strings in `shared/config/brand.js`. Colours: `shared/styles/tokens.css` (#087A43 / #064E32 / #16A34A / #E4F5EC).
- Setup and deploy steps: `DEPLOY.md`.

## Product screen (Mandawar Mart style)
- The customer home is `modules/customer/product-grid.js`: light-blue header with search + voice search, a "Shop by category" tile grid (one tile per active department; tap = jump to it), products grouped by department in 3-up rows, ADD button that turns into a - 1 + stepper, rotating Discount / You Save tag, "View All Products" sheet and a floating cart bar. Styles: `shared/styles/mart.css`. Pure logic (grouping, discount, stock checks): `modules/customer/product-grid-core.js` (tests in `tests/product-grid-core.test.mjs`).
- It uses `cart.js` (one store, max 5 items, max 20 each) and the same checkout. A cart saved by the old multi-shop app is dropped on first load.
- Two OPTIONAL product fields feed it: `mrp` (original price, shows the discount tag when higher than `price`) and `categoryId` (the department). The owner sets them in the Products form ("MRP badlo", "Department badlo"). Products without a department still work: they are listed last under "Saaman". The old free-text `group` field is gone.
- `assets/images/mart/` holds the Mandawar Mart pack photos (almond, cashew, raisin, pista). The app does not load them by itself; the owner adds them through "Photo jodein" like any product photo.


## Customer home (Phase 5)
Top to bottom: "Deliver to ..." line (tap = address screen), search + voice (hidden where the browser has no speech recognition), quick chips (Deals, Fresh, Categories, Rice, Kirana; a chip appears only when it leads somewhere), swipe banners, Shop by category tiles, then sections: Previously bought (from the customer's own orders, most-ordered first), Best Sellers and Featured (flags the owner sets per product), Deals (products with `mrp` > `price`, biggest discount first), Daily Essentials (atta, rice, dal, oil, sugar & salt) and one section per department. Empty sections are not drawn. Grey skeleton cards show while loading; a load error shows a retry button. Pure logic: `modules/customer/home-core.js` (tests: `tests/home-core.test.mjs`).
