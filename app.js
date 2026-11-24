/* ==========================================================
   SjaarCie Turfmaster
   Alle data staat in Supabase; deze pagina praat alleen met
   de database-functies uit supabase/setup.sql.
   ========================================================== */

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const app = document.querySelector("#app");
const $ = (selector) => document.querySelector(selector);

const GEAR_ICON = `
  <svg viewBox="0 0 24 24" fill="none" stroke="#fff">
    <circle cx="12" cy="12" r="6.5" stroke-width="4"/>
    <circle cx="12" cy="12" r="9" stroke-width="3.2" stroke-dasharray="3.53 3.53"/>
  </svg>`;

/* ---------- State ---------- */
let crewToken = localStorage.getItem("sc_tok");     // blijft bewaard in de browser
let adminToken = sessionStorage.getItem("sc_adm");  // alleen tot de tab sluit
let logEntries = [];
let ruleList = [];

/* ---------- Helpers ---------- */
function esc(text) {
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(text ?? "").replace(/[&<>"']/g, (c) => map[c]);
}

function formatDate(isoDate) {
  return new Date(isoDate + "T12:00:00").toLocaleDateString("nl-NL", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

function toast(message, isError = false) {
  const el = $("#toast");
  el.textContent = message;
  el.className = "show" + (isError ? " error" : "");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.className = ""), 3500);
}

/** Roept een Supabase-functie aan. Bij "Niet ingelogd" gaat de gebruiker terug naar het login-scherm. */
async function rpc(name, args = {}, asAdmin = false) {
  const token = asAdmin ? adminToken : crewToken;
  const { data, error } = await db.rpc(name, { p_token: token, ...args });

  if (error) {
    if (error.message.includes("Niet ingelogd")) {
      if (asAdmin) {
        adminToken = null;
        sessionStorage.removeItem("sc_adm");
        showAdminLogin();
      } else {
        crewToken = null;
        localStorage.removeItem("sc_tok");
        showLogin();
      }
    }
    throw error;
  }
  return data;
}

/** Tekent een scherm met titel, inhoud en (optioneel) een terug-knop. */
function render(title, bodyHtml, backAction) {
  const backButton = backAction
    ? `<button class="back" onclick="${backAction}">‹ Terug</button>`
    : "";
  app.innerHTML = `
    <header class="page-header">${backButton}<h2>${title}</h2></header>
    ${bodyHtml}`;
  window.scrollTo(0, 0);
}

function heroHtml() {
  return `
    <div class="hero">
      <div class="wolf">🐺</div>
      <h1>SjaarCie</h1>
      <p>The Wolf of Sjaars Street</p>
    </div>`;
}

/** Verwijderknop die twee keer ingedrukt moet worden (met korte vertraging tegen per ongeluk dubbelklikken). */
function confirmTwice(button, action) {
  if (button.dataset.armed) {
    if (Date.now() - button.armedAt < 500) return;
    clearTimeout(button.resetTimer);
    action();
    return;
  }
  button.dataset.armed = "1";
  button.armedAt = Date.now();
  button.textContent = "Zeker weten? Klik nogmaals";
  button.classList.add("armed");
  button.resetTimer = setTimeout(() => {
    delete button.dataset.armed;
    button.textContent = "Verwijderen";
    button.classList.remove("armed");
  }, 4000);
}

/* ==========================================================
   Inloggen
   ========================================================== */
function showLogin() {
  app.innerHTML = `
    ${heroHtml()}
    <form class="card" onsubmit="handleLogin(event)">
      <label>Wachtwoord</label>
      <input id="password" type="password" autocomplete="current-password" required>
      <button class="btn">Inloggen</button>
    </form>`;
}

async function handleLogin(event) {
  event.preventDefault();
  const { data, error } = await db.rpc("login_crew", { p_wachtwoord: $("#password").value });
  if (error) return toast(error.message, true);
  if (!data) return toast("Onjuist wachtwoord", true);

  crewToken = data;
  localStorage.setItem("sc_tok", crewToken);
  showHome();
}

function showAdminLogin() {
  render("Instellingen", `
    <form class="card" onsubmit="handleAdminLogin(event)">
      <label>Admin-sleutel</label>
      <input id="admin-key" type="password" required>
      <button class="btn">Ontgrendelen</button>
    </form>`, "showHome()");
}

async function handleAdminLogin(event) {
  event.preventDefault();
  const { data, error } = await db.rpc("login_admin", { p_sleutel: $("#admin-key").value });
  if (error) return toast(error.message, true);
  if (!data) return toast("Onjuiste sleutel", true);

  adminToken = data;
  sessionStorage.setItem("sc_adm", adminToken);
  showSettings();
}

/* ==========================================================
   Startmenu en ranglijst
   ========================================================== */
function openSettings() {
  adminToken ? showSettings() : showAdminLogin();
}

function showHome() {
  app.innerHTML = `
    <button class="gear" aria-label="Instellingen" onclick="openSettings()">${GEAR_ICON}</button>
    <div class="home">
      ${heroHtml()}
      <nav class="menu">
        <button class="btn-big" onclick="showRanking()">Sjaarsen</button>
        <button class="btn-big" onclick="showForm('turf')">Turf</button>
        <button class="btn-big" onclick="showForm('bak')">Bakken</button>
      </nav>
    </div>`;
}

async function showRanking() {
  render("Sjaarsen", '<p class="muted">Laden…</p>', "showHome()");
  try {
    const people = await rpc("get_ranglijst");
    let rank = 0;
    let previousTotal = null;

    const rows = people.map((person, index) => {
      if (person.totaal !== previousTotal) {   // gelijke aantallen delen dezelfde plek
        rank = index + 1;
        previousTotal = person.totaal;
      }
      return `
        <div class="rank-row">
          <span class="rank-pos">${rank}</span>
          <span class="rank-name">${esc(person.naam)}</span>
          <span class="rank-total">${person.totaal}</span>
          <span class="muted">turfs</span>
        </div>`;
    });
    render("Sjaarsen", rows.join(""), "showHome()");
  } catch (error) {
    toast(error.message, true);
  }
}

/* ==========================================================
   Turf toevoegen / Bakken
   ========================================================== */
async function showForm(type) {
  const isBak = type === "bak";
  const title = isBak ? "Bakken" : "Turf";
  render(title, '<p class="muted">Laden…</p>', "showHome()");

  try {
    const [people, rules] = await Promise.all([
      rpc("get_ranglijst"),
      rpc("get_regels", { p_type: type }),
    ]);
    people.sort((a, b) => a.naam.localeCompare(b.naam));

    if (!rules.length) {
      return render(title,
        '<p class="muted">Er zijn nog geen regels. Voeg ze toe via de instellingen.</p>', "showHome()");
    }

    const personOptions = people.map((p) => `<option value="${p.id}">${esc(p.naam)}</option>`).join("");
    const ruleOptions = rules.map((r) =>
      `<option value="${r.id}">${esc(r.naam)} (${isBak ? "−" : "+"}${r.gewicht})</option>`).join("");

    render(title, `
      <form class="card" onsubmit="submitEntry(event, '${type}')">
        <label>Sjaars</label>
        <select id="f-person" required>
          <option value="">Kies een sjaars…</option>${personOptions}
        </select>

        <label>${isBak ? "Wat heeft hij/zij gedaan?" : "Welke regel is gebroken?"}</label>
        <select id="f-rule" required>
          <option value="">Kies een regel…</option>${ruleOptions}
        </select>

        <label>Wanneer?</label>
        <div class="day-choice">
          <label><input type="radio" name="day" value="0" checked>Vandaag</label>
          <label><input type="radio" name="day" value="1">Gisteren</label>
        </div>

        <label>Opmerking (optioneel)</label>
        <textarea id="f-comment" rows="3"></textarea>

        ${isBak ? "" : `<label>Getuigen (optioneel)</label><input id="f-witnesses">`}

        <label>Foto (optioneel)</label>
        <input id="f-photo" type="file" accept="image/*">

        <button class="btn">${isBak ? "Bakken" : "Turf toevoegen"}</button>
      </form>`, "showHome()");
  } catch (error) {
    toast(error.message, true);
  }
}

/** Verkleint een foto naar max 1280px (JPEG) zodat uploaden snel gaat. */
async function resizeImage(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
}

async function submitEntry(event, type) {
  event.preventDefault();
  const submitButton = event.submitter;
  submitButton.disabled = true;

  try {
    let imageUrl = null;
    const photo = $("#f-photo").files[0];
    if (photo) {
      const path = crypto.randomUUID() + ".jpg";
      const { error } = await db.storage.from("bewijs")
        .upload(path, await resizeImage(photo), { contentType: "image/jpeg" });
      if (error) throw error;
      imageUrl = db.storage.from("bewijs").getPublicUrl(path).data.publicUrl;
    }

    await rpc("voeg_log_toe", {
      p_sjaars: Number($("#f-person").value),
      p_regel: Number($("#f-rule").value),
      p_opmerking: $("#f-comment").value,
      p_getuigen: $("#f-witnesses")?.value ?? "",
      p_afbeelding: imageUrl,
      p_gisteren: $("input[name=day]:checked").value === "1",
    });

    toast(type === "bak" ? "Gebakken! ✅" : "Turf toegevoegd ✅");
    showHome();
  } catch (error) {
    toast(error.message, true);
    submitButton.disabled = false;
  }
}

/* ==========================================================
   Instellingen (admin)
   ========================================================== */
function showSettings() {
  render("Instellingen", `
    <div class="menu" style="gap:20px; margin-top:20px">
      <button class="btn-big" onclick="showLogs()">Logs</button>
      <button class="btn-big" onclick="showRules('turf')">Turfregels</button>
      <button class="btn-big" onclick="showRules('bak')">Bakregels</button>
      <button class="btn-small" onclick="lockAdmin()">Vergrendelen</button>
    </div>`, "showHome()");
}

function lockAdmin() {
  adminToken = null;
  sessionStorage.removeItem("sc_adm");
  showHome();
}

/* ---------- Logs ---------- */
const LOG_PAGE_SIZE = 50;

async function showLogs(loadMore = false) {
  try {
    if (!loadMore) {
      logEntries = [];
      render("Logs", `
        <div id="log-list"></div>
        <button class="btn" id="load-more" hidden onclick="showLogs(true)">Meer laden</button>`,
        "showSettings()");
    }
    const page = await rpc("admin_get_logs",
      { p_limit: LOG_PAGE_SIZE, p_offset: logEntries.length }, true);
    logEntries = logEntries.concat(page);
    renderLogs();
    $("#load-more").hidden = page.length < LOG_PAGE_SIZE;
  } catch (error) {
    toast(error.message, true);
  }
}

function renderLogs() {
  let lastDate = "";

  const html = logEntries.map((log) => {
    let dateTitle = "";
    if (log.log_datum !== lastDate) {            // één datumkop per dag
      lastDate = log.log_datum;
      dateTitle = `<h3 class="date-title">${formatDate(log.log_datum)}</h3>`;
    }
    const sign = log.type === "turf" ? "+" : "−";

    return dateTitle + `
      <div class="log ${log.type}">
        <div class="top">
          <b>${esc(log.naam)}</b>
          <span class="amount">${sign}${log.aantal}</span>
        </div>
        <div>${esc(log.regel)}</div>
        ${log.opmerking ? `<p>💬 ${esc(log.opmerking)}</p>` : ""}
        ${log.getuigen ? `<p>👀 Getuigen: ${esc(log.getuigen)}</p>` : ""}
        ${log.afbeelding_url ? `
          <a href="${esc(log.afbeelding_url)}" target="_blank">
            <img src="${esc(log.afbeelding_url)}" loading="lazy" alt="">
          </a>` : ""}
        <button class="btn-delete" onclick="confirmTwice(this, () => deleteLog(${log.id}))">Verwijderen</button>
      </div>`;
  }).join("");

  $("#log-list").innerHTML = html || '<p class="muted">Nog geen logs.</p>';
}

async function deleteLog(id) {
  try {
    await rpc("admin_verwijder_log", { p_id: id }, true);
    logEntries = logEntries.filter((log) => log.id !== id);
    renderLogs();
    toast("Log verwijderd");
  } catch (error) {
    toast(error.message, true);
  }
}

/* ---------- Regels ---------- */
async function showRules(type) {
  const isBak = type === "bak";
  try {
    ruleList = await rpc("admin_get_regels", { p_type: type }, true);

    const newRuleForm = `
      <form class="card" onsubmit="addRule(event, '${type}')">
        <h3>Nieuwe regel</h3>
        <input id="new-name" placeholder="Naam van de regel" required>
        <label>Aantal turfs (gewicht)</label>
        <input id="new-weight" type="number" min="1" value="1" required>
        <button class="btn">Toevoegen</button>
      </form>`;

    const cards = ruleList.map((rule) => {
      const usage = rule.keer
        ? `${rule.keer}× gebruikt door ${rule.personen} ${rule.personen === 1 ? "persoon" : "personen"}`
        : "0× gebruikt";
      const deleteButton = rule.keer
        ? '<button class="btn-delete" disabled>In gebruik</button>'
        : `<button class="btn-delete" onclick="confirmTwice(this, () => deleteRule(${rule.id}, '${type}'))">Verwijderen</button>`;

      return `
        <div class="card" id="rule-${rule.id}">
          <div class="top">
            <b>${esc(rule.naam)}</b>
            <span class="amount">${isBak ? "−" : "+"}${rule.gewicht}</span>
          </div>
          <small class="muted">${usage}</small>
          <div class="actions">
            <button class="btn-small" onclick="editRule(${rule.id}, '${type}')">Bewerken</button>
            ${deleteButton}
          </div>
        </div>`;
    }).join("");

    render(isBak ? "Bakregels" : "Turfregels", newRuleForm + cards, "showSettings()");
  } catch (error) {
    toast(error.message, true);
  }
}

async function addRule(event, type) {
  event.preventDefault();
  try {
    await rpc("admin_maak_regel", {
      p_type: type,
      p_naam: $("#new-name").value,
      p_gewicht: Number($("#new-weight").value),
    }, true);
    showRules(type);
  } catch (error) {
    toast(error.message, true);
  }
}

function editRule(id, type) {
  const rule = ruleList.find((r) => r.id === id);
  $("#rule-" + id).innerHTML = `
    <input id="edit-name" value="${esc(rule.naam)}">
    <input id="edit-weight" type="number" min="1" value="${rule.gewicht}">
    <small class="muted">Een nieuw gewicht geldt alleen voor nieuwe logs.</small>
    <div class="actions">
      <button class="btn-small" onclick="saveRule(${id}, '${type}')">Opslaan</button>
      <button class="btn-small" onclick="showRules('${type}')">Annuleren</button>
    </div>`;
}

async function saveRule(id, type) {
  try {
    await rpc("admin_wijzig_regel", {
      p_id: id,
      p_naam: $("#edit-name").value,
      p_gewicht: Number($("#edit-weight").value),
    }, true);
    showRules(type);
  } catch (error) {
    toast(error.message, true);
  }
}

async function deleteRule(id, type) {
  try {
    await rpc("admin_verwijder_regel", { p_id: id }, true);
    showRules(type);
  } catch (error) {
    toast(error.message, true);
  }
}

/* ==========================================================
   Start
   ========================================================== */
async function init() {
  if (!crewToken) return showLogin();
  try {
    const { data: role } = await db.rpc("sessie_rol", { p_token: crewToken });
    if (role) return showHome();
    localStorage.removeItem("sc_tok");
  } catch (_) { /* geen verbinding: val terug op login */ }
  showLogin();
}

init();
