// Single language system for the whole app (login, customer, shopkeeper, admin).
// Add new strings to BOTH `hi` and `en`. Missing keys fall back to English, then to the key itself.
//
// HTML:   <span data-i18n="key">, <input data-i18n-ph="key">, <button data-i18n-aria="key">
// JS:     t("key"), t("key", { n: 3 })  ->  "{n}" placeholders are replaced
// Event:  document "langchange" fires after every switch; re-render dynamic UI in that listener.

const STRINGS = {
  hi: {
    lang: "हिन्दी",
    // ---- login
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
    e_invalid: "ईमेल या पासवर्ड गलत है।", e_used: "यह ईमेल पहले से इस्तेमाल में है।", e_net: "इंटरनेट जाँचें और दोबारा कोशिश करें।",

    // ---- OTP + Google login
    googleBtn: "Google से जारी रखें", phoneLogin: "मोबाइल OTP से लॉगिन करें", backLogin: "← वापस लॉगिन पर",
    plTitle: "मोबाइल से लॉगिन", plSub: "अपने 10 अंकों के नंबर पर OTP पाएं", sendOtp: "OTP भेजें",
    otpTitle: "OTP डालें", otpSentTo: "6 अंकों का कोड {n} पर भेजा गया है।", otpPh: "6 अंकों का OTP", otpVerify: "वेरिफ़ाई करें",
    otpSending: "OTP भेज रहे हैं...", otpResend: "दोबारा भेजें", otpResendIn: "{s} सेकंड में दोबारा भेज सकते हैं", otpChange: "नंबर बदलें",
    prTitle: "प्रोफ़ाइल पूरी करें", prSub: "बस एक कदम बाकी है", prNeedPhone: "आपके मोबाइल नंबर पर OTP आएगा।", prFinish: "जारी रखें",
    vbText: "ऑर्डर और दुकान चलाने के लिए अपना मोबाइल नंबर वेरिफ़ाई करें।", vbBtn: "नंबर वेरिफ़ाई करें", vbTitle: "मोबाइल वेरिफ़ाई करें", vbDone: "नंबर वेरिफ़ाई हो गया।",
    needVerify: "ऑर्डर से पहले अपना मोबाइल नंबर वेरिफ़ाई करें (ऊपर पीला बैनर)।", phoneLocked: "नंबर बदलने के लिए OTP वेरिफ़िकेशन ज़रूरी है।",
    otpWait: "दोबारा भेजने के लिए {s} सेकंड रुकें।", otpPhoneLimit: "इस नंबर पर बहुत OTP भेजे जा चुके हैं। {m} मिनट बाद कोशिश करें।",
    otpDeviceLimit: "इस फ़ोन से बहुत OTP मांगे गए। {m} मिनट बाद कोशिश करें।", otpLocked: "बहुत ज़्यादा गलत कोड। {m} मिनट बाद कोशिश करें।", otpLeft: "OTP गलत है। {n} कोशिशें बाकी हैं।",
    e_phone: "सही 10 अंकों का मोबाइल नंबर डालें।", e_code: "OTP गलत है। दोबारा देखें।", e_codeExp: "OTP की मियाद खत्म। नया OTP मंगाएं।",
    e_many: "बहुत ज़्यादा कोशिशें। थोड़ी देर बाद करें।", e_quota: "आज के SMS की सीमा पूरी हो गई। बाद में कोशिश करें।",
    e_captcha: "सिक्योरिटी जाँच फ़ेल हुई। पेज रीफ़्रेश करके दोबारा कोशिश करें।",
    e_phoneUsed: "यह नंबर पहले से किसी और अकाउंट से जुड़ा है। उसी अकाउंट से लॉगिन करें।",
    e_diffCred: "इस ईमेल से पहले पासवर्ड वाला अकाउंट बना है। ईमेल और पासवर्ड से लॉगिन करें।",
    e_notAllowed: "यह लॉगिन तरीका अभी चालू नहीं है (Firebase Console में चालू करना होगा)।", e_domain: "यह वेबसाइट Firebase में अधिकृत नहीं है।",

    // ---- shell: navigation
    navShops: "दुकानें", navCart: "मेरा कार्ट", navOrders: "मेरे ऑर्डर", navAddress: "मेरा पता",
    navProducts: "मेरे प्रोडक्ट", navMyShop: "मेरी दुकान", navPending: "पेंडिंग दुकानें", navAllShops: "सभी दुकानें",
    navShopOrders: "ऑर्डर", navProfile: "मेरी प्रोफ़ाइल",
    shHome: "होम", shCart: "कार्ट", shOrders: "ऑर्डर", shProducts: "प्रोडक्ट", shShop: "दुकान",
    shPending: "पेंडिंग", shShops: "दुकानें", shAccount: "अकाउंट",
    roleCustomer: "ग्राहक", roleShopkeeper: "दुकानदार", roleAdmin: "एडमिन",
    menuOpen: "मेन्यू खोलें", mainMenu: "मुख्य मेन्यू", quickNav: "क्विक नेविगेशन",
    logout: "लॉगआउट", user: "यूज़र",

    // ---- admin: delivery partners
    navRiders: "डिलीवरी पार्टनर", shRiders: "राइडर", roleDelivery: "राइडर", navRiderJobs: "डिलीवरी ऑर्डर", shRiderJobs: "डिलीवरी",
    rdTitle: "डिलीवरी पार्टनर", rdSub: "फ़ोन नंबर या नाम से यूज़र ढूँढें और राइडर बनाएं।",
    rdTabSearch: "ढूँढें", rdTabRiders: "मौजूदा राइडर",
    rdSearchPh: "10 अंकों का फ़ोन या नाम", rdSearchBtn: "ढूँढें", rdSearching: "ढूँढ रहे हैं...",
    rdSearchHint: "ऊपर फ़ोन नंबर या नाम डालकर ढूँढें।", rdNoResult: "कोई यूज़र नहीं मिला।",
    rdBadQuery: "सही 10 अंकों का फ़ोन नंबर या कम से कम 2 अक्षर का नाम डालें।",
    rdMake: "राइडर बनाएं", rdRemove: "राइडर हटाएं",
    rdConfirmMake: "इस यूज़र को डिलीवरी पार्टनर बनाएं?", rdConfirmMakeSub: "{name} ({phone}) को राइडर का रोल मिलेगा।",
    rdConfirmRemove: "राइडर हटाएं?", rdConfirmRemoveSub: "{name} ({phone}) वापस ग्राहक बन जाएगा।",
    rdYes: "हाँ, करें", rdWorking: "हो रहा है...",
    rdMadeOk: "{name} अब राइडर है।", rdRemovedOk: "{name} अब राइडर नहीं है।",
    rdLocked: "इस रोल को यहाँ से नहीं बदला जा सकता।",
    rdRidersEmpty: "अभी कोई राइडर नहीं है।", rdLoading: "लोड हो रहा है...", rdLoadFail: "लोड नहीं हुआ।", rdRetry: "दोबारा कोशिश करें",
    rdActive: "सक्रिय",
    rdErrActive: "राइडर की डिलीवरी चल रही है। पहले उसे पूरा होने दें।",
    rdErrSelf: "अपना खुद का रोल नहीं बदल सकते।", rdErrProtected: "इस यूज़र का रोल यहाँ से नहीं बदला जा सकता।",
    rdErrAlready: "यह पहले से राइडर है।", rdErrNotRider: "यह राइडर नहीं है।", rdErrNotFound: "यूज़र नहीं मिला।",
    rdErrPerm: "सिर्फ़ एडमिन यह कर सकता है। दोबारा लॉगिन करें।",
    rdErrNet: "इंटरनेट जाँचें और दोबारा कोशिश करें।", rdErrGeneric: "कुछ गड़बड़ हुई। दोबारा कोशिश करें।",

    // ---- profile screen
    profile: "प्रोफ़ाइल",
    secShopping: "खरीदारी", secPrefs: "पसंद और प्राइवेसी", secSupport: "सहायता",
    myOrders: "मेरे ऑर्डर", myOrdersSub: "ट्रैक करें, दोबारा ऑर्डर करें और इतिहास देखें",
    savedAddress: "सेव किया पता", savedAddressSub: "घर और डिलीवरी के दूसरे पते",
    chooseLang: "ऐप की भाषा चुनें", changeLang: "भाषा बदलें",
    accPrivacy: "अकाउंट प्राइवेसी", accPrivacySub: "अपना डेटा और अनुमतियाँ संभालें",
    help: "सहायता और सपोर्ट", helpSub: "ऑर्डर में मदद पाएं",
    rate: "ऐप को रेट करें", rateSub: "अपना अनुभव बताएं",
    about: "ऐप के बारे में", aboutSub: "पॉलिसी, कंपनी और ऐप की जानकारी",
    mobile: "मोबाइल", address: "पता", notSaved: "अभी सेव नहीं है",
    editProfile: "प्रोफ़ाइल बदलें", editAria: "प्रोफ़ाइल बदलें",
    save: "सेव करें", cancel: "रद्द करें", close: "बंद करें", saved: "सेव हो गया।", saveFail: "सेव नहीं हुआ: ",
    badName: "नाम 2 से 60 अक्षर का होना चाहिए।", badPhone: "सही 10 अंकों का मोबाइल नंबर डालें।",
    version: "संस्करण",

    // ---- language sheet
    langTitle: "ऐप की भाषा", langHint: "चुनी हुई भाषा पूरे ऐप में लागू होगी।",

    // ---- privacy sheet
    privTitle: "अकाउंट प्राइवेसी",
    privIntro: "आपकी ये जानकारी हमारे पास सेव है:",
    privNote: "आपका नाम, मोबाइल, ईमेल और पता सिर्फ ऑर्डर और अकाउंट चलाने के लिए इस्तेमाल होता है।",
    privDownload: "मेरा डेटा डाउनलोड करें", privDownloaded: "डेटा डाउनलोड हो गया।",
    privDeleteHint: "अकाउंट हटवाने के लिए सहायता और सपोर्ट से संपर्क करें।",

    // ---- help sheet
    helpTitle: "सहायता और सपोर्ट",
    helpIntro: "ऑर्डर में कोई दिक्कत हो तो हमसे संपर्क करें।",
    helpCall: "कॉल करें", helpWhatsapp: "WhatsApp पर बात करें", helpEmail: "ईमेल भेजें",
    helpNoContact: "सपोर्ट संपर्क जल्द जोड़ा जाएगा। तब तक ऑर्डर के बारे में सीधे दुकानदार से बात करें।",

    // ---- rate sheet
    rateTitle: "ऐप को रेट करें", rateAsk: "Mandawar आपको कैसा लगा?",
    rateComment: "अपना अनुभव लिखें (वैकल्पिक)", rateSend: "भेजें",
    ratePick: "पहले स्टार चुनें।", rateThanks: "धन्यवाद! आपका फीडबैक मिल गया।",
    starAria: "{n} स्टार",

    // ---- about sheet
    aboutTitle: "Mandawar के बारे में",
    aboutText: "Mandawar आपके शहर की दुकानों को एक ऐप में लाता है, ताकि आप घर बैठे ऑर्डर कर सकें।",
    aboutPlace: "स्थान",

    // ---- nearby dashboard (Phase 3A)
    nbDeliverTo: "डिलीवरी का स्थान", nbChange: "बदलें", nbLocGps: "आपकी मौजूदा लोकेशन", nbLocManual: "चुनी हुई लोकेशन", nbLocSaved: "सेव की हुई लोकेशन",
    nbSearchPh: "आस-पास की दुकानें खोजें", nbAllCats: "सभी", nbMap: "नक्शा", nbList: "सूची", nbShowOnMap: "नक्शे पर देखें",
    nbNeedTitle: "देखें कौन-सी दुकानें आपके यहाँ डिलीवर करती हैं",
    nbNeedBody: "आस-पास की दुकानें और उनका डिलीवरी क्षेत्र दिखाने के लिए एक बार लोकेशन की अनुमति दें। हम बैकग्राउंड में आपको ट्रैक नहीं करते।",
    nbAllow: "मेरी लोकेशन इस्तेमाल करें", nbPickMap: "नक्शे पर चुनें", nbBrowseAll: "सभी दुकानें देखें",
    nbLocating: "आपकी लोकेशन ढूँढ रहे हैं…", nbCancel: "रद्द करें", nbRetry: "दोबारा कोशिश करें",
    nbProblemTitle: "लोकेशन नहीं मिल पाई", nbLoadingA11y: "आस-पास की दुकानें लोड हो रही हैं",
    nbErrTitle: "आस-पास की दुकानें लोड नहीं हो पाईं", nbErrBody: "इंटरनेट जाँचें और दोबारा कोशिश करें। इसका मतलब यह नहीं कि पास में दुकानें नहीं हैं।",
    nbEmptyTitle: "आपके आस-पास अभी कोई दुकान नहीं मिली", nbEmptyBody: "इस लोकेशन के पास अभी कोई मंज़ूर की हुई दुकान तैयार नहीं है। दूसरी लोकेशन आज़माएँ या सभी दुकानें देखें।",
    nbEmptySearchTitle: "कोई दुकान मेल नहीं खाती", nbEmptySearchBody: "खोज या कैटेगरी बदलकर देखें।", nbClearFilters: "फ़िल्टर हटाएँ",
    nbSummary: "{n} दुकानें आपके यहाँ डिलीवर करती हैं", nbSummaryOther: "{n} पास की दुकानें अभी उपलब्ध नहीं", nbNoneDeliver: "अभी कोई दुकान आपके यहाँ डिलीवर नहीं करती",
    nbDistNote: "दूरी सीधी रेखा में है, सड़क से नहीं।", nbTruncated: "इस इलाके की कुछ दुकानें सूची में नहीं दिख रही होंगी।",
    nbMapUnavailable: "नक्शा लोड नहीं हुआ। अभी सिर्फ़ सूची दिख रही है।",
    nbStatus_DELIVERABLE: "आपके यहाँ डिलीवर करती है", nbStatus_CLOSED: "अभी बंद है", nbStatus_OUTSIDE_DELIVERY_AREA: "डिलीवरी क्षेत्र से बाहर",
    nbStatus_TEMPORARILY_UNAVAILABLE: "डिलीवरी अभी रुकी है", nbStatus_DELIVERY_UNAVAILABLE: "डिलीवरी नहीं करती", nbStatus_LOCATION_UNAVAILABLE: "दुकान की लोकेशन तय नहीं",
    nbStatus_PENDING_APPROVAL: "उपलब्ध नहीं",
    nbAway: "{d} दूर", nbFee: "डिलीवरी {n}", nbFeeFree: "फ़्री डिलीवरी", nbMinOrder: "कम से कम ऑर्डर {n}", nbPrep: "तैयारी ~{n} मिनट", nbRadius: "{n} किमी तक डिलीवरी",
    nbView: "सामान देखें", nbSelectedShop: "चुनी हुई दुकान",
    navNearby: "आस-पास", shNearby: "आस-पास",
    nbLocDenied: "लोकेशन की अनुमति नहीं मिली। फ़ोन की सेटिंग में अनुमति देकर दोबारा कोशिश करें।",
    nbLocUnavailable: "इस फ़ोन पर लोकेशन उपलब्ध नहीं है। GPS चालू करके दोबारा कोशिश करें।",
    nbLocTimeout: "लोकेशन मिलने में बहुत समय लगा। दोबारा कोशिश करें।", nbLocError: "लोकेशन पढ़ते समय गड़बड़ हुई। दोबारा कोशिश करें।",

    // ---- shopkeeper: delivery & location settings
    ssTitle: "डिलीवरी और लोकेशन",
    ssIntro: "ग्राहकों को आपकी दुकान \"आस-पास\" में तभी डिलीवर करती दिखेगी जब यहाँ लोकेशन और डिलीवरी सेट होगी।",
    ssOpen: "दुकान अभी खुली है", ssDelivery: "होम डिलीवरी करते हैं", ssPaused: "डिलीवरी अभी रोकें",
    ssRadius: "डिलीवरी दूरी (किमी)", ssFee: "डिलीवरी चार्ज (Rs)", ssMin: "कम से कम ऑर्डर (Rs)", ssPrep: "तैयारी का समय (मिनट)",
    ssUseGps: "दुकान की लोकेशन सेट करें", ssGpsHint: "दुकान में खड़े होकर दबाएँ, ताकि लोकेशन सही आए।",
    ssLocSet: "दुकान की लोकेशन सेट है", ssLocNotSet: "दुकान की लोकेशन अभी सेट नहीं है", ssLocating: "लोकेशन ढूँढ रहे हैं…",
    ssAccuracy: "सटीकता लगभग {n} मीटर", ssSave: "सेव करें", ssSaved: "सेव हो गया।", ssNeedLoc: "डिलीवरी चालू करने से पहले दुकान की लोकेशन सेट करें।",
    ssBadRadius: "डिलीवरी दूरी 0.5 से 50 किमी के बीच होनी चाहिए।", ssBadFee: "डिलीवरी चार्ज 0 से 500 के बीच होना चाहिए।",
    ssBadMin: "कम से कम ऑर्डर 0 से 10000 के बीच होना चाहिए।", ssBadPrep: "तैयारी का समय 0 से 240 मिनट के बीच पूरा अंक होना चाहिए।",
  },

  en: {
    lang: "English",
    // ---- login
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
    e_invalid: "Wrong email or password.", e_used: "This email is already in use.", e_net: "Check your internet and try again.",

    // ---- OTP + Google login
    googleBtn: "Continue with Google", phoneLogin: "Login with mobile OTP", backLogin: "← Back to login",
    plTitle: "Login with mobile", plSub: "Get an OTP on your 10-digit number", sendOtp: "Send OTP",
    otpTitle: "Enter OTP", otpSentTo: "A 6-digit code was sent to {n}.", otpPh: "6-digit OTP", otpVerify: "Verify",
    otpSending: "Sending OTP...", otpResend: "Resend", otpResendIn: "You can resend in {s}s", otpChange: "Change number",
    prTitle: "Complete your profile", prSub: "One last step", prNeedPhone: "We will send an OTP to your mobile number.", prFinish: "Continue",
    vbText: "Verify your mobile number to place orders and run a shop.", vbBtn: "Verify number", vbTitle: "Verify mobile number", vbDone: "Number verified.",
    needVerify: "Verify your mobile number before ordering (yellow banner above).", phoneLocked: "Changing the number needs OTP verification.",
    otpWait: "Please wait {s}s before requesting another OTP.", otpPhoneLimit: "Too many OTPs sent to this number. Try again in {m} min.",
    otpDeviceLimit: "Too many OTP requests from this phone. Try again in {m} min.", otpLocked: "Too many wrong codes. Try again in {m} min.", otpLeft: "Wrong OTP. {n} tries left.",
    e_phone: "Enter a valid 10-digit mobile number.", e_code: "Wrong OTP. Check and try again.", e_codeExp: "OTP expired. Request a new one.",
    e_many: "Too many attempts. Try again later.", e_quota: "Today's SMS limit is reached. Try again later.",
    e_captcha: "Security check failed. Refresh the page and try again.",
    e_phoneUsed: "This number is already linked to another account. Log in to that account.",
    e_diffCred: "A password account already exists for this email. Log in with email and password.",
    e_notAllowed: "This login method is not enabled yet (enable it in Firebase Console).", e_domain: "This website is not authorised in Firebase.",

    // ---- shell: navigation
    navShops: "Shops", navCart: "My Cart", navOrders: "My Orders", navAddress: "My Address",
    navProducts: "My Products", navMyShop: "My Shop", navPending: "Pending Shops", navAllShops: "All Shops",
    navShopOrders: "Orders", navProfile: "My Profile",
    shHome: "Home", shCart: "Cart", shOrders: "Orders", shProducts: "Products", shShop: "Shop",
    shPending: "Pending", shShops: "Shops", shAccount: "Account",
    roleCustomer: "Customer", roleShopkeeper: "Shopkeeper", roleAdmin: "Admin",
    menuOpen: "Open menu", mainMenu: "Main menu", quickNav: "Quick navigation",
    logout: "Logout", user: "User",

    // ---- admin: delivery partners
    navRiders: "Delivery Partners", shRiders: "Riders", roleDelivery: "Rider", navRiderJobs: "Deliveries", shRiderJobs: "Deliveries",
    rdTitle: "Delivery partners", rdSub: "Find a user by phone number or name and make them a rider.",
    rdTabSearch: "Search", rdTabRiders: "Current riders",
    rdSearchPh: "10-digit phone or name", rdSearchBtn: "Search", rdSearching: "Searching...",
    rdSearchHint: "Enter a phone number or name above to search.", rdNoResult: "No user found.",
    rdBadQuery: "Enter a valid 10-digit phone number or a name of at least 2 letters.",
    rdMake: "Make rider", rdRemove: "Remove rider",
    rdConfirmMake: "Make this user a delivery partner?", rdConfirmMakeSub: "{name} ({phone}) will get the rider role.",
    rdConfirmRemove: "Remove this rider?", rdConfirmRemoveSub: "{name} ({phone}) will go back to being a customer.",
    rdYes: "Yes, do it", rdWorking: "Working...",
    rdMadeOk: "{name} is now a rider.", rdRemovedOk: "{name} is no longer a rider.",
    rdLocked: "This role can't be changed here.",
    rdRidersEmpty: "No riders yet.", rdLoading: "Loading...", rdLoadFail: "Couldn't load.", rdRetry: "Try again",
    rdActive: "Active",
    rdErrActive: "This rider has a delivery in progress. Let it finish first.",
    rdErrSelf: "You can't change your own role.", rdErrProtected: "This user's role can't be changed here.",
    rdErrAlready: "This user is already a rider.", rdErrNotRider: "This user is not a rider.", rdErrNotFound: "User not found.",
    rdErrPerm: "Only an admin can do this. Please log in again.",
    rdErrNet: "Check your internet and try again.", rdErrGeneric: "Something went wrong. Please try again.",

    // ---- profile screen
    profile: "Profile",
    secShopping: "Shopping", secPrefs: "Preferences & Privacy", secSupport: "Support",
    myOrders: "My Orders", myOrdersSub: "Track, reorder and view history",
    savedAddress: "Saved Address", savedAddressSub: "Home and other delivery locations",
    chooseLang: "Choose App Language", changeLang: "Change language",
    accPrivacy: "Account Privacy", accPrivacySub: "Control your data and permissions",
    help: "Help and Support", helpSub: "Get help with an order",
    rate: "Rate Mandawar", rateSub: "Tell us about your experience",
    about: "About Mandawar", aboutSub: "Policies, company and app details",
    mobile: "Mobile", address: "Address", notSaved: "Not saved yet",
    editProfile: "Edit profile", editAria: "Edit profile",
    save: "Save", cancel: "Cancel", close: "Close", saved: "Saved.", saveFail: "Could not save: ",
    badName: "Name must be 2 to 60 characters.", badPhone: "Enter a valid 10-digit mobile number.",
    version: "Version",

    // ---- language sheet
    langTitle: "App language", langHint: "The language you pick applies across the whole app.",

    // ---- privacy sheet
    privTitle: "Account Privacy",
    privIntro: "This is the information we have saved about you:",
    privNote: "Your name, mobile, email and address are used only to run your orders and account.",
    privDownload: "Download my data", privDownloaded: "Data downloaded.",
    privDeleteHint: "To delete your account, please contact Help and Support.",

    // ---- help sheet
    helpTitle: "Help and Support",
    helpIntro: "Facing a problem with an order? Get in touch with us.",
    helpCall: "Call us", helpWhatsapp: "Chat on WhatsApp", helpEmail: "Send an email",
    helpNoContact: "Support contact will be added soon. Until then, reach out to the shopkeeper directly about your order.",

    // ---- rate sheet
    rateTitle: "Rate Mandawar", rateAsk: "How is your experience with Mandawar?",
    rateComment: "Write your feedback (optional)", rateSend: "Submit",
    ratePick: "Please pick a star rating first.", rateThanks: "Thank you! We received your feedback.",
    starAria: "{n} star(s)",

    // ---- about sheet
    aboutTitle: "About Mandawar",
    aboutText: "Mandawar brings every local shop in your town into one app, so you can order from home.",
    aboutPlace: "Location",

    // ---- nearby dashboard (Phase 3A)
    nbDeliverTo: "Delivering to", nbChange: "Change", nbLocGps: "Your current location", nbLocManual: "Pinned location", nbLocSaved: "Saved location",
    nbSearchPh: "Search shops nearby", nbAllCats: "All", nbMap: "Map", nbList: "List", nbShowOnMap: "Show on map",
    nbNeedTitle: "See which shops deliver to you",
    nbNeedBody: "Allow your location once so we can show nearby shops and their delivery areas. We never track you in the background.",
    nbAllow: "Use my location", nbPickMap: "Choose on map", nbBrowseAll: "Browse all shops",
    nbLocating: "Finding your location…", nbCancel: "Cancel", nbRetry: "Try again",
    nbProblemTitle: "Couldn't get your location", nbLoadingA11y: "Loading nearby shops",
    nbErrTitle: "Couldn't load nearby shops", nbErrBody: "Check your connection and try again. This does not mean there are no shops nearby.",
    nbEmptyTitle: "No shops found near you yet", nbEmptyBody: "No approved shop is set up around this location yet. Try another location or browse all shops.",
    nbEmptySearchTitle: "No shop matches", nbEmptySearchBody: "Try a different search or category.", nbClearFilters: "Clear filters",
    nbSummary: "{n} shops deliver to you", nbSummaryOther: "{n} nearby shops not available right now", nbNoneDeliver: "No shop delivers to you right now",
    nbDistNote: "Distances are straight-line, not by road.", nbTruncated: "Some shops in this area may not be listed.",
    nbMapUnavailable: "The map could not load. Showing the list only.",
    nbStatus_DELIVERABLE: "Delivers to you", nbStatus_CLOSED: "Closed now", nbStatus_OUTSIDE_DELIVERY_AREA: "Outside delivery area",
    nbStatus_TEMPORARILY_UNAVAILABLE: "Delivery paused", nbStatus_DELIVERY_UNAVAILABLE: "Delivery not offered", nbStatus_LOCATION_UNAVAILABLE: "Shop location not set",
    nbStatus_PENDING_APPROVAL: "Not available",
    nbAway: "{d} away", nbFee: "Delivery {n}", nbFeeFree: "Free delivery", nbMinOrder: "Min order {n}", nbPrep: "Prep ~{n} min", nbRadius: "Delivers within {n} km",
    nbView: "View items", nbSelectedShop: "Selected shop",
    navNearby: "Nearby", shNearby: "Nearby",
    nbLocDenied: "Location permission was not given. Allow it in your phone settings and try again.",
    nbLocUnavailable: "Location is not available on this phone. Turn on GPS and try again.",
    nbLocTimeout: "Getting your location took too long. Please try again.", nbLocError: "Something went wrong reading your location. Please try again.",

    // ---- shopkeeper: delivery & location settings
    ssTitle: "Delivery and location",
    ssIntro: "Customers see your shop as delivering to them in Nearby only after you set its location and delivery here.",
    ssOpen: "Shop is open now", ssDelivery: "We offer home delivery", ssPaused: "Pause delivery for now",
    ssRadius: "Delivery distance (km)", ssFee: "Delivery charge (Rs)", ssMin: "Minimum order (Rs)", ssPrep: "Preparation time (minutes)",
    ssUseGps: "Set shop location", ssGpsHint: "Press this while standing inside your shop so the location is accurate.",
    ssLocSet: "Shop location is set", ssLocNotSet: "Shop location is not set yet", ssLocating: "Finding location…",
    ssAccuracy: "Accuracy about {n} m", ssSave: "Save", ssSaved: "Saved.", ssNeedLoc: "Set the shop location before turning delivery on.",
    ssBadRadius: "Delivery distance must be between 0.5 and 50 km.", ssBadFee: "Delivery charge must be between 0 and 500.",
    ssBadMin: "Minimum order must be between 0 and 10000.", ssBadPrep: "Preparation time must be a whole number from 0 to 240 minutes.",
  }
};

