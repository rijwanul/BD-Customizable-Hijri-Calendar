/* =========================================================
   hijri-core.js
   Shared Hijri date engine used by app.js.

   Plain script, loaded via a normal <script> tag.
========================================================= */

(function (global) {

  const HIJRI_MONTHS_EN = [
    "Muharram", "Safar", "Rabi-ul-Awwal", "Rabi-us-Saani",
    "Jama-dil-ula", "Jamad-us-Saani", "Rajjab", "Shabaan",
    "Ramazaan", "Shawwal", "Zulqaidah", "Zulhujjah"
  ];

  // Short forms used inside calendar day cells.
  const HIJRI_MONTHS_SHORT = [
    "Muh", "Saf", "Rab I", "Rab II",
    "Jum I", "Jum II", "Raj", "Sha",
    "Ram", "Shaw", "Dhu-Q", "Dhu-H"
  ];

  const GREGORIAN_MONTHS_SHORT = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ];

  // Matches the reference chart exactly (Arabic script column).
  const HIJRI_MONTHS_AR = [
    "محرم", "صفر", "ربيع أول", "ربيع ثان",
    "جمادى أول", "جمادى ثان", "رجب", "شعبان",
    "رمضان", "شوال", "ذو القعدة", "ذو الحجة"
  ];

  const HIJRI_MONTHS_BN = [
    "মুহাররম", "সফর", "রবিউল আউয়াল", "রবিউস সানি",
    "জমাদিউল আউয়াল", "জমাদিউস সানি", "রজব", "শাবান",
    "রমজান", "শাওয়াল", "জিলক্বদ", "জিলহজ্জ"
  ];

  // Traditional alternating month lengths (30 for odd months, 29 for even),
  // used as the working pattern between confirmed moon-sighting anchors.
  function hijriMonthLength(monthNumber1to12) {
    return monthNumber1to12 % 2 === 1 ? 30 : 29;
  }

  // ---------------------------------------------------------------
  // DEFAULT ANCHOR: edit this whenever a new Hijri month is
  // confirmed/announced. Whatever month/year/date is set here
  // becomes the site's "current month" going forward.
  // ---------------------------------------------------------------
  const DEFAULT_ANCHOR = {
    hijriMonth: 4,
    hijriYear: 1448,
    gregStart: "2026-09-13", // YYYY-MM-DD, first day of that Hijri month
    lastUpdated: "2026-09-13" // date this anchor was set/confirmed on the site
  };

  const STORAGE_KEY = "hijriCalendarAnchor_v1";

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

  // dd/mm/yyyy display format, used in the Set Start Date dialog.
  function toDisplayDate(date) {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const d = String(date.getUTCDate()).padStart(2, "0");
    return `${d}/${m}/${y}`;
  }

  // "02 Sep" style, used inside calendar day cells.
  function toShortGregLabel(date) {
    const d = String(date.getUTCDate()).padStart(2, "0");
    const m = GREGORIAN_MONTHS_SHORT[date.getUTCMonth()];
    return `${d} ${m}`;
  }

  // "04 Muh" style, used inside calendar day cells.
  function toShortHijriLabel(hijriDay, hijriMonth) {
    const d = String(hijriDay).padStart(2, "0");
    const m = HIJRI_MONTHS_SHORT[hijriMonth - 1];
    return `${d} ${m}`;
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

  // ISO weekday: 0=Mon..6=Sun
  function isoWeekdayIndex(date) {
    const jsDay = date.getUTCDay(); // 0=Sun..6=Sat
    return (jsDay + 6) % 7;
  }

  function hijriMonthIndexAbsolute(month, year) {
    return year * 12 + (month - 1);
  }

  /* ---------------- Core month-stepping math ----------------
     Given an anchor (a known Hijri month/year -> Gregorian
     start date), compute the Gregorian start date of any other
     Hijri month by walking the alternating 30/29 pattern
     month-by-month from the anchor.
  ------------------------------------------------------------- */

  function computeGregStartFor(anchor, targetMonth, targetYear) {
    const anchorAbs = hijriMonthIndexAbsolute(anchor.hijriMonth, anchor.hijriYear);
    const targetAbs = hijriMonthIndexAbsolute(targetMonth, targetYear);
    let diff = targetAbs - anchorAbs;

    let cursorDate = parseISODate(anchor.gregStart);
    let cursorMonth = anchor.hijriMonth;
    let cursorYear = anchor.hijriYear;

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

  // Convert a Gregorian date to { hijriDay, hijriMonth, hijriYear }
  // by walking forward/backward from the anchor's month, using the
  // same alternating 30/29 pattern.
  function gregorianToHijri(anchor, gregDate) {
    let cursorMonth = anchor.hijriMonth;
    let cursorYear = anchor.hijriYear;
    let cursorStart = parseISODate(anchor.gregStart);
    let cursorEnd = addDaysUTC(cursorStart, hijriMonthLength(cursorMonth) - 1);

    // Walk forward
    let guard = 0;
    while (gregDate.getTime() > cursorEnd.getTime() && guard < 2400) {
      cursorMonth += 1;
      if (cursorMonth > 12) { cursorMonth = 1; cursorYear += 1; }
      cursorStart = addDaysUTC(cursorEnd, 1);
      cursorEnd = addDaysUTC(cursorStart, hijriMonthLength(cursorMonth) - 1);
      guard++;
    }

    // Walk backward
    guard = 0;
    while (gregDate.getTime() < cursorStart.getTime() && guard < 2400) {
      cursorMonth -= 1;
      if (cursorMonth < 1) { cursorMonth = 12; cursorYear -= 1; }
      cursorEnd = addDaysUTC(cursorStart, -1);
      cursorStart = addDaysUTC(cursorEnd, -(hijriMonthLength(cursorMonth) - 1));
      guard++;
    }

    const dayNum = Math.round((gregDate.getTime() - cursorStart.getTime()) / 86400000) + 1;

    return {
      hijriDay: dayNum,
      hijriMonth: cursorMonth,
      hijriYear: cursorYear
    };
  }

  /* ---------------- localStorage anchor persistence ---------------- */

  function loadAnchor() {
    try {
      const raw = global.localStorage && global.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.hijriMonth && parsed.hijriYear && parsed.gregStart) {
          return { anchor: parsed, customized: true };
        }
      }
    } catch (e) { /* localStorage may be unavailable (e.g. inside SW) */ }
    return { anchor: { ...DEFAULT_ANCHOR }, customized: false };
  }

  function saveAnchor(anchor) {
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(anchor));
    } catch (e) { /* ignore */ }
  }

  function clearSavedAnchor() {
    try {
      global.localStorage.removeItem(STORAGE_KEY);
    } catch (e) { /* ignore */ }
  }

  global.HijriCore = {
    HIJRI_MONTHS_EN,
    HIJRI_MONTHS_SHORT,
    GREGORIAN_MONTHS_SHORT,
    HIJRI_MONTHS_AR,
    HIJRI_MONTHS_BN,
    hijriMonthLength,
    DEFAULT_ANCHOR,
    STORAGE_KEY,
    parseISODate,
    toISODate,
    toDisplayDate,
    toShortGregLabel,
    toShortHijriLabel,
    addDaysUTC,
    isSameUTCDate,
    isoWeekdayIndex,
    computeGregStartFor,
    gregorianToHijri,
    loadAnchor,
    saveAnchor,
    clearSavedAnchor
  };

})(typeof self !== "undefined" ? self : this);
