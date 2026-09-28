// Shared by middleware (presence check only) and the session code. No
// crypto or server-only import here so middleware can use it.
export const SESSION_COOKIE_NAME = "ars_session";
export const DEVICE_COOKIE_NAME = "ars_device";
export const SESSION_TTL_SECONDS = 60 * 60 * 12;
export const DEVICE_COOKIE_TTL_SECONDS = 60 * 60 * 24 * 400;
