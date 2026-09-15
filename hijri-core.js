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
  // DEFAULT ANCHOR: used only as a last-resort fallback if anchors.json
  // fails to load for some reason (e.g. opened via file:// where fetch
  // is blocked). Normally the real anchor list comes from anchors.json,
  // merged with anything the user has added via Set Start Date.
  // ---------------------------------------------------------------
  const DEFAULT_ANCHOR = {
    hijriMonth: 4,
    hijriYear: 1448,
    gregStart: "2026-09-13", // YYYY-MM-DD, first day of that Hijri month
    lastUpdated: "2026-09-13" // date this anchor was set/confirmed on the site
  };

  const ANCHORS_URL = "anchors.json";
  const STORAGE_KEY = "hijriCalendarAnchors_v2"; // array of user-added anchors

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

  // Parses a strict dd/mm/yyyy string into a UTC Date. Returns null if malformed.
  function parseDMY(text) {
    if (typeof text !== "string") return null;
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

  // Formats a UTC Date as dd/mm/yyyy (same shape as parseDMY expects back).
  function formatDMY(date) {
    const d = String(date.getUTCDate()).padStart(2, "0");
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const y = date.getUTCFullYear();
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

  const WEEKDAYS_LONG_EN = [
    "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"
  ];

  const GREGORIAN_MONTHS_LONG = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  // "02/04/1448" style: dd/mm/yyyy in the Hijri calendar.
  function toHijriNumericDate(hijriDay, hijriMonth, hijriYear) {
    const d = String(hijriDay).padStart(2, "0");
    const m = String(hijriMonth).padStart(2, "0");
    return `${d}/${m}/${hijriYear}`;
  }

  // "14 Sep, 2026" style, used in Desk View.
  function toMediumGregLabel(date) {
    const d = String(date.getUTCDate()).padStart(2, "0");
    const m = GREGORIAN_MONTHS_SHORT[date.getUTCMonth()];
    const y = date.getUTCFullYear();
    return `${d} ${m}, ${y}`;
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

  /* ---------------- Anchor format conversion ----------------
     Anchors are authored in anchors.json (and by the Set Start
     Date dialog) using a compact, human-friendly shape:
       { hijriDate: "dd/mm/1448", gregStart: "dd/mm/yyyy",
         lastUpdated: "dd/mm/yyyy", link: "..." }
     where hijriDate's day is conventionally "01" (the 1st of
     that Hijri month) and its month/year encode which Hijri
     month this anchor is for.

     Internally, all the date-math functions below work with
     { hijriMonth, hijriYear, gregStart (ISO yyyy-mm-dd),
       lastUpdated (ISO yyyy-mm-dd), link } instead, since that
     shape is far less error-prone to do arithmetic on. These
     two functions convert between the two at the boundary.
  ------------------------------------------------------------- */

  // Raw JSON/dialog shape -> internal shape used by all the math below.
  function normalizeAnchor(raw) {
    const hijriParsed = parseDMY(raw.hijriDate);
    const gregParsed = parseDMY(raw.gregStart);
    if (!hijriParsed || !gregParsed) return null;

    const lastUpdatedParsed = parseDMY(raw.lastUpdated);

    return {
      hijriMonth: hijriParsed.getUTCMonth() + 1,
      hijriYear: hijriParsed.getUTCFullYear(),
      gregStart: toISODate(gregParsed),
      lastUpdated: lastUpdatedParsed ? toISODate(lastUpdatedParsed) : toISODate(gregParsed),
      link: typeof raw.link === "string" ? raw.link : ""
    };
  }

  function normalizeAnchorList(rawList) {
    return rawList
      .map(normalizeAnchor)
      .filter(a => a !== null);
  }

  // Internal shape -> raw dd/mm/yyyy shape, for saving back to
  // localStorage in the same human-friendly format anchors.json uses.
  function denormalizeAnchor(anchor) {
    const hijriDate = new Date(Date.UTC(anchor.hijriYear, anchor.hijriMonth - 1, 1));
    return {
      hijriDate: formatDMY(hijriDate),
      gregStart: formatDMY(parseISODate(anchor.gregStart)),
      lastUpdated: formatDMY(parseISODate(anchor.lastUpdated)),
      link: anchor.link || ""
    };
  }

  /* ---------------- Anchor list helpers ----------------
     An "anchor" (internal shape) is one confirmed Hijri month start:
       { hijriMonth, hijriYear, gregStart, lastUpdated, link? }

     We work with a LIST of these (not just one), because a new
     anchor for month N+1 does not retroactively change what
     month N's actual confirmed start date was. Each month keeps
     whatever was confirmed for it, permanently.
  ------------------------------------------------------------- */

  // Sorts a list of anchors chronologically by Hijri month/year (ascending).
  function sortAnchors(anchors) {
    return [...anchors].sort((a, b) =>
      hijriMonthIndexAbsolute(a.hijriMonth, a.hijriYear) -
      hijriMonthIndexAbsolute(b.hijriMonth, b.hijriYear)
    );
  }

  // Merges the shipped anchors.json list with the user's own saved
  // anchors (from Set Start Date). If both define the same Hijri
  // month/year, the user's own entry wins (it's the more recent
  // confirmation). Returns a new, sorted array.
  function mergeAnchors(shippedAnchors, userAnchors) {
    const map = new Map();
    for (const a of shippedAnchors) {
      map.set(hijriMonthIndexAbsolute(a.hijriMonth, a.hijriYear), a);
    }
    for (const a of userAnchors) {
      map.set(hijriMonthIndexAbsolute(a.hijriMonth, a.hijriYear), a);
    }
    return sortAnchors([...map.values()]);
  }

  // Given a sorted anchor list and a target Hijri month/year, finds the
  // anchor to compute from:
  //   - an exact match for that month/year, if one exists (ground truth,
  //     no pattern-walking needed at all), or otherwise
  //   - the CLOSEST anchor by month distance, whether before or after,
  //     so we walk the fewest possible 30/29-day steps (and therefore
  //     carry the least risk of drifting from reality).
  // Assumes `anchors` is non-empty.
  function findNearestAnchor(anchors, targetMonth, targetYear) {
    const targetAbs = hijriMonthIndexAbsolute(targetMonth, targetYear);

    let best = anchors[0];
    let bestDist = Math.abs(hijriMonthIndexAbsolute(best.hijriMonth, best.hijriYear) - targetAbs);

    for (const a of anchors) {
      const abs = hijriMonthIndexAbsolute(a.hijriMonth, a.hijriYear);
      if (abs === targetAbs) return a; // exact match: ground truth, stop looking
      const dist = Math.abs(abs - targetAbs);
      if (dist < bestDist) {
        best = a;
        bestDist = dist;
      }
    }

    return best;
  }

  /* ---------------- Core month-stepping math ----------------
     Given an anchor (a known Hijri month/year -> Gregorian
     start date), compute the Gregorian start date of any other
     Hijri month by walking the alternating 30/29 pattern
     month-by-month from the anchor. The caller is expected to
     have already picked the nearest anchor via findNearestAnchor,
     so this never has to walk further than necessary.
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

  // Convenience wrapper: given the FULL anchor list (not just one
  // anchor), finds the nearest anchor for the target month/year and
  // computes its Gregorian start date from there.
  function computeGregStartForList(anchors, targetMonth, targetYear) {
    const anchor = findNearestAnchor(anchors, targetMonth, targetYear);
    return computeGregStartFor(anchor, targetMonth, targetYear);
  }

  // The TRUE length (in days) of a given Hijri month, accounting for
  // the anchor list -- NOT just the blind 30/29 pattern.
  //
  // This matters whenever two consecutive months both have their own
  // exact anchors: the gap between them is ground truth and can differ
  // from what the pattern alone would predict. For example, if month 3
  // is anchored to start 15 Aug and month 4 is separately anchored to
  // start 13 Sep, month 3 is actually 29 days long (13 Sep - 15 Aug),
  // even though month 3 is an "odd" month and the generic pattern
  // would otherwise assume 30. Using the blind pattern here would draw
  // a 30th day for month 3 landing on 13 Sep -- the same calendar date
  // that month 4's own anchor says is actually its 1st day.
  function hijriMonthLengthForList(anchors, month, year) {
    const thisStart = computeGregStartForList(anchors, month, year);

    let nextMonth = month + 1;
    let nextYear = year;
    if (nextMonth > 12) { nextMonth = 1; nextYear += 1; }
    const nextStart = computeGregStartForList(anchors, nextMonth, nextYear);

    const days = Math.round((nextStart.getTime() - thisStart.getTime()) / 86400000);
    // Guard against a malformed/contradictory anchor pair producing a
    // non-positive or wildly out-of-range gap; fall back to the plain
    // pattern rather than rendering a broken (zero/negative-day) month.
    if (days < 25 || days > 32) return hijriMonthLength(month);
    return days;
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

  // Convenience wrapper: given the FULL anchor list, finds which Hijri
  // month a Gregorian date falls into and converts it.
  //
  // Unlike a naive day-by-day walk from a single anchor, this checks
  // EVERY month it passes through against the anchor list (via
  // computeGregStartForList, which already knows how to pick each
  // month's own exact anchor when one exists). That matters because a
  // date can sit between two different confirmed anchors, or inside a
  // month that has its own exact anchor even though a later month's
  // anchor is the most recent one overall -- in both cases we must
  // not silently fall back to the 30/29 pattern from the newest anchor
  // and ignore the more specific anchor that actually governs this date.
  function gregorianToHijriList(anchors, gregDate) {
    const sorted = sortAnchors(anchors);
    // Start the search from whichever anchor is chronologically closest
    // to the target date (by Gregorian date, not just "the latest one"),
    // so the walk below stays short in the common case.
    let closest = sorted[0];
    let closestDiff = Math.abs(parseISODate(closest.gregStart).getTime() - gregDate.getTime());
    for (const a of sorted) {
      const diff = Math.abs(parseISODate(a.gregStart).getTime() - gregDate.getTime());
      if (diff < closestDiff) {
        closest = a;
        closestDiff = diff;
      }
    }

    let cursorMonth = closest.hijriMonth;
    let cursorYear = closest.hijriYear;
    let cursorStart = computeGregStartForList(anchors, cursorMonth, cursorYear);
    let cursorEnd = addDaysUTC(cursorStart, hijriMonthLengthForList(anchors, cursorMonth, cursorYear) - 1);

    // Walk forward, re-deriving each month's start AND true length from
    // the anchor list (not the raw pattern) at every step.
    let guard = 0;
    while (gregDate.getTime() > cursorEnd.getTime() && guard < 2400) {
      cursorMonth += 1;
      if (cursorMonth > 12) { cursorMonth = 1; cursorYear += 1; }
      cursorStart = computeGregStartForList(anchors, cursorMonth, cursorYear);
      cursorEnd = addDaysUTC(cursorStart, hijriMonthLengthForList(anchors, cursorMonth, cursorYear) - 1);
      guard++;
    }

    // Walk backward, same rule.
    guard = 0;
    while (gregDate.getTime() < cursorStart.getTime() && guard < 2400) {
      cursorMonth -= 1;
      if (cursorMonth < 1) { cursorMonth = 12; cursorYear -= 1; }
      cursorStart = computeGregStartForList(anchors, cursorMonth, cursorYear);
      cursorEnd = addDaysUTC(cursorStart, hijriMonthLengthForList(anchors, cursorMonth, cursorYear) - 1);
      guard++;
    }

    const dayNum = Math.round((gregDate.getTime() - cursorStart.getTime()) / 86400000) + 1;

    return {
      hijriDay: dayNum,
      hijriMonth: cursorMonth,
      hijriYear: cursorYear
    };
  }

  /* ---------------- Loading anchors: shipped file + user additions ---------------- */

  // Fetches the shipped anchors.json (the hand-maintained historical
  // record), parses its dd/mm/yyyy fields, and returns the INTERNAL
  // anchor shape ({ hijriMonth, hijriYear, gregStart (ISO), ... }).
  // Falls back to a single DEFAULT_ANCHOR if the fetch fails (e.g.
  // opened via file:// where fetch to local files is blocked) or the
  // file's contents don't parse.
  async function fetchShippedAnchors() {
    try {
      const res = await fetch(ANCHORS_URL);
      if (!res.ok) throw new Error(`anchors.json responded with ${res.status}`);
      const data = await res.json();
      if (data && Array.isArray(data.anchors) && data.anchors.length > 0) {
        const normalized = normalizeAnchorList(data.anchors);
        if (normalized.length > 0) return normalized;
      }
      throw new Error("anchors.json had no usable anchors array");
    } catch (e) {
      return [{ ...DEFAULT_ANCHOR }];
    }
  }

  // Anchors the user has added themselves via the Set Start Date
  // dialog, stored in localStorage (kept separate from anchors.json
  // so re-deploying the site never silently discards a user's own
  // custom entry, and vice versa).
  function loadUserAnchors() {
    try {
      const raw = global.localStorage && global.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) { /* localStorage may be unavailable */ }
    return [];
  }

  function saveUserAnchor(anchor) {
    try {
      const existing = loadUserAnchors();
      const targetAbs = hijriMonthIndexAbsolute(anchor.hijriMonth, anchor.hijriYear);
      // Replace any existing user anchor for the same month/year, else append.
      const filtered = existing.filter(a =>
        hijriMonthIndexAbsolute(a.hijriMonth, a.hijriYear) !== targetAbs
      );
      filtered.push(anchor);
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    } catch (e) { /* ignore */ }
  }

  function clearUserAnchors() {
    try {
      global.localStorage.removeItem(STORAGE_KEY);
    } catch (e) { /* ignore */ }
  }

  global.HijriCore = {
    HIJRI_MONTHS_EN,
    HIJRI_MONTHS_SHORT,
    GREGORIAN_MONTHS_SHORT,
    GREGORIAN_MONTHS_LONG,
    WEEKDAYS_LONG_EN,
    HIJRI_MONTHS_AR,
    HIJRI_MONTHS_BN,
    hijriMonthLength,
    DEFAULT_ANCHOR,
    STORAGE_KEY,
    parseISODate,
    toISODate,
    toDisplayDate,
    parseDMY,
    formatDMY,
    toShortGregLabel,
    toShortHijriLabel,
    toHijriNumericDate,
    toMediumGregLabel,
    addDaysUTC,
    isSameUTCDate,
    isoWeekdayIndex,
    hijriMonthIndexAbsolute,
    normalizeAnchor,
    normalizeAnchorList,
    denormalizeAnchor,
    sortAnchors,
    mergeAnchors,
    findNearestAnchor,
    computeGregStartFor,
    computeGregStartForList,
    hijriMonthLengthForList,
    gregorianToHijri,
    gregorianToHijriList,
    fetchShippedAnchors,
    loadUserAnchors,
    saveUserAnchor,
    clearUserAnchors
  };

})(typeof self !== "undefined" ? self : this);
