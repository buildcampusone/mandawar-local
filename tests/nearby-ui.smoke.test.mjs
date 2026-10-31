// Smoke test for the Nearby UI with a tiny fake DOM (no browser needed). Checks every screen renders and the handlers fire.
class CL { constructor(n){this.n=n;} _s(){return new Set((this.n.className||"").split(/\s+/).filter(Boolean));}
  add(c){const s=this._s();s.add(c);this.n.className=[...s].join(" ");} remove(c){const s=this._s();s.delete(c);this.n.className=[...s].join(" ");}
  toggle(c,f){const has=this._s().has(c);const on=f===undefined?!has:!!f;on?this.add(c):this.remove(c);return on;} contains(c){return this._s().has(c);} }
class N { constructor(tag){this.tagName=tag;this.children=[];this.attrs={};this.dataset={};this.style={};this.ls={};this.className="";this.hidden=false;this._t="";this.classList=new CL(this);}
  set textContent(v){this.children=[];this._t=String(v);} get textContent(){return this._t+this.children.map(c=>c.textContent).join("");}
  append(...n){n.forEach(x=>this.appendChild(typeof x==="string"?Object.assign(new N("#text"),{_t:x}):x));} appendChild(c){this.children.push(c);return c;}
  get childNodes(){return this.children;} get lastChild(){return this.children[this.children.length-1];}
  setAttribute(k,v){this.attrs[k]=String(v);} removeAttribute(k){delete this.attrs[k];} addEventListener(e,f){(this.ls[e]??=[]).push(f);}
  click(){(this.ls.click||[]).forEach(f=>f({stopPropagation(){}}));} querySelectorAll(){return [];}
  all(pred,out=[]){if(pred(this))out.push(this);this.children.forEach(c=>c.all(pred,out));return out;} }
globalThis.document={createElement:t=>new N(t),createElementNS:(_,t)=>new N(t),addEventListener(){},removeEventListener(){}};
const { createNearbyDashboard } = await import("../modules/customer/nearby-ui.js");
const { evaluateDeliveryEligibility, sortEntries } = await import("../shared/services/nearby-core.js");
const assert=(await import("node:assert/strict")).default;
const btns=(r)=>r.all(n=>n.tagName==="button").map(b=>b.textContent);
const C={latitude:10,longitude:10};
const mk=(id,over={})=>{const s={id,name:"Shop "+id,category:"kirana",address:"Main road",status:"approved",isOpen:true,location:{latitude:10.005,longitude:10},delivery:{enabled:true,radiusKm:3,deliveryFee:20,minimumOrderAmount:100,estimatedPreparationMinutes:15},...over};return {shop:s,eligibility:evaluateDeliveryEligibility(s,C)};};

// 1) no onPickOnMap -> no "choose on map" button anywhere
let calls=[]; let root=new N("div");
const ui=createNearbyDashboard(root,{onRequestLocation:()=>calls.push("req"),onBrowseAll:()=>calls.push("all")});
ui.setState({mapStatus:"off"});
assert.equal(root.dataset.screen,"needs-location");
assert.ok(!btns(root).some(t=>t.includes("नक्शे पर चुनें")), "pick-on-map must be hidden without handler");
assert.ok(btns(root).includes("मेरी लोकेशन इस्तेमाल करें")); 
root.all(n=>n.tagName==="button"&&n.textContent==="मेरी लोकेशन इस्तेमाल करें")[0].click();
root.all(n=>n.tagName==="button"&&n.textContent==="सभी दुकानें देखें")[0].click();
assert.deepEqual(calls,["req","all"]);

// 2) with handler it is drawn
const root2=new N("div"); const ui2=createNearbyDashboard(root2,{onPickOnMap(){}}); ui2.setState({mapStatus:"off"});
assert.ok(btns(root2).includes("नक्शे पर चुनें"));

// 3) every state renders without throwing
const loc={latitude:10,longitude:10,source:"gps"};
const entries=sortEntries([mk("a"),mk("b",{isOpen:false}),mk("c",{location:undefined})]);
const screens={};
for (const [name,patch] of Object.entries({
  locating:{locationState:"REQUESTING"},
  problem:{locationState:"DENIED",locationError:{message:"x"}},
  loading:{locationState:"GRANTED",location:loc,discovery:{status:"loading",entries:[]}},
  error:{locationState:"GRANTED",location:loc,discovery:{status:"error",entries:[]}},
  none:{locationState:"GRANTED",location:loc,discovery:{status:"ready",entries:[]}},
  results:{locationState:"GRANTED",location:loc,discovery:{status:"ready",entries,stats:{truncated:true}}}
})) { ui.setState(patch); screens[name]=root.dataset.screen; }
assert.deepEqual(screens,{locating:"locating",problem:"location-problem",loading:"loading",error:"load-error",none:"empty-none",results:"results"});

// 4) results: 3 cards, deliverable one is openable, no "show on map" buttons, map column is off, toggle hidden
const cards=root.all(n=>n.className.includes("nb-card")&&!n.className.includes("nb-skel")&&n.tagName==="article");
assert.equal(cards.length,3);
const labels=btns(root);
assert.equal(labels.filter(t=>t==="सामान देखें").length,1);
assert.equal(labels.filter(t=>t==="नक्शे पर देखें").length,0);
assert.ok(root.all(n=>n.className.includes("nb-mapcol"))[0].className.includes("is-off"));
assert.equal(root.all(n=>n.className.includes("nb-toggle")&&n.tagName==="div")[0].hidden,true);
assert.equal(root.all(n=>n.className.includes("nb-map-note"))[0].hidden,true);   // "off" shows no failure note
const text=root.textContent;
assert.ok(text.includes("Rs 20")&&text.includes("Shop a")&&text.includes("1 दुकानें आपके यहाँ डिलीवर करती हैं"));
// 5) "failed" still shows the note + hides map; "pending" keeps map controls
ui.setState({mapStatus:"failed"}); assert.equal(root.all(n=>n.className.includes("nb-map-note"))[0].hidden,false);
ui.setState({mapStatus:"pending"}); assert.ok(btns(root).filter(t=>t==="नक्शे पर देखें").length>=1);
// 6) open-shop handler gets the shop
let opened=null; const r3=new N("div"); const ui3=createNearbyDashboard(r3,{onOpenShop:(id,e)=>{opened=e.shop.id;}}); 
ui3.setState({mapStatus:"off",locationState:"GRANTED",location:loc,discovery:{status:"ready",entries}});
r3.all(n=>n.tagName==="button"&&n.textContent==="सामान देखें")[0].click(); assert.equal(opened,"a");
console.log("SMOKE OK");
