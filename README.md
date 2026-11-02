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
- Brand: official name **Mandawar Mart**, tagline *Your Daily Grocery Store*; strings in `shared/config/brand.js`. Colours: `shared/styles/tokens.css` (#01A32D / #025A10 / #08FB50 / #E3FBEA - taken from the logo).
- Setup and deploy steps: `DEPLOY.md`.

## Product screen (Mandawar Mart style)
- The customer home is `modules/customer/product-grid.js`. Layout follows the "Mandawar Mart - Customer Home Screen" design: green rounded header (delivery address, open/closed pill, store name, search + voice), delivery strip, offer banners, "Order again" card, "Shop by category" letter tiles, products grouped in 3-up cards (savings tag, जोड़ें button that turns into a - 1 + stepper), "See all" sheet and a floating cart bar. Styles: `shared/styles/mart.css`. Pure logic (grouping, discount, stock checks): `modules/customer/product-grid-core.js` (tests in `tests/product-grid-core.test.mjs`).
- All text on this screen comes from `shared/i18n/i18n.js` (keys `hm*` and `u_*`, Hindi + English), so the language switch works. On the home view the topbar and welcome banner are hidden (`body.mart-home[data-view="home"]`, see `mart.css`); `shell.js` sets `data-view` on `<body>`.
- It uses `cart.js` (one store, max 5 items, max 20 each) and the same checkout. A cart saved by the old multi-shop app is dropped on first load.
- Two OPTIONAL product fields feed it: `mrp` (original price, shows the "save" tag when higher than `price`) and `categoryId` (the department). The owner sets them in the Products form. Products without a department are listed last under "Other items".
- `assets/images/mart/` holds the Mandawar Mart pack photos (almond, cashew, raisin, pista). The app does not load them by itself; the owner adds them through "Photo jodein" like any product photo.


## Customer home (Phase 5)
Top to bottom: delivery address (tap = address screen) + store open pill, search + voice (hidden where the browser has no speech recognition), delivery strip (from `storeSettings.delivery`), swipe banners with dots, "Order again" card (the last order that still has stock; one tap adds it to the cart), Shop by category tiles, then sections: Deals, Best Sellers and Featured (flags the owner sets per product), (Deals = products with `mrp` > `price`, biggest discount first), Daily Essentials (atta, rice, dal, oil, sugar & salt) and one section per department. Empty sections are not drawn. Grey skeleton cards show while loading; a load error shows a retry button. Pure logic: `modules/customer/home-core.js` (tests: `tests/home-core.test.mjs`).

## Categories screen (new)
Bottom-nav "Categories": green header (delivery line, search, Deals / Fresh / Categories / Rice / Kirana tabs) and the owner's departments grouped into Grocery, Snacks & Drinks, Fresh & Dairy, Home & Care (+ "More" for departments the owner adds). Tap a tile or tab = Home scrolls to that department. Code: `modules/customer/categories-core.js` (pure, tested), `categories-view.js`, styles at the end of `shared/styles/mart.css`. Tiles use emoji icons; real department photos can replace them later. `firestore.rules` + `rules-tests` in this zip are the audited versions (see rules header).
