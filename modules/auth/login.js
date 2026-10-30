import { signUp, logIn, getProfile, dashboardFor } from "../../shared/services/auth.js";
import { auth } from "../../shared/config/firebase.js";
import { t, errText } from "./i18n.js";

const $ = (id) => document.getElementById(id);
let signupMode = false;

function renderMode() {
  $("signup-fields").hidden = !signupMode;
  $("title").textContent = t(signupMode ? "signup" : "login");
  $("sub").textContent = t(signupMode ? "subSignup" : "sub");
  $("submit").textContent = t(signupMode ? "create" : "cont");
  $("toggle").textContent = t(signupMode ? "haveAcc" : "newAcc");
  $("password").autocomplete = signupMode ? "new-password" : "current-password";
  $("msg").textContent = "";
  document.dispatchEvent(new CustomEvent("modechange"));
}

$("toggle").addEventListener("click", (e) => {
  e.preventDefault();
  signupMode = !signupMode;
  renderMode();
});
document.addEventListener("langchange", renderMode);

$("auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("msg").textContent = t("wait");
  $("submit").disabled = true;
  try {
    if (signupMode) {
      await signUp({
        name: $("name").value.trim(),
        phone: $("phone").value.trim(),
        email: $("email").value.trim(),
        password: $("password").value,
        role: $("role").value
      });
    } else {
      await logIn($("email").value.trim(), $("password").value);
    }
    const profile = await getProfile(auth.currentUser.uid);
    if (!profile) {
      $("msg").textContent = t("noProfile");
      $("submit").disabled = false;
      return;
    }
    location.href = dashboardFor(profile.role);
  } catch (err) {
    $("msg").textContent = errText(err.code);
    $("submit").disabled = false;
  }
});
