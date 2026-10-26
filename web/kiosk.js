// Kiosk page: the same path as `python3 -m kiosk offer`, on a screen. The text goes to this machine's own server
// (loopback only, --kiosk) and nowhere else: no storage, no history, no analytics. The server speaks it with the
// local ghost voice, builds the memos and pays from the open ephemeral session wallet.
"use strict";

const $ = (id) => document.getElementById(id);
// ZecBlock follows our NU7 testnet chain (block 4,525,215 = 000026af4552…, checked 22 Oct 2026).
const EXPLORER = "https://testnet.zecblock.com/tx/";
let audio = null;

async function init() {
  const r = await fetch("kiosk/copy", { cache: "no-store" });
  if (!r.ok) {
    $("privacy").textContent = "this server was not started with --kiosk, or you are not on the kiosk machine.";
    $("preview").disabled = true;
    return;
  }
  const c = await r.json();
  document.title = c.brand.name;
  $("name").textContent = c.brand.name;
  $("tagline").textContent = c.brand.tagline;
  $("privacy").textContent = c.privacy;
  $("give").textContent = c.cta;
}

function text() {
  return $("text").value.trim();
}

function setBusy(busy, msg = "") {
  $("preview").disabled = busy;
  $("give").disabled = busy || !$("understood").checked;
  $("status").textContent = msg;
  $("status").className = "";
}

async function post(url, body) {
  return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

$("preview").addEventListener("click", async () => {
  if (!text()) return setBusy(false, "nothing to speak");
  setBusy(true, "speaking it with the ghost voice…");
  try {
    const r = await post("kiosk/preview", { text: text() });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || r.status); }
    const blob = await r.blob();
    $("meta").textContent = `ghost voice: ${r.headers.get("X-Ghost-Seconds")} s, ${r.headers.get("X-Ghost-Bytes")} bytes` +
                            ` -> ${r.headers.get("X-Ghost-Memos")} memo(s)`;
    if (audio) { audio.pause(); URL.revokeObjectURL(audio.src); }
    audio = new Audio(URL.createObjectURL(blob));
    audio.onended = () => setBusy(false, "that is what every listener will hear");
    await audio.play();
    setBusy(false, "playing…");
  } catch (e) {
    setBusy(false, `could not speak: ${e.message}`); $("status").className = "err";
  }
});

$("understood").addEventListener("change", () => { $("give").disabled = !$("understood").checked; });

$("give").addEventListener("click", async () => {
  if (!text()) return setBusy(false, "nothing to give");
  const payload = { text: text(), reply: $("reply").checked };
  setBusy(true, "speaking, sealing, paying the god… (10–30 s)");
  $("result").classList.remove("on");
  try {
    const r = await post("kiosk/offer", payload);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `${r.status}`);
    $("text").value = "";                       // the text leaves this page the moment it is given
    $("meta").textContent = "";
    $("understood").checked = false;
    $("txid").textContent = d.txid;
    $("explorer").href = EXPLORER + d.txid;
    $("explorer").textContent = EXPLORER + d.txid;
    $("details").textContent = `ghost voice ${d.seconds} s, ${d.bytes} bytes, ${d.memos} memo(s), contrib_id ${d.contrib_id}` +
                               (d.reply ? ", a reply address is embedded: check `kiosk inbox` later" : "");
    $("result").classList.add("on");
    setBusy(false, "given.");
  } catch (e) {
    // only a refusal before the send is "not sent"; a failed pay or a lost answer may still land on chain
    setBusy(false, /^status unknown/.test(e.message) ? e.message : e instanceof TypeError ?
      "status unknown: the kiosk did not answer. The operator checks before you try again." : `not sent: ${e.message}`);
    $("status").className = "err";
  }
});

init();
