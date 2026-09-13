/* =========================================================
   Hijri Calendar — Bangladesh
   Anchor-based Hijri month renderer.

   HOW IT WORKS
   ------------
   Because real Hijri months start on locally-sighted moons
   (not a fixed astronomical formula), this app is driven by
   an "anchor": a known Hijri month + its confirmed Gregorian
   start date. Everything else is computed from that anchor
   using a 30-day / 29-day alternating pattern (the standard
   tabular approximation), which you can further correct by
   simply setting a new anchor whenever a new month's start
   is announced.

   To change the default anchor, edit DEFAULT_ANCHOR below.
   Users can also set their own anchor from the Settings
   dialog; their choice is saved to localStorage and marked
   as "customized" (so we stop showing the "Bangladesh
   default" label).
========================================================= */

const HIJRI_MONTHS_EN = [
  "Muharram", "Safar", "Rabi al-Awwal", "Rabi al-Aakhir",
  "Jumada al-Ula", "Jumad-us-Saani", "Rajab", "Shaban",
  "Ramadan", "Shawwal", "Dhul-Qadah", "Dhul-Hijjah"
];

const HIJRI_MONTHS_BN = [
  "মুহাররম", "সফর", "রবিউল আউয়াল", "রবিউস সানি",
  "জমাদিউল আউয়াল", "জমাদিউস সানি", "রজব", "শাবান",
  "রমজান", "শাওয়াল", "জিলক্বদ", "জিলহজ্জ"
];

// Traditional alternating month lengths (30 for odd months, 29 for even),
// used only as a fallback pattern between confirmed anchors.
function hijriMonthLength(monthNumber1to12) {
  return monthNumber1to12 % 2 === 1 ? 30 : 29;
}

// Default anchor: Rabi al-Aakhir (4th month) 1448 AH started 12 Sep 2026.
const DEFAULT_ANCHOR = {
  hijriMonth: 4,
  hijriYear: 1448,
  gregStart: "2026-09-13" // YYYY-MM-DD, first day of that Hijri month
};

const STORAGE_KEY = "hijriCalendarAnchor_v1.1";

const WEEKDAYS_EN = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

/* ---------------- Date helpers ---------------- */

function parseISODate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toISODate(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDaysUTC(date, days) {
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function isSameUTCDate(a, b) {
  return a.getUTCFullYear() === b.getUTCFullYear() &&
         a.getUTCMonth() === b.getUTCMonth() &&
         a.getUTCDate() === b.getUTCDate();
}

// ISO weekday: 0=Mon..6=Sun (matches our MON-first grid)
function isoWeekdayIndex(date) {
  const jsDay = date.getUTCDay(); // 0=Sun..6=Sat
  return (jsDay + 6) % 7;
}

function gregShortLabel(date) {
  const day = date.getUTCDate();
  const month = date.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
  return `${day} ${month}`;
}

function gregRangeLabel(startDate, endDate) {
  const startMonth = startDate.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
  const endMonth = endDate.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
  const year = endDate.getUTCFullYear();
  const startYear = startDate.getUTCFullYear();
  if (startMonth === endMonth) return `${startMonth} ${year}`;
  if (startYear !== year) return `${startMonth} ${startYear} – ${endMonth} ${year}`;
  return `${startMonth} – ${endMonth} ${year}`;
}

/* ---------------- State ---------------- */

let state = {
  anchor: null,       // { hijriMonth, hijriYear, gregStart }
  customized: false,  // true if user has set their own anchor
  viewMonth: null,    // hijriMonth currently displayed
  viewYear: null,     // hijriYear currently displayed
  viewGregStart: null // ISO date string, gregorian start of the displayed month
};

function loadAnchor() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.hijriMonth && parsed.hijriYear && parsed.gregStart) {
        return { anchor: parsed, customized: true };
      }
    }
  } catch (e) {
    console.warn("Could not read saved calendar settings:", e);
  }
  return { anchor: { ...DEFAULT_ANCHOR }, customized: false };
}

