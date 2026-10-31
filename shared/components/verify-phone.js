// Banner for accounts that have no OTP-verified mobile number yet (everyone who signed up before OTP existed).
// Orders and shop registration are blocked by firestore.rules until the number is verified, so this explains why
// and walks them through it. Verified numbers are attached to the login with linkWithPhoneNumber (see auth.js).
import { db } from "../config/firebase.js";
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { sendOtp, confirmOtp, resetRecaptcha } from "../services/auth.js";
import { isPhone, isCode, onlyDigits, fromE164 } from "../services/phone-core.js";
import { otpGuard, guardMessage } from "../services/otp-guard.js";
import { t, errText } from "../i18n/i18n.js";
import { openSheet, btn, msgLine, setMsg, field } from "./shell.js";

export function mountVerifyBanner(user, profile) {
  if (fromE164(user.phoneNumber)) return;
  const main = document.querySelector("main");
  if (!main || document.getElementById("verify-banner")) return;
  const box = document.createElement("section");
  box.id = "verify-banner";
  box.className = "notice";
  const p = document.createElement("p");
  p.style.margin = "0 0 10px";
  p.textContent = t("vbText");
  const b = document.createElement("button");
  b.type = "button"; b.className = "category"; b.textContent = t("vbBtn");
  b.onclick = () => openVerify(user, profile, () => box.remove());
  box.append(p, b);
  main.prepend(box);
}

function openVerify(user, profile, onVerified) {
  openSheet(t("vbTitle"), (body, close) => {
    const phoneI = document.createElement("input");
    phoneI.inputMode = "numeric"; phoneI.maxLength = 10; phoneI.autocomplete = "tel-national";
    phoneI.value = onlyDigits(profile.phone);
    const codeI = document.createElement("input");
    codeI.inputMode = "numeric"; codeI.maxLength = 6; codeI.autocomplete = "one-time-code"; codeI.placeholder = t("otpPh");
    const codeRow = field(t("otpPh"), codeI);
    codeRow.hidden = true;
    const m = msgLine();
    const send = btn(t("sendOtp"));
    const verify = btn(t("otpVerify"));
    verify.hidden = true;
    let confirmation = null;

    send.onclick = async () => {
      const phone = onlyDigits(phoneI.value);
      if (!isPhone(phone)) return setMsg(m, t("e_phone"), true);
      const v = otpGuard.canSend(phone);
      if (!v.ok) return setMsg(m, t(...guardMessage(v)), true);
      send.disabled = true;
      setMsg(m, t("otpSending"));
      try {
        confirmation = await sendOtp({ phone, link: true });
        otpGuard.recordSend(phone);
        phoneI.disabled = true;
        codeRow.hidden = false; verify.hidden = false; send.hidden = true;
        setMsg(m, t("otpSentTo", { n: "+91 " + phone }));
        codeI.focus();
      } catch (e) { setMsg(m, errText(e.code), true); send.disabled = false; }
    };
    verify.onclick = async () => {
      const code = codeI.value.trim();
      if (!isCode(code)) return setMsg(m, t("e_code"), true);
      verify.disabled = true;
      try {
        const u = await confirmOtp(confirmation, code);
        const phone = fromE164(u.phoneNumber);
        otpGuard.recordSuccess(phone);
        if (phone && phone !== profile.phone) {                 // profile follows the verified number (rules allow exactly this)
          await updateDoc(doc(db, "users", user.uid), { phone });
          profile.phone = phone;
        }
        resetRecaptcha();
        onVerified();
        close();
      } catch (e) {
        if (/invalid-verification-code/.test(e.code || "")) {
          const w = otpGuard.recordWrong(onlyDigits(phoneI.value));
          setMsg(m, w.locked ? t(...guardMessage(otpGuard.canSend(onlyDigits(phoneI.value)))) : t("otpLeft", { n: w.left }), true);
          verify.disabled = w.locked;
        } else {
          setMsg(m, e.code ? errText(e.code) : t("saveFail") + (e.message || ""), true);
          verify.disabled = false;
        }
      }
    };
    body.append(field(t("phone"), phoneI), codeRow, m, send, verify);
  });
}
