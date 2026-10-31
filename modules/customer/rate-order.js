// Rate an order: emoji (saved at once) -> what you liked + note -> star rating for shop and each item.
// Data: reviews/{orderId}  (see firestore.rules). The emoji alone is a valid, saved review;
// "Tell us more" finishes it (detailsDone = true) and locks it.
import { db } from "../../shared/config/firebase.js";
import { openSheet, msgLine, setMsg, btn } from "../../shared/components/shell.js";
import { thumb } from "../../shared/components/thumb.js";
import {
  doc, setDoc, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

export const REACTIONS = ["😢", "🙁", "😐", "🙂", "😍"];
export const REACTION_TEXT = ["Bahut kharab", "Theek nahi", "Theek-thaak", "Accha", "Bahut badhiya"];
export const TAGS = [
  { id: "quality", label: "Item Quality" },
  { id: "speed", label: "Delivery Speed" },
  { id: "packaging", label: "Packaging Quality" },
  { id: "price", label: "Price & Offers" },
  { id: "behaviour", label: "Shop Behaviour" }
];

const STAR = '<path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"/>';
function starSvg() {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("aria-hidden", "true");
  s.innerHTML = STAR; // static markup
  return s;
}
function mk(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function stars(initial, onPick, label) {
  const wrap = mk("div", "rt-stars");
  wrap.setAttribute("role", "radiogroup");
  wrap.setAttribute("aria-label", label);
  let val = initial;
  const bs = [1, 2, 3, 4, 5].map((n) => {
    const b = mk("button");
    b.type = "button";
    b.setAttribute("role", "radio");
    b.setAttribute("aria-label", n + " star");
    b.appendChild(starSvg());
    b.onclick = () => { val = n; paint(); onPick(n); };
    wrap.appendChild(b);
    return b;
  });
  const paint = () => bs.forEach((b, i) => {
    b.classList.toggle("on", i < val);
    b.setAttribute("aria-checked", String(i + 1 === val));
  });
  paint();
  return wrap;
}

/**
 * openRating({ order, review, user, products, onSaved })
 *  order    - { id, shopId, shopName, items }
 *  review   - existing review doc data or null
 *  products - Map productId -> product data (for thumbnails, may be empty)
 *  onSaved  - (review) => void, called after every successful save
 *  initial  - optional emoji (1-5) already tapped on the order card; saved as soon as the sheet opens
 */
export function openRating({ order, review, user, products, onSaved, initial }) {
  const state = {
    exists: !!review,
    rating: review ? review.rating : 0,
    tags: new Set(review ? review.tags : []),
    comment: review ? review.comment : "",
    shopRating: review ? review.shopRating : 0,
    items: order.items.map((_, i) => (review && review.itemRatings[i]) || 0)
  };
  const ref = doc(db, "reviews", order.id);
  let stage = state.rating ? "details" : "emoji";

  openSheet("Rate Your Order", (body, close) => {
    const msg = msgLine();

    let burstAfterRender = "";
    async function saveEmoji(n) {
      const prev = state.rating;
      state.rating = n;
      try {
        if (state.exists) await updateDoc(ref, { rating: n });
        else {
          await setDoc(ref, {
            orderId: order.id, customerUid: user.uid, shopId: order.shopId, rating: n,
            tags: [], comment: "", shopRating: 0, itemRatings: [], detailsDone: false,
            createdAt: serverTimestamp()
          });
          state.exists = true;
        }
        onSaved?.(snapshot(false));
        stage = "details";
        if (n >= 4) burstAfterRender = REACTIONS[n - 1];
      } catch (e) {
        state.rating = prev;
        setMsg(msg, "Save nahi hua: " + (e.message || e.code), true);
      }
      render();
    }

    function snapshot(done) {
      return {
        orderId: order.id, customerUid: user.uid, shopId: order.shopId, rating: state.rating,
        tags: [...state.tags], comment: state.comment, shopRating: state.shopRating,
        itemRatings: state.items.slice(), detailsDone: done
      };
    }

    function emojiRow(big) {
      const row = mk("div", "emo" + (big ? " big" : ""));
      row.setAttribute("role", "radiogroup");
      row.setAttribute("aria-label", "Order rating");
      REACTIONS.forEach((em, i) => {
        const b = mk("button", state.rating === i + 1 ? "on" : "", em);
        b.type = "button";
        b.setAttribute("role", "radio");
        b.setAttribute("aria-checked", String(state.rating === i + 1));
        b.setAttribute("aria-label", REACTION_TEXT[i]);
        b.onclick = () => saveEmoji(i + 1);
        row.appendChild(b);
      });
      return row;
    }

    function header() {
      const who = mk("div", "rt-who");
      order.items.slice(0, 3).forEach((it) => {
        who.appendChild(thumb({ name: it.name, image: products.get(it.productId)?.image }, "lg"));
      });
      body.appendChild(who);
      body.appendChild(mk("p", "rt-h", order.shopName || "Dukaan"));
    }

    function render() {
      body.textContent = "";
      setMsg(msg, "");
      header();
      body.appendChild(emojiRow(true));
      if (state.rating) body.appendChild(mk("p", "sheet-hint", REACTION_TEXT[state.rating - 1])).style.textAlign = "center";

      if (stage === "details" && state.rating) {
        body.appendChild(mk("h4", "rt-h", state.rating >= 4 ? "Aapko sabse zyada kya pasand aaya?" : "Kya behtar ho sakta tha?"));
        const chips = mk("div", "chips");
        TAGS.forEach((tg) => {
          const c = mk("button", "chip" + (state.tags.has(tg.id) ? " on" : ""), tg.label);
          c.type = "button";
          c.setAttribute("aria-pressed", String(state.tags.has(tg.id)));
          c.onclick = () => {
            if (state.tags.has(tg.id)) state.tags.delete(tg.id); else state.tags.add(tg.id);
            c.classList.toggle("on", state.tags.has(tg.id));
            c.setAttribute("aria-pressed", String(state.tags.has(tg.id)));
          };
          chips.appendChild(c);
        });
        body.appendChild(chips);
        const ta = mk("textarea");
        ta.rows = 3; ta.maxLength = 300; ta.placeholder = "Aur kuch batana chahein? (optional)"; ta.value = state.comment;
        ta.oninput = () => { state.comment = ta.value; };
        body.appendChild(ta);
        const more = btn("Tell us More");
        more.onclick = () => { stage = "stars"; render(); };
        body.append(msg, more);
      } else if (stage === "stars") {
        body.appendChild(mk("h4", "rt-h", "Delivery / dukaan ko rate karein"));
        const shopLine = mk("div", "rt-line");
        const sw = mk("div");
        sw.appendChild(mk("b", "", order.shopName || "Dukaan"));
        sw.appendChild(stars(state.shopRating, (n) => { state.shopRating = n; }, "Dukaan rating"));
        shopLine.appendChild(sw);
        body.appendChild(shopLine);
        body.appendChild(mk("h4", "rt-h", "Items ko rate karein"));
        order.items.forEach((it, i) => {
          const line = mk("div", "rt-line");
          line.appendChild(thumb({ name: it.name, image: products.get(it.productId)?.image }, "sm"));
          const w = mk("div");
          w.appendChild(mk("b", "", it.name));
          w.appendChild(stars(state.items[i], (n) => { state.items[i] = n; }, it.name + " rating"));
          line.appendChild(w);
          body.appendChild(line);
        });
        const submit = btn("Submit");
        submit.onclick = async () => {
          submit.disabled = true;
          try {
            await updateDoc(ref, {
              rating: state.rating, tags: [...state.tags], comment: state.comment.trim().slice(0, 300),
              shopRating: state.shopRating, itemRatings: state.items, detailsDone: true
            });
            onSaved?.(snapshot(true));
            setMsg(msg, "Dhanyavaad! Aapka review mil gaya.");
            setTimeout(close, 1100);
          } catch (e) {
            setMsg(msg, "Save nahi hua: " + (e.message || e.code), true);
            submit.disabled = false;
          }
        };
        body.append(msg, submit);
      } else {
        body.appendChild(msg);
      }
      if (burstAfterRender) { burst(burstAfterRender); burstAfterRender = ""; }
    }
    render();
    if (initial >= 1 && initial <= 5 && !state.rating) saveEmoji(initial);
  });
}

// Little celebration for 4-5 star reactions: the chosen emoji floats up from the bottom of the sheet.
function burst(emoji) {
  if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const layer = mk("div", "emo-burst");
  layer.setAttribute("aria-hidden", "true");
  for (let i = 0; i < 6; i++) {
    const e = mk("span", "", emoji);
    e.style.setProperty("--x", 8 + Math.round(Math.random() * 76) + "%");
    e.style.setProperty("--s", (1.4 + Math.random() * 1.8).toFixed(2) + "rem");
    e.style.animationDelay = (i * 70) + "ms";
    layer.appendChild(e);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 1800);
}