function saveAnchor(anchor) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(anchor));
  } catch (e) {
    console.warn("Could not save calendar settings:", e);
  }
}

function clearSavedAnchor() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) { /* ignore */ }
}

/* ---------------- Month navigation math ----------------
   Given the anchor (a known month/year -> gregStart), compute
   the gregorian start date of any other month by walking the
   alternating 30/29 pattern month-by-month from the anchor.
--------------------------------------------------------- */

function hijriMonthIndexAbsolute(month, year) {
  // Absolute month count since a fixed epoch, for easy stepping.
  return year * 12 + (month - 1);
}

function computeGregStartFor(targetMonth, targetYear) {
  const anchorAbs = hijriMonthIndexAbsolute(state.anchor.hijriMonth, state.anchor.hijriYear);
  const targetAbs = hijriMonthIndexAbsolute(targetMonth, targetYear);
  let diff = targetAbs - anchorAbs;

  let cursorDate = parseISODate(state.anchor.gregStart);
  let cursorMonth = state.anchor.hijriMonth;
  let cursorYear = state.anchor.hijriYear;

  if (diff === 0) return cursorDate;

  if (diff > 0) {
    for (let i = 0; i < diff; i++) {
      cursorDate = addDaysUTC(cursorDate, hijriMonthLength(cursorMonth));
      cursorMonth += 1;
      if (cursorMonth > 12) { cursorMonth = 1; cursorYear += 1; }
    }
  } else {
    for (let i = 0; i < -diff; i++) {
      cursorMonth -= 1;
      if (cursorMonth < 1) { cursorMonth = 12; cursorYear -= 1; }
      cursorDate = addDaysUTC(cursorDate, -hijriMonthLength(cursorMonth));
    }
  }

  return cursorDate;
}

/* ---------------- Rendering ---------------- */

function setViewToMonth(month, year) {
  state.viewMonth = month;
  state.viewYear = year;
  state.viewGregStart = computeGregStartFor(month, year);
  render();
}

function render() {
  renderHeader();
  renderRegionLine();
  renderWeekdayRow();
  renderDaysGrid();
  if (window.lucide) lucide.createIcons();
}

function renderRegionLine() {
  const el = document.getElementById("regionLine");
  el.textContent = state.customized
    ? "Custom start date set"
    : "Default calendar for Bangladesh";
}

function renderHeader() {
  const monthLen = hijriMonthLength(state.viewMonth);
  const startDate = state.viewGregStart;
  const endDate = addDaysUTC(startDate, monthLen - 1);

  document.getElementById("monthNameEn").textContent =
    `${HIJRI_MONTHS_EN[state.viewMonth - 1]} ${state.viewYear}`;
  document.getElementById("monthNameBn").textContent =
    `${HIJRI_MONTHS_BN[state.viewMonth - 1]} ${state.viewYear}`;
  document.getElementById("monthRangeEn").textContent =
    gregRangeLabel(startDate, endDate);
}

function renderWeekdayRow() {
  const row = document.getElementById("weekdayRow");
  row.innerHTML = "";
  WEEKDAYS_EN.forEach(d => {
    const div = document.createElement("div");
    div.textContent = d;
    row.appendChild(div);
  });
}

function renderDaysGrid() {
  const grid = document.getElementById("daysGrid");
  grid.innerHTML = "";

  const monthLen = hijriMonthLength(state.viewMonth);
  const startDate = state.viewGregStart;
  const leadingEmpty = isoWeekdayIndex(startDate); // 0=Mon

  const today = new Date();
  const todayUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));

  for (let i = 0; i < leadingEmpty; i++) {
    const empty = document.createElement("div");
    empty.className = "day-cell empty";
    grid.appendChild(empty);
  }

  for (let dayNum = 1; dayNum <= monthLen; dayNum++) {
    const gregDate = addDaysUTC(startDate, dayNum - 1);
    const weekdayIdx = isoWeekdayIndex(gregDate); // 4 = Friday
    const isFriday = weekdayIdx === 4;
    const isToday = isSameUTCDate(gregDate, todayUTC);

    const cell = document.createElement("div");
    cell.className = "day-cell" +
      (isFriday ? " friday" : "") +
      (isToday ? " is-today" : "");

    const hijriNum = document.createElement("div");
    hijriNum.className = "hijri-num";
    hijriNum.textContent = dayNum;

    const gregLabel = document.createElement("div");
    gregLabel.className = "greg-date";
    gregLabel.textContent = gregShortLabel(gregDate);

    cell.appendChild(hijriNum);
    cell.appendChild(gregLabel);

    if (isToday) {
      const tag = document.createElement("div");
      tag.className = "today-tag";
      tag.textContent = "Today";
      cell.appendChild(tag);
    }

    grid.appendChild(cell);
  }
}

