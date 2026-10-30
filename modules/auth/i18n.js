const STRINGS = {
  hi: {
    lang: "हिन्दी",
    login: "लॉगिन करें", signup: "साइन अप करें",
    sub: "Mandawar की हर दुकान, एक ऐप में",
    subSignup: "कुछ जानकारी भरकर शुरू करें",
    name: "पूरा नाम", phone: "मोबाइल नंबर", email: "ईमेल", password: "पासवर्ड (कम से कम 6)",
    customer: "मैं ग्राहक हूँ", shopkeeper: "मैं दुकानदार हूँ",
    cont: "आगे बढ़ें", create: "अकाउंट बनाएं",
    or: "या", newAcc: "नया अकाउंट बनाएं", haveAcc: "पहले से अकाउंट है? लॉगिन करें",
    terms1: "आगे बढ़कर, मैं", terms2: "नियम और शर्तें", terms3: "और", terms4: "प्राइवेसी पॉलिसी", terms5: "स्वीकार करता/करती हूँ",
    wait: "कृपया प्रतीक्षा करें...", noProfile: "प्रोफ़ाइल नहीं मिला। नए ईमेल से साइन अप करें।",
    err: "गड़बड़ हुई: ",
    e_invalid: "ईमेल या पासवर्ड गलत है।", e_used: "यह ईमेल पहले से इस्तेमाल में है।", e_net: "इंटरनेट जाँचें और दोबारा कोशिश करें."
  },
  en: {
    lang: "English",
    login: "Login", signup: "Sign up",
    sub: "Welcome to Mandawar - every local shop, one app",
    subSignup: "Fill in a few details to get started",
    name: "Full name", phone: "Mobile number", email: "Email", password: "Password (min 6)",
    customer: "I am a Customer", shopkeeper: "I am a Shopkeeper",
    cont: "Continue", create: "Create account",
    or: "OR", newAcc: "Create a new account", haveAcc: "Already have an account? Login",
    terms1: "By clicking, I accept the", terms2: "Terms and conditions", terms3: "and", terms4: "Privacy Policy", terms5: "",
    wait: "Please wait...", noProfile: "Profile not found. Please sign up with a new email.",
    err: "Error: ",
    e_invalid: "Wrong email or password.", e_used: "This email is already in use.", e_net: "Check your internet and try again."
  }
};

let lang = "hi";
try { lang = localStorage.getItem("ml-lang") || "hi"; } catch {}

export const getLang = () => lang;
export const t = (k) => STRINGS[lang][k] ?? k;

export function errText(code = "") {
  if (/invalid-credential|wrong-password|user-not-found|invalid-email/.test(code)) return t("e_invalid");
  if (/email-already-in-use/.test(code)) return t("e_used");
  if (/network/.test(code)) return t("e_net");
  return t("err") + code;
}

export function applyLang() {
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));
  document.querySelectorAll("[data-i18n-ph]").forEach((el) => (el.placeholder = t(el.dataset.i18nPh)));
  document.dispatchEvent(new CustomEvent("langchange"));
}

export function toggleLang() {
  lang = lang === "hi" ? "en" : "hi";
  try { localStorage.setItem("ml-lang", lang); } catch {}
  applyLang();
}
