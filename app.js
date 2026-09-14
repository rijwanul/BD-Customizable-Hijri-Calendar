/* =========================================================
   Hijri Calendar, Bangladesh
   Page logic: rendering, navigation, settings dialog with a
   custom dd/mm/yyyy date picker, and the Hijri/Gregorian
   position toggle.

   Date math itself lives in hijri-core.js.
========================================================= */

const {
  HIJRI_MONTHS_EN,
  HIJRI_MONTHS_SHORT,
  GREGORIAN_MONTHS_SHORT,
  HIJRI_MONTHS_AR,
  HIJRI_MONTHS_BN,
  hijriMonthLength,
  DEFAULT_ANCHOR,
  parseISODate,
  toISODate,
  toShortGregLabel,
  toShortHijriLabel,
  addDaysUTC,
  isSameUTCDate,
  isoWeekdayIndex,
  computeGregStartFor,
  loadAnchor,
  saveAnchor,
  clearSavedAnchor
} = HijriCore;

const WEEKDAYS_EN = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const LAYOUT_STORAGE_KEY = "hijriCalendarLayout_v1"; // "hijri-top" or "gregorian-top"

/* ---------------- State ---------------- */

let state = {
  anchor: null,
  customized: false,
  viewMonth: null,
  viewYear: null,
  viewGregStart: null,
  layout: "hijri-top" // default
};

// The date currently selected in the custom picker (Date object, UTC midnight, or null).
let pickerSelectedDate = null;
// The month/year the mini calendar popup is currently showing (independent of selection).
let pickerViewYear = null;
let pickerViewMonth = null; // 0-indexed (JS convention) for the Gregorian picker

function loadLayout() {
  try {
    const saved = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (saved === "hijri-top" || saved === "gregorian-top") return saved;
  } catch (e) { /* ignore */ }
  return "hijri-top";
}

function saveLayout(layout) {
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, layout);
  } catch (e) { /* ignore */ }
}

function gregRangeLabel(startDate, endDate) {
  const startMonthLong = startDate.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
  const endMonthLong = endDate.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
  const year = endDate.getUTCFullYear();
  const startYear = startDate.getUTCFullYear();
  if (startMonthLong === endMonthLong) return `${startMonthLong} ${year}`;
  if (startYear !== year) return `${startMonthLong} ${startYear}, ${endMonthLong} ${year}`;
  return `${startMonthLong}, ${endMonthLong} ${year}`;
}

/* ---------------- Rendering ---------------- */

function setViewToMonth(month, year) {
  state.viewMonth = month;
  state.viewYear = year;
  state.viewGregStart = computeGregStartFor(state.anchor, month, year);
  render();
}

function render() {
  renderHeader();
  renderRegionLine();
  renderWeekdayRow();
  renderDaysGrid();
  renderToggleUI();
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
  document.getElementById("monthNameAr").textContent =
    `${HIJRI_MONTHS_AR[state.viewMonth - 1]} ${state.viewYear}`;
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
  grid.classList.toggle("greg-top", state.layout === "gregorian-top");

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

    const hijriLabel = document.createElement("div");
    hijriLabel.className = "hijri-num";
    hijriLabel.textContent = state.layout === "gregorian-top"
      ? toShortHijriLabel(dayNum, state.viewMonth)
      : dayNum;

    const gregLabel = document.createElement("div");
    gregLabel.className = "greg-date";
    gregLabel.textContent = state.layout === "gregorian-top"
      ? gregDate.getUTCDate()
      : toShortGregLabel(gregDate);

    if (state.layout === "gregorian-top") {
      gregLabel.classList.add("primary-num");
      hijriLabel.classList.add("secondary-label");
      cell.appendChild(gregLabel);
      cell.appendChild(hijriLabel);
    } else {
      hijriLabel.classList.add("primary-num");
      gregLabel.classList.add("secondary-label");
      cell.appendChild(hijriLabel);
      cell.appendChild(gregLabel);
    }

    if (isToday) {
      const tag = document.createElement("div");
      tag.className = "today-tag";
      tag.textContent = "Today";
      cell.appendChild(tag);
    }

    grid.appendChild(cell);
  }
}

function renderToggleUI() {
  const btn = document.getElementById("layoutToggleBtn");
  const isGregTop = state.layout === "gregorian-top";
  btn.setAttribute("aria-pressed", String(isGregTop));
  document.getElementById("layoutToggleLabel").textContent =
    isGregTop ? "Gregorian on top" : "Hijri on top";
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

function toggleLayout() {
  state.layout = state.layout === "hijri-top" ? "gregorian-top" : "hijri-top";
  saveLayout(state.layout);
  render();
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

  const anchorDate = parseISODate(state.anchor.gregStart);
  setPickerDate(anchorDate);

  document.getElementById("overlay").classList.add("show");
  document.getElementById("settingsDialog").classList.add("show");
  document.getElementById("settingsBtn").setAttribute("aria-expanded", "true");
}

function closeDialog() {
  document.getElementById("overlay").classList.remove("show");
  document.getElementById("settingsDialog").classList.remove("show");
  document.getElementById("settingsBtn").setAttribute("aria-expanded", "false");
  closeDatePicker();
}

function applySettings() {
  const month = parseInt(document.getElementById("hijriMonthSelect").value, 10);
  const year = parseInt(document.getElementById("hijriYearInput").value, 10);

  if (!month || !year || !pickerSelectedDate) {
    alert("Please fill in the Hijri month, year, and Gregorian start date.");
    return;
  }

  const gregStart = toISODate(pickerSelectedDate);
  const today = new Date();
  const newAnchor = {
    hijriMonth: month,
    hijriYear: year,
    gregStart,
    lastUpdated: toISODate(new Date(Date.UTC(
      today.getFullYear(), today.getMonth(), today.getDate()
    )))
  };
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

/* ---------------- Custom dd/mm/yyyy date picker ---------------- */

function pad2(n) { return String(n).padStart(2, "0"); }

function formatPickerInput(date) {
  return `${pad2(date.getUTCDate())}/${pad2(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`;
}

// Parses a strict dd/mm/yyyy string. Returns a UTC Date, or null if invalid.
function parsePickerInput(text) {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text.trim());
  if (!match) return null;
  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);
  if (month < 1 || month > 12) return null;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) return null;
  return new Date(Date.UTC(year, month - 1, day));
}