const KEY = "ml-lang";
let lang = "hi";
try { const s = localStorage.getItem(KEY); if (s === "hi" || s === "en") lang = s; } catch {}

export const LANGS = [
  { code: "hi", name: "हिन्दी" },
  { code: "en", name: "English" }
];

export const getLang = () => lang;
export const langName = (code = lang) => (LANGS.find((l) => l.code === code) || LANGS[0]).name;

export function t(k, vars) {
  let s = STRINGS[lang]?.[k] ?? STRINGS.en[k] ?? k;
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, v) => (vars[v] != null ? vars[v] : ""));
  return s;
}

export function errText(code = "") {
  if (/popup-closed-by-user|cancelled-popup-request/.test(code)) return "";
  if (/invalid-phone-number|app\/bad-phone/.test(code)) return t("e_phone");
  if (/invalid-verification-code/.test(code)) return t("e_code");
  if (/code-expired|session-expired/.test(code)) return t("e_codeExp");
  if (/too-many-requests/.test(code)) return t("e_many");
  if (/quota-exceeded/.test(code)) return t("e_quota");
  if (/captcha|app-credential|app-not-authorized/.test(code)) return t("e_captcha");
  if (/credential-already-in-use|phone-number-already-exists|provider-already-linked/.test(code)) return t("e_phoneUsed");
  if (/account-exists-with-different-credential/.test(code)) return t("e_diffCred");
  if (/operation-not-allowed/.test(code)) return t("e_notAllowed");
  if (/unauthorized-domain/.test(code)) return t("e_domain");
  if (/invalid-credential|wrong-password|user-not-found|invalid-email/.test(code)) return t("e_invalid");
  if (/email-already-in-use/.test(code)) return t("e_used");
  if (/network/.test(code)) return t("e_net");
  return t("err") + code;
}

export function applyLang() {
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));
  document.querySelectorAll("[data-i18n-ph]").forEach((el) => (el.placeholder = t(el.dataset.i18nPh)));
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => el.setAttribute("aria-label", t(el.dataset.i18nAria)));
  document.dispatchEvent(new CustomEvent("langchange"));
}

export function setLang(code) {
  if (code !== "hi" && code !== "en") return;
  lang = code;
  try { localStorage.setItem(KEY, lang); } catch {}
  applyLang();
}

export const toggleLang = () => setLang(lang === "hi" ? "en" : "hi");
