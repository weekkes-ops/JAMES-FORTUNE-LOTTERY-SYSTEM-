const MONTHS: { [key: string]: number } = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11
};

export function parseDateString(dateStr: string): Date | null {
  if (!dateStr) return null;
  
  let s = dateStr.trim();

  // 0. Check if it's an Excel serial date number (e.g., 46182)
  if (/^\d+(\.\d+)?$/.test(s)) {
    const num = parseFloat(s);
    if (num >= 10000 && num <= 90000) { // Dates between 1927 and 2146
      const utc_days = Math.floor(num - 25569);
      const utc_value = utc_days * 86400;
      const date_info = new Date(utc_value * 1000);
      if (!isNaN(date_info.getTime())) {
        return new Date(Date.UTC(date_info.getUTCFullYear(), date_info.getUTCMonth(), date_info.getUTCDate()));
      }
    }
  }
  
  // 1. Check if it's already YYYY-MM-DD
  const ymdMatch = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);
    const d = new Date(Date.UTC(year, month, day));
    if (!isNaN(d.getTime())) return d;
  }

  // 2. Remove weekdays (e.g., "Tuesday, ", "Tuesday ")
  s = s.replace(/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:s|,\s*|\s+)/i, "");
  
  // Clean commas and extra spaces
  s = s.replace(/,/g, " ").replace(/\s+/g, " ").trim();

  // 3. Match patterns like "9th June 2026" or "09 June 2026" or "9 June 2026"
  const dmyMatch = s.match(/^(\d+)(?:st|nd|rd|th)?\s+([a-zA-Z]+)\s+(\d{4})$/i);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const monthName = dmyMatch[2].toLowerCase();
    const year = parseInt(dmyMatch[3], 10);
    if (monthName in MONTHS) {
      const d = new Date(Date.UTC(year, MONTHS[monthName], day));
      if (!isNaN(d.getTime())) return d;
    }
  }

  // 4. Match patterns like "June 9th 2026" or "June 9 2026"
  const mdyMatch = s.match(/^([a-zA-Z]+)\s+(\d+)(?:st|nd|rd|th)?\s+(\d{4})$/i);
  if (mdyMatch) {
    const monthName = mdyMatch[1].toLowerCase();
    const day = parseInt(mdyMatch[2], 10);
    const year = parseInt(mdyMatch[3], 10);
    if (monthName in MONTHS) {
      const d = new Date(Date.UTC(year, MONTHS[monthName], day));
      if (!isNaN(d.getTime())) return d;
    }
  }

  // 5. Match European or US numeric formats "DD/MM/YYYY", "MM/DD/YYYY", etc.
  const dmyNumericMatch = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (dmyNumericMatch) {
    let part1 = parseInt(dmyNumericMatch[1], 10);
    let part2 = parseInt(dmyNumericMatch[2], 10);
    let year = parseInt(dmyNumericMatch[3], 10);
    if (year < 100) {
      year += year < 50 ? 2000 : 1900;
    }
    
    let month = -1;
    let day = -1;

    if (part1 > 12) {
      // Must be DD/MM/YYYY (European)
      day = part1;
      month = part2 - 1;
    } else if (part2 > 12) {
      // Must be MM/DD/YYYY (US)
      month = part1 - 1;
      day = part2;
    } else {
      // Default to US (MM/DD/YYYY) for safety with dual <= 12 numbers
      month = part1 - 1;
      day = part2;
    }

    if (month >= 0 && month < 12 && day >= 1 && day <= 31) {
      const d = new Date(Date.UTC(year, month, day));
      if (!isNaN(d.getTime())) return d;
    }
  }

  // Fallback to native Date parser
  const fallback = new Date(dateStr);
  if (!isNaN(fallback.getTime())) {
    // To prevent timezone offset shifts when using local timezone,
    // if string doesn't contain time components, treat as UTC
    const hasTime = s.includes("T") || s.includes(":") || s.match(/\d\s*(am|pm)/i);
    if (!hasTime) {
      return new Date(Date.UTC(fallback.getFullYear(), fallback.getMonth(), fallback.getDate()));
    }
    return fallback;
  }

  return null;
}

export function normalizeDateToYMD(dateStr: string): string {
  const d = parseDateString(dateStr);
  if (!d) {
    // Prevent saving literal "Invalid Date" to the DB/localStorage
    if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return dateStr;
    }
    return new Date().toISOString().split("T")[0];
  }
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatLottoDate(dateStr: string): string {
  const d = parseDateString(dateStr);
  if (!d) {
    // Ultimate fallback instead of returning "Invalid Date"
    return new Date().toLocaleDateString("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  }
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  });
}
