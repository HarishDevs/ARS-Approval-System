// v1.43.0: shared by the server's layout choice and the browser's LayoutSync.
export type LayoutMode = "mobile" | "desktop";
export const LAYOUT_COOKIE = "ars_layout";
export const MOBILE_MAX_WIDTH = 767; // 0–767 px: the mobile layout
// Phones only (tablets keep the desktop layout): Android phones say "Mobile".
export const PHONE_UA = /iPhone|iPod|Android.*Mobile|Windows Phone|Mobile Safari(?!.*iPad)/i;
