// "Give it a secret": the public page's offering panel. The text is encoded here (web/offering.js, the same bytes as
// `python3 -m kiosk qr`) into a ZIP-321 payment request to the choir, shown as a QR and a zcash: link for the
// visitor's own wallet. Nothing is sent from this page: no request carries the text; the visitor's wallet sends it.
// Testnet only. The choir address and amount come from static.json (written by scripts/build_web.sh from
// config/choir.json); without them (the installation, which has its kiosk) the panel stays closed.
"use strict";

window.Give = (() => {
  const $ = (id) => document.getElementById(id);
  let choir = null, offering = null, lastPending = null;

  function enable(c) {
    if (!c || !Offering.isUnifiedAddress(c.address) || !(c.amount_zat > 0)) return;
    choir = c;
    for (const b of document.querySelectorAll(".give_open")) b.hidden = false;
    $("give_amount").textContent = `${Offering.zatToZec(c.amount_zat)} ${c.network === "test" ? "TAZ" : "ZEC"}`;
    $("give_net").textContent = c.network === "test" ? "Zcash testnet only" : "Zcash mainnet";
    if (location.hash === "#give") open();   // a deep link for posters and QR codes (a fragment: never sent to a server)
  }

  function open() { if (!choir) return; $("give").classList.add("on"); $("give_text").focus({ preventScroll: true }); update(); }
  function close() { $("give").classList.remove("on"); }

  // live budget: one memo is one scannable QR; up to three memos still work as a link
  function update() {
    const text = $("give_text").value.trim(), reply = $("give_reply").value.trim();
    let note = "", ok = !!text;
    if (reply) {
      try { Offering.checkReplyTo(reply, choir.network); $("give_reply_note").textContent = "a whisper back will go to this address"; }
      catch (e) { $("give_reply_note").textContent = e.message; ok = false; }
    } else $("give_reply_note").textContent = "";
    const room = Offering.oneMemoRoom(reply ? new TextEncoder().encode(reply).length : 0);
    const used = Offering.utf8(text).length;
    note = used <= room ? `${used} / ${room} bytes: fits one QR` : `${used} bytes: too long for one QR, the link still works (up to 3 memos)`;
    $("give_count").textContent = text ? note : `up to ${room} bytes fit one QR`;
    $("give_make").disabled = !(ok && $("give_read").checked);
  }

  function make() {
    $("give_error").textContent = "";
    try {
      const asGod = $("give_asgod").checked;              // the false prophet: kind 3, never a reply address
      offering = Offering.makeOffering(choir, $("give_text").value, asGod ? null : ($("give_reply").value.trim() || null),
                                       Offering.newContribId(window.crypto), { asGod });
    } catch (e) { $("give_error").textContent = e.message; return; }
    const link = $("give_link");
    link.href = offering.uri; link.textContent = "open in a wallet on this device";
    $("give_cid").textContent = String(offering.contribId);
    // the pending eye: only the number and the time are kept, in this browser (web/pending.js); never the text
    let store = null; try { store = window.localStorage; } catch (e) { store = null; }
    // one visitor, one pending eye: a remade request replaces the one this panel made before. A forgery never gets an
    // eye of its own (the renderer refuses it), so it leaves no pending eye either.
    const pkey = window.Pending ? Pending.keyFor(choir.address) : "";
    if (store && window.Pending && lastPending !== null) Pending.remove(store, lastPending, Date.now(), pkey);
    lastPending = null;
    if (store && window.Pending && !offering.asGod) { Pending.add(store, offering.contribId, Date.now(), pkey); lastPending = offering.contribId; }
    if (store && window.Pending) dispatchEvent(new Event("pending-changed"));
    $("give_forget").hidden = lastPending === null; $("give_forgotten").hidden = true;
    $("give_as_offering").hidden = offering.asGod; $("give_as_god").hidden = !offering.asGod;
    $("give_find").href = `#offering=${offering.contribId}`;   // a fragment: the number never reaches a server
    $("give_memos").textContent = offering.chunks === 1 ? "one memo" : `${offering.chunks} memos (one payment request)`;
    drawQR(offering.chunks === 1 ? offering.uri : null);
    $("give_result").hidden = false;
    $("give_result").scrollIntoView({ block: "nearest" });
  }

  function drawQR(uri) {
    const cv = $("give_qr"), note = $("give_qr_note");
    if (!uri || typeof qrcode !== "function") {
      cv.hidden = true; note.textContent = uri ? "" : "Too long for one QR code: open the link on the device that holds your wallet, or shorten the secret.";
      return;
    }
    const q = qrcode(0, "M"); q.addData(uri, "Byte"); q.make();
    const n = q.getModuleCount(), quiet = 4, px = Math.max(2, Math.floor(Math.min(320, innerWidth - 64) / (n + 2 * quiet)));
    const size = (n + 2 * quiet) * px;
    cv.width = cv.height = size; cv.style.width = cv.style.height = `${size}px`;
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, size, size); ctx.fillStyle = "#000";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) ctx.fillRect((c + quiet) * px, (r + quiet) * px, px, px);
    cv.hidden = false; note.textContent = "Scan it with a testnet wallet (Zingo! works) and send.";
  }

  async function copyLink(btn) {
    if (!offering) return;
    try { await navigator.clipboard.writeText(offering.uri); btn.textContent = "copied"; } catch (e) { btn.textContent = "copy failed: use the link"; }
    setTimeout(() => { btn.textContent = "copy the request"; }, 2500);
  }

  function init() {
    for (const b of document.querySelectorAll(".give_open")) b.addEventListener("click", open);
    $("give_close").addEventListener("click", close);
    $("give_find").addEventListener("click", close);   // the finder then takes over the fragment
    addEventListener("hashchange", () => { if (location.hash === "#give") open(); });   // #give on an open page
    for (const id of ["give_text", "give_reply"]) $(id).addEventListener("input", () => { $("give_result").hidden = true; update(); });
    $("give_read").addEventListener("change", update);
    $("give_asgod").addEventListener("change", () => {   // speaking as the god: no reply address, and the button says so
      const g = $("give_asgod").checked;
      $("give_reply").disabled = g; if (g) $("give_reply").value = "";
      $("give_make").textContent = g ? "make the false prophet's request" : "make the payment request";
      $("give_result").hidden = true; update();
    });
    $("give_make").addEventListener("click", make);
    $("give_copy").addEventListener("click", () => copyLink($("give_copy")));
    $("give_forget").addEventListener("click", () => {   // anyone using this browser could see which offering is yours
      let store = null; try { store = window.localStorage; } catch (e) { store = null; }
      if (store && window.Pending && lastPending !== null) Pending.remove(store, lastPending, Date.now(), Pending.keyFor(choir.address));
      lastPending = null; $("give_forget").hidden = true; $("give_forgotten").hidden = false;
      dispatchEvent(new Event("pending-changed"));
    });
    addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  }
  return { init, enable, open, close };
})();
