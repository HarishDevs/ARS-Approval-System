import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";
import { parseWorkingDays, type Weekday, type WorkingCalendar } from "@/server/workflows/calendar";

// Holidays and working days (D-067). Managed by IT in /admin/calendar.
const WORKING_DAYS_KEY = "calendar.working_days";

export async function loadWorkingCalendar(db: Queryable = getDbPool()): Promise<WorkingCalendar> {
  const [settings] = await db.query<(RowDataPacket & { value: string | null })[]>("SELECT value FROM system_settings WHERE setting_key = ? LIMIT 1", [WORKING_DAYS_KEY]);
  // Holidays from a week back onward are enough for any open task's due time.
  const [holidays] = await db.query<(RowDataPacket & { day: string })[]>(
    "SELECT DATE_FORMAT(holiday_on, '%Y-%m-%d') AS day FROM holidays WHERE holiday_on >= DATE_SUB(UTC_DATE(), INTERVAL 7 DAY)",
  );
  return { workingDays: new Set(parseWorkingDays(settings[0]?.value)), holidays: new Set(holidays.map((row) => row.day)) };
}

export async function listHolidays(db: Queryable = getDbPool()): Promise<{ date: string; name: string }[]> {
  const [rows] = await db.query<(RowDataPacket & { day: string; name: string })[]>(
    "SELECT DATE_FORMAT(holiday_on, '%Y-%m-%d') AS day, name FROM holidays WHERE holiday_on >= DATE_SUB(UTC_DATE(), INTERVAL 30 DAY) ORDER BY holiday_on",
  );
  return rows.map((row) => ({ date: row.day, name: row.name }));
}

export async function addHoliday(date: string, name: string, createdBy: number, db: Queryable = getDbPool()): Promise<void> {
  await db.query<ResultSetHeader>("INSERT INTO holidays (holiday_on, name, created_by) VALUES (?, ?, ?)", [date, name, createdBy]);
}

export async function removeHoliday(date: string, db: Queryable = getDbPool()): Promise<boolean> {
  const [result] = await db.query<ResultSetHeader>("DELETE FROM holidays WHERE holiday_on = ?", [date]);
  return result.affectedRows === 1;
}

export async function getWorkingDays(db: Queryable = getDbPool()): Promise<Weekday[]> {
  const [rows] = await db.query<(RowDataPacket & { value: string | null })[]>("SELECT value FROM system_settings WHERE setting_key = ? LIMIT 1", [WORKING_DAYS_KEY]);
  return parseWorkingDays(rows[0]?.value);
}

export async function setWorkingDays(days: readonly Weekday[], updatedBy: number, db: Queryable = getDbPool()): Promise<void> {
  await db.query<ResultSetHeader>(
    `INSERT INTO system_settings (setting_key, setting_group, value_type, encrypted, value, updated_by) VALUES (?, 'CALENDAR', 'STRING', FALSE, ?, ?)
     ON DUPLICATE KEY UPDATE value = VALUES(value), updated_by = VALUES(updated_by)`,
    [WORKING_DAYS_KEY, days.join(","), updatedBy],
  );
}
