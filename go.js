// Finds the laptop's current public link and forwards there.
// link.txt holds the link encrypted with the site password ("v1:" + base64(iv + AES-GCM)),
// because tunnel links contain the home IP. The phone keeps the derived key and a login
// token after the password is typed once.
const ROOT = window.ROOT || "";
const WHO = window.WHO || "";  // set by each person's page (mani/, arash/) so the site greets them
const API = "https://api.github.com/repos/mannyedy/3daction/contents/link.txt";
const $ = (id) => document.getElementById(id);
const store = {
  get(k) { try { return localStorage.getItem(k) || ""; } catch { return ""; } },
  set(k, v) { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch {} },
};
const TOKEN = "print_quote_token", KEY = "print_quote_key";
let tries = 0, site = "", sealed = "";

async function readLinkFile() {
  try {
    const r = await fetch(API + "?t=" + Date.now(), { cache: "no-store", headers: { Accept: "application/vnd.github.raw" } });
    if (r.ok) return (await r.text()).trim();
  } catch {}
  const r = await fetch(ROOT + "link.txt?t=" + Date.now(), { cache: "no-store" });
  return (await r.text()).trim();
}

const hex = (b) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
const unhex = (h) => new Uint8Array(h.match(/../g).map(x => parseInt(x, 16)));

async function deriveKey(password) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode("3daction-link-v1"), iterations: 200000 }, base, 256);
  return hex(bits);
}

async function openLink(text, keyHex) {
  if (/^https:\/\//.test(text)) return text;
  if (!text.startsWith("v1:") || !keyHex) throw new Error("locked");
  const raw = Uint8Array.from(atob(text.slice(3)), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", unhex(keyHex), "AES-GCM", false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12) }, key, raw.slice(12));
  return new TextDecoder().decode(plain);
}

async function health(url, token) {
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(url + "/api/health?t=" + encodeURIComponent(token), { cache: "no-store", signal: ctl.signal });
    return r.ok ? await r.json() : null;
  } catch { return null; } finally { clearTimeout(timer); }
}

function go(url, token) {
  const h = [token ? "t=" + token : "", WHO ? "n=" + WHO : ""].filter(Boolean).join("&");
  location.replace(url + "/" + (h ? "#" + h : ""));
}

function askPassword(msg) {
  $("wait").classList.add("hidden"); $("login").classList.remove("hidden");
  $("err").textContent = msg || ""; $("pw").focus();
}
function waiting(msg) {
  $("login").classList.add("hidden"); $("wait").classList.remove("hidden"); $("msg").textContent = msg;
}

async function attempt() {
  tries++;
  try {
    sealed = await readLinkFile();
    try { site = await openLink(sealed, store.get(KEY)); }
    catch { store.set(KEY, ""); return askPassword(); }  // no key yet, or the password changed
    const h = await health(site, store.get(TOKEN));
    if (h && h.ok) {
      if (h.token_ok) return go(site, store.get(TOKEN));
      store.set(TOKEN, "");
      return askPassword();
    }
  } catch {}
  waiting(tries < 3 ? "در حال پیدا کردن سایت…"
    : "لپ‌تاپ هنوز وصل نیست؛ داره دوباره وصل می‌شه. همین صفحه رو باز بذار، خودش امتحان می‌کنه…");
  setTimeout(attempt, tries < 10 ? 6000 : 15000);
}

$("login").addEventListener("submit", async (e) => {
  e.preventDefault(); $("err").textContent = "";
  const pw = $("pw").value, btn = $("login").querySelector("button");
  btn.disabled = true;
  try {
    const key = await deriveKey(pw);
    try { site = await openLink(sealed || await readLinkFile(), key); }
    catch { $("err").textContent = "رمز اشتباه است"; return; }
    store.set(KEY, key);
    // a text/plain body keeps this a simple cross-origin request (no preflight)
    const r = await fetch(site + "/api/token", { method: "POST", body: JSON.stringify({ password: pw }) });
    const d = await r.json();
    if (!r.ok) { $("err").textContent = d.error || "رمز اشتباه است"; return; }
    store.set(TOKEN, d.token); go(site, d.token);
  } catch {
    waiting("لپ‌تاپ هنوز وصل نیست؛ داره دوباره وصل می‌شه…");
    setTimeout(attempt, 6000);
  } finally { btn.disabled = false; }
});

attempt();
