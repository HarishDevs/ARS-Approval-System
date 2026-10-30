import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";
import { getWorkingDays } from "@/lib/db/repositories/calendar.repository";
import { upsertSetting } from "@/lib/db/repositories/settings.repository";
import { HOLIDAY_SETTINGS_KEY, parseHolidaySettings, type HolidayCalendar, type HolidaySettings } from "@/server/work/holidays";

// D-217: the task holiday settings and the organisation's holidays (Admin →
// Working calendar) as one calendar for Tasks.
export async function loadHolidaySettings(db: Queryable = getDbPool()): Promise<HolidaySettings> {
  const [rows] = await db.query<RowDataPacket[]>("SELECT value FROM system_settings WHERE setting_key = ? LIMIT 1", [HOLIDAY_SETTINGS_KEY]);
  return parseHolidaySettings(rows[0]?.value ?? null);
}

export async function saveHolidaySettings(settings: HolidaySettings, updatedBy: number, db: Queryable = getDbPool()): Promise<void> {
  await upsertSetting({ key: HOLIDAY_SETTINGS_KEY, group: "TASKS", valueType: "JSON", encrypted: false, storedValue: JSON.stringify(settings), updatedBy }, db);
}

export async function loadHolidayCalendar(db: Queryable = getDbPool()): Promise<HolidayCalendar> {
  const [rows] = await db.query<RowDataPacket[]>(
    "SELECT DATE_FORMAT(holiday_on, '%Y-%m-%d') AS day, name FROM holidays WHERE holiday_on >= DATE_SUB(UTC_DATE(), INTERVAL 400 DAY) AND holiday_on < DATE_ADD(UTC_DATE(), INTERVAL 800 DAY)",
  );
  return { holidays: new Map(rows.map((row) => [String(row.day), String(row.name)])), workingDays: new Set(await getWorkingDays(db)) };
}

export async function holidayContext(db: Queryable = getDbPool()) {
  const [settings, calendar] = await Promise.all([loadHolidaySettings(db), loadHolidayCalendar(db)]);
  return { settings, calendar };
}

// Upcoming holidays and the open tasks due on each (for Admin's actions).
export async function upcomingHolidayLoad(db: Queryable = getDbPool()): Promise<{ day: string; name: string; openTasks: number }[]> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT DATE_FORMAT(h.holiday_on, '%Y-%m-%d') AS day, h.name,
       (SELECT COUNT(*) FROM tasks t WHERE t.deleted_at IS NULL AND t.status IN ('OPEN', 'IN_PROGRESS', 'BLOCKED')
          AND DATE(DATE_ADD(t.due_at, INTERVAL 330 MINUTE)) = h.holiday_on) AS open_tasks
     FROM holidays h WHERE h.holiday_on >= DATE(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 330 MINUTE)) ORDER BY h.holiday_on LIMIT 60`,
  );
  return rows.map((row) => ({ day: String(row.day), name: String(row.name), openTasks: Number(row.open_tasks) }));
}

// Open tasks due on an India day.
export async function openTasksDueOn(day: string, db: Queryable = getDbPool()): Promise<{ id: number; taskNo: string; title: string; assigneeId: number; dueAt: Date; rowVersion: number }[]> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id, task_no, title, assignee_id, due_at, row_version FROM tasks
     WHERE deleted_at IS NULL AND status IN ('OPEN', 'IN_PROGRESS', 'BLOCKED') AND DATE(DATE_ADD(due_at, INTERVAL 330 MINUTE)) = ? LIMIT 2000`,
    [day],
  );
  return rows.map((row) => ({ id: Number(row.id), taskNo: String(row.task_no), title: String(row.title), assigneeId: Number(row.assignee_id), dueAt: row.due_at as Date, rowVersion: Number(row.row_version) }));
}

// Named holidays for the task calendars (empty when IT turned that off).
export async function calendarHolidays(db: Queryable = getDbPool()): Promise<Record<string, string>> {
  const { settings, calendar } = await holidayContext(db);
  return settings.showOnCalendars && settings.mode !== "OFF" ? Object.fromEntries(calendar.holidays) : {};
}
