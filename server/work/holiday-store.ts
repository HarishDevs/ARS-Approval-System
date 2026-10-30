import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
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

// The organisation's holidays, plus (D-218) those of one department.
export async function loadHolidayCalendar(db: Queryable = getDbPool(), departmentId: number | null = null): Promise<HolidayCalendar> {
  const [rows] = await db.query<RowDataPacket[]>(
    "SELECT DATE_FORMAT(holiday_on, '%Y-%m-%d') AS day, name FROM holidays WHERE holiday_on >= DATE_SUB(UTC_DATE(), INTERVAL 400 DAY) AND holiday_on < DATE_ADD(UTC_DATE(), INTERVAL 800 DAY)",
  );
  const holidays = new Map(rows.map((row) => [String(row.day), String(row.name)]));
  if (departmentId) {
    const [own] = await db.query<RowDataPacket[]>(
      "SELECT DATE_FORMAT(holiday_on, '%Y-%m-%d') AS day, name FROM department_holidays WHERE department_id = ? AND holiday_on >= DATE_SUB(UTC_DATE(), INTERVAL 400 DAY) AND holiday_on < DATE_ADD(UTC_DATE(), INTERVAL 800 DAY)",
      [departmentId],
    );
    for (const row of own) if (!holidays.has(String(row.day))) holidays.set(String(row.day), String(row.name));
  }
  return { holidays, workingDays: new Set(await getWorkingDays(db)) };
}

// `departmentId`: whose holidays count too (the task's assignee's department).
export async function holidayContext(db: Queryable = getDbPool(), departmentId: number | null = null) {
  const [settings, calendar] = await Promise.all([loadHolidaySettings(db), loadHolidayCalendar(db, departmentId)]);
  return { settings, calendar };
}

export async function departmentOf(userId: number, db: Queryable = getDbPool()): Promise<number | null> {
  const [rows] = await db.query<RowDataPacket[]>("SELECT department_id FROM users WHERE id = ?", [userId]);
  return rows[0]?.department_id ? Number(rows[0].department_id) : null;
}

// ---- department holidays (D-218) --------------------------------------------------------
export async function listDepartmentHolidays(db: Queryable = getDbPool()): Promise<{ departmentId: number; departmentName: string; day: string; name: string }[]> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT h.department_id, d.name AS department_name, DATE_FORMAT(h.holiday_on, '%Y-%m-%d') AS day, h.name FROM department_holidays h JOIN departments d ON d.id = h.department_id
     WHERE h.holiday_on >= DATE(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 330 MINUTE)) ORDER BY h.holiday_on, d.name LIMIT 300`,
  );
  return rows.map((row) => ({ departmentId: Number(row.department_id), departmentName: String(row.department_name), day: String(row.day), name: String(row.name) }));
}
export async function addDepartmentHoliday(departmentId: number, day: string, name: string, by: number, db: Queryable = getDbPool()): Promise<boolean> {
  const [result] = await db.query<ResultSetHeader>("INSERT IGNORE INTO department_holidays (department_id, holiday_on, name, created_by) VALUES (?, ?, ?, ?)", [departmentId, day, name, by]);
  return result.affectedRows === 1;
}
export async function removeDepartmentHoliday(departmentId: number, day: string, db: Queryable = getDbPool()): Promise<boolean> {
  const [result] = await db.query<ResultSetHeader>("DELETE FROM department_holidays WHERE department_id = ? AND holiday_on = ?", [departmentId, day]);
  return result.affectedRows === 1;
}

// ---- digest and recurrence settings (D-218) -------------------------------------------
export async function loadSetting(key: string, db: Queryable = getDbPool()): Promise<string | null> {
  const [rows] = await db.query<RowDataPacket[]>("SELECT value FROM system_settings WHERE setting_key = ? LIMIT 1", [key]);
  return rows[0]?.value ?? null;
}
export async function saveJsonSetting(key: string, value: unknown, updatedBy: number, db: Queryable = getDbPool()): Promise<void> {
  await upsertSetting({ key, group: "TASKS", valueType: "JSON", encrypted: false, storedValue: JSON.stringify(value), updatedBy }, db);
}

// Upcoming organisation holidays and the open tasks due on each (for Admin's actions).
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
export async function calendarHolidays(db: Queryable = getDbPool(), departmentId: number | null = null): Promise<Record<string, string>> {
  const { settings, calendar } = await holidayContext(db, departmentId);
  return settings.showOnCalendars && settings.mode !== "OFF" ? Object.fromEntries(calendar.holidays) : {};
}
