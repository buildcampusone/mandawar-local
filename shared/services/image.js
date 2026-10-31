// Client-side photo prep: crop to a square, shrink and re-encode as JPEG so it can live inside the
// Firestore product document (no Firebase Storage needed). Result is always <= MAX_CHARS (see firestore.rules).
export const MAX_CHARS = 40000;

export async function photoToDataUrl(file, side = 200) {
  if (!file || !/^image\//.test(file.type)) throw new Error("Sirf photo (JPG/PNG) chunein.");
  if (file.size > 12 * 1024 * 1024) throw new Error("Photo 12 MB se chhoti ho.");
  const bmp = await loadBitmap(file);
  const w = bmp.width, h = bmp.height, s = Math.min(w, h);
  const cv = document.createElement("canvas");
  cv.width = cv.height = side;
  const cx = cv.getContext("2d");
  cx.fillStyle = "#fff";
  cx.fillRect(0, 0, side, side);
  cx.drawImage(bmp, (w - s) / 2, (h - s) / 2, s, s, 0, 0, side, side);
  for (let q = 0.78; q >= 0.3; q -= 0.12) {
    const url = cv.toDataURL("image/jpeg", q);
    if (url.length <= MAX_CHARS) return url;
  }
  throw new Error("Photo bahut bhaari hai, doosri photo try karein.");
}

function loadBitmap(file) {
  if (window.createImageBitmap) return createImageBitmap(file).catch(() => viaImg(file));
  return viaImg(file);
}
function viaImg(file) {
  return new Promise((res, rej) => {
    const u = URL.createObjectURL(file), i = new Image();
    i.onload = () => { URL.revokeObjectURL(u); res(i); };
    i.onerror = () => { URL.revokeObjectURL(u); rej(new Error("Photo khul nahi payi.")); };
    i.src = u;
  });
}