/* ---------------- Navigation buttons ---------------- */

function goToPrevMonth() {
  let m = state.viewMonth - 1;
  let y = state.viewYear;
  if (m < 1) { m = 12; y -= 1; }
  setViewToMonth(m, y);
}

function goToNextMonth() {
  let m = state.viewMonth + 1;
  let y = state.viewYear;
  if (m > 12) { m = 1; y += 1; }
  setViewToMonth(m, y);
}

/* ---------------- Settings dialog ---------------- */

function populateMonthSelect() {
  const select = document.getElementById("hijriMonthSelect");
  select.innerHTML = "";
  HIJRI_MONTHS_EN.forEach((name, idx) => {
    const opt = document.createElement("option");
    opt.value = idx + 1;
    opt.textContent = `${idx + 1}. ${name}`;
    select.appendChild(opt);
  });
}

function openDialog() {
  document.getElementById("hijriMonthSelect").value = state.anchor.hijriMonth;
  document.getElementById("hijriYearInput").value = state.anchor.hijriYear;
  document.getElementById("gregStartInput").value = state.anchor.gregStart;

  document.getElementById("overlay").classList.add("show");
  document.getElementById("settingsDialog").classList.add("show");
  document.getElementById("settingsBtn").setAttribute("aria-expanded", "true");
}

function closeDialog() {
  document.getElementById("overlay").classList.remove("show");
  document.getElementById("settingsDialog").classList.remove("show");
  document.getElementById("settingsBtn").setAttribute("aria-expanded", "false");
}

function applySettings() {
  const month = parseInt(document.getElementById("hijriMonthSelect").value, 10);
  const year = parseInt(document.getElementById("hijriYearInput").value, 10);
  const gregStart = document.getElementById("gregStartInput").value;

  if (!month || !year || !gregStart) {
    alert("Please fill in the Hijri month, year, and Gregorian start date.");
    return;
  }

  const newAnchor = { hijriMonth: month, hijriYear: year, gregStart };
  state.anchor = newAnchor;
  state.customized = true;
  saveAnchor(newAnchor);

  setViewToMonth(month, year);
  closeDialog();
}

function resetToDefault() {
  state.anchor = { ...DEFAULT_ANCHOR };
  state.customized = false;
  clearSavedAnchor();
  setViewToMonth(DEFAULT_ANCHOR.hijriMonth, DEFAULT_ANCHOR.hijriYear);
  closeDialog();
}

/* ---------------- Init ---------------- */

function init() {
  const loaded = loadAnchor();
  state.anchor = loaded.anchor;
  state.customized = loaded.customized;

  populateMonthSelect();

  document.getElementById("prevBtn").addEventListener("click", goToPrevMonth);
  document.getElementById("nextBtn").addEventListener("click", goToNextMonth);

  document.getElementById("settingsBtn").addEventListener("click", openDialog);
  document.getElementById("closeDialog").addEventListener("click", closeDialog);
  document.getElementById("overlay").addEventListener("click", closeDialog);
  document.getElementById("applyBtn").addEventListener("click", applySettings);
  document.getElementById("resetDefaultBtn").addEventListener("click", resetToDefault);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDialog();
  });

  setViewToMonth(state.anchor.hijriMonth, state.anchor.hijriYear);

  if (window.lucide) lucide.createIcons();
}

document.addEventListener("DOMContentLoaded", init);