function setPickerDate(date) {
  pickerSelectedDate = date;
  pickerViewYear = date.getUTCFullYear();
  pickerViewMonth = date.getUTCMonth();
  document.getElementById("gregStartInput").value = formatPickerInput(date);
  renderPickerCalendar();
}

function openDatePicker() {
  document.getElementById("datePickerPopup").classList.add("show");
  renderPickerCalendar();
}

function closeDatePicker() {
  document.getElementById("datePickerPopup").classList.remove("show");
}

function toggleDatePicker() {
  const popup = document.getElementById("datePickerPopup");
  if (popup.classList.contains("show")) {
    closeDatePicker();
  } else {
    openDatePicker();
  }
}

function pickerGoToPrevMonth() {
  pickerViewMonth -= 1;
  if (pickerViewMonth < 0) { pickerViewMonth = 11; pickerViewYear -= 1; }
  renderPickerCalendar();
}

function pickerGoToNextMonth() {
  pickerViewMonth += 1;
  if (pickerViewMonth > 11) { pickerViewMonth = 0; pickerViewYear += 1; }
  renderPickerCalendar();
}

function renderPickerCalendar() {
  const label = document.getElementById("pickerMonthLabel");
  const monthName = new Date(Date.UTC(pickerViewYear, pickerViewMonth, 1))
    .toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
  label.textContent = `${monthName} ${pickerViewYear}`;

  const grid = document.getElementById("pickerDaysGrid");
  grid.innerHTML = "";

  const firstOfMonth = new Date(Date.UTC(pickerViewYear, pickerViewMonth, 1));
  const leadingEmpty = isoWeekdayIndex(firstOfMonth);
  const daysInMonth = new Date(Date.UTC(pickerViewYear, pickerViewMonth + 1, 0)).getUTCDate();

  for (let i = 0; i < leadingEmpty; i++) {
    const empty = document.createElement("div");
    empty.className = "picker-day empty";
    grid.appendChild(empty);
  }

  const today = new Date();
  const todayUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));

  for (let day = 1; day <= daysInMonth; day++) {
    const thisDate = new Date(Date.UTC(pickerViewYear, pickerViewMonth, day));
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "picker-day";
    btn.textContent = day;

    if (isSameUTCDate(thisDate, todayUTC)) btn.classList.add("is-today");
    if (pickerSelectedDate && isSameUTCDate(thisDate, pickerSelectedDate)) {
      btn.classList.add("is-selected");
    }

    btn.addEventListener("click", () => {
      setPickerDate(thisDate);
      closeDatePicker();
    });

    grid.appendChild(btn);
  }
}

function handlePickerInputChange() {
  const input = document.getElementById("gregStartInput");
  const parsed = parsePickerInput(input.value);
  if (parsed) {
    pickerSelectedDate = parsed;
    pickerViewYear = parsed.getUTCFullYear();
    pickerViewMonth = parsed.getUTCMonth();
    input.classList.remove("invalid");
    renderPickerCalendar();
  } else {
    input.classList.add("invalid");
  }
}

/* ---------------- Init ---------------- */

function init() {
  const loaded = loadAnchor();
  state.anchor = loaded.anchor;
  state.customized = loaded.customized;
  state.layout = loadLayout();

  populateMonthSelect();

  document.getElementById("prevBtn").addEventListener("click", goToPrevMonth);
  document.getElementById("nextBtn").addEventListener("click", goToNextMonth);
  document.getElementById("layoutToggleBtn").addEventListener("click", toggleLayout);

  document.getElementById("settingsBtn").addEventListener("click", openDialog);
  document.getElementById("closeDialog").addEventListener("click", closeDialog);
  document.getElementById("overlay").addEventListener("click", closeDialog);
  document.getElementById("applyBtn").addEventListener("click", applySettings);
  document.getElementById("resetDefaultBtn").addEventListener("click", resetToDefault);

  document.getElementById("gregStartInput").addEventListener("focus", openDatePicker);
  document.getElementById("gregStartInput").addEventListener("input", handlePickerInputChange);
  document.getElementById("calendarIconBtn").addEventListener("click", toggleDatePicker);
  document.getElementById("pickerPrevBtn").addEventListener("click", pickerGoToPrevMonth);
  document.getElementById("pickerNextBtn").addEventListener("click", pickerGoToNextMonth);

  document.addEventListener("click", (e) => {
    const popup = document.getElementById("datePickerPopup");
    const wrapper = document.getElementById("dateFieldWrapper");
    if (popup.classList.contains("show") && !wrapper.contains(e.target)) {
      closeDatePicker();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDialog();
  });

  setViewToMonth(state.anchor.hijriMonth, state.anchor.hijriYear);

  if (window.lucide) lucide.createIcons();
}

document.addEventListener("DOMContentLoaded", init);
