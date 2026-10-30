# Mandawar

**Mandawar - Your Local Marketplace.** A mobile-first marketplace for every kind of local shop in Mandawar, Dausa, Rajasthan (kirana, dairy, medical, clothes, electronics, salon ...).

## Stack
- HTML5
- CSS3
- Vanilla JavaScript ES Modules
- Firebase (planned)

## Roles
- Customer
- Shopkeeper
- Delivery partner
- Admin

## Current phase
Phase 1: UI foundation and project structure.

## Important
No live orders, authentication or payment processing is enabled yet.

## Structure notes
- `shared/config/categories.js` - ONE list of shop categories (login animation, filters, register form, home). If you add one, also add its id to `firestore.rules` (shops.create) and redeploy rules.
- `shared/styles/tokens.css` - ONE green colour system for every page.
- `shared/components/shell.js` + `shell.css` - sidebar + profile used by customer, shopkeeper and admin panels. Sections opt in with `data-panel="viewId"`.
- `assets/categories/<id>.png` - optional images for the login animation tiles (see README there).

## Brand (official name: **Mandawar**, tagline: *Your Local Marketplace*)
- Never use "Mandawar Local" or "Mandawar Mart". Brand strings live in `shared/config/brand.js` (JS) and are repeated in the static HTML heads/headers.
- Colours: `shared/styles/tokens.css` (#006B35 primary, #008D49 secondary, #00A45B fresh, #EBF6EE light, #F7FAF7 background, #FFC83D accent, #14251C text).
- Assets: `assets/brand/` (mark, logo, hero, splash, og-image), `assets/icons/` (PWA, maskable, apple-touch, favicons), `favicon.ico`.
- Splash: `shared/components/splash.js` (once per session) uses the same artwork as the login hero and the PWA/iOS launch images, so launch -> splash -> login is one continuous scene.
- Social sharing: `og:image` in `index.html` is relative; change it to your full https URL after deploying.
