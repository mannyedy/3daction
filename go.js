  const ROOT = window.ROOT || "";

  // The laptop writes its current public link into link.txt whenever it reconnects.
  const API = "https://api.github.com/repos/mannyedy/3daction/contents/link.txt";
  // set by each person's page (mani/, arash/) so the site greets them by name
  const WHO = window.WHO || "";
  const KEY = "print_quote_token";
  const $ = (id) => document.getElementById(id);
  const store = { get() { try { return localStorage.getItem(KEY) || ""; } catch { return ""; } },
                  set(v) { try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch {} } };
  let tries = 0, site = "";

  async function currentLink() {
    try {
      const r = await fetch(API + "?t=" + Date.now(), { cache: "no-store", headers: { Accept: "application/vnd.github.raw" } });
      if (r.ok) return (await r.text()).trim();
    } catch {}
    const r = await fetch(ROOT + "link.txt?t=" + Date.now(), { cache: "no-store" });
    return (await r.text()).trim();
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

  async function attempt() {
    tries++;
    try {
      site = await currentLink();
      if (!/^https:\/\//.test(site)) throw 0;
      const h = await health(site, store.get());
      if (h && h.ok) {
        if (h.token_ok) return go(site, store.get());
        store.set("");
        $("wait").classList.add("hidden"); $("login").classList.remove("hidden"); $("pw").focus();
        return;
      }
    } catch {}
    $("msg").textContent = tries < 3 ? "در حال پیدا کردن سایت…"
      : "لپ‌تاپ هنوز وصل نیست؛ داره دوباره وصل می‌شه. همین صفحه رو باز بذار، خودش امتحان می‌کنه…";
    setTimeout(attempt, tries < 10 ? 6000 : 15000);
  }

  $("login").addEventListener("submit", async (e) => {
    e.preventDefault(); $("err").textContent = "";
    try {
      // a text/plain body keeps this a simple cross-origin request (no preflight)
      const r = await fetch(site + "/api/token", { method: "POST", body: JSON.stringify({ password: $("pw").value }) });
      const d = await r.json();
      if (!r.ok) { $("err").textContent = d.error || "رمز اشتباه است"; return; }
      store.set(d.token); go(site, d.token);
    } catch { $("err").textContent = "اتصال برقرار نشد؛ دوباره امتحان کن"; }
  });

  attempt();
