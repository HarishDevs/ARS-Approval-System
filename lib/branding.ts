// The one place for the app's brand: ARS GREEN STEEL CMS (owner's approved
// logo, Nov 2026). Every brand component, the page metadata, the manifest,
// the install card and the push notifications read from here.
// The images in public/branding/ are made only from the owner's master PNG
// (resized, cropped, background extended; never redrawn or recoloured).
// The old files in public/brand/ and public/icons/ stay on disk for old
// emails and records but are no longer used by the app.
export const APP_BRANDING = {
  appName: "ARS CMS",
  brandName: "ARS GREEN STEEL",
  subtitle: "GREEN STEEL",
  shortName: "ARS CMS",
  /** The manifest's long name. */
  fullName: "ARS CMS — GREEN STEEL",
  description: "ARS CMS, the Central Management System of ARS Steels & Alloy International Pvt. Ltd.",
  logoAlt: "ARS GREEN STEEL CMS",
  /** The full 3:2 logo on its blue background (480×320, for headers and cards). */
  logo: "/branding/ars-cms-logo-480.png",
  /** The full 3:2 logo, 192×128: headers and marks up to 48 px tall. */
  logoSmall: "/branding/ars-cms-logo-192.png",
  logoWebp: "/branding/ars-cms-logo.webp",
  /** The full 3:2 logo, 1200×800. */
  logoLarge: "/branding/ars-cms-logo.png",
  /** v1.49.0 (owner): the logo without its background (only the background
   *  made transparent; lettering untouched). White lettering, for blue or dark
   *  surfaces (850×602, from the master). */
  logoClear: "/branding/ars-cms-logo-clear.png",
  /** Horizontal ARS | GREEN STEEL CMS, white lettering, no background (from
   *  the brand sheet's dark header banner), for the sign-in brand panel. */
  logoHorizontalClear: "/branding/ars-cms-logo-horizontal-clear.png",
  /** Navy lettering, no background (from the brand sheet's light icon), for
   *  light surfaces. */
  logoLightClear: "/branding/ars-cms-logo-light-clear.png",
  /** The ARS lettering with its red swoosh, no background (573×195, from the
   *  owner's ARS Green Steel logo file): the centre of the round loaders. */
  arsWordmark: "/branding/ars-wordmark-clear.png",
  /** v1.49.0 (owner): the default profile picture until a person uploads a
   *  photo: the blue circular icon for approvers, the white one for everyone
   *  else (256×256, from the brand sheet's circular icons). */
  avatarApprover: "/branding/ars-cms-avatar-blue.png",
  avatarUser: "/branding/ars-cms-avatar-light.png",
  /** The square app icon (rounded corners), 192×192. */
  icon: "/branding/ars-cms-icon-192.png",
  icon512: "/branding/ars-cms-icon-512.png",
  icon96: "/branding/ars-cms-icon-96.png",
  icon64: "/branding/ars-cms-icon-64.png",
  icon48: "/branding/ars-cms-icon-48.png",
  favicon16: "/branding/ars-cms-icon-16.png",
  favicon32: "/branding/ars-cms-icon-32.png",
  faviconIco: "/favicon.ico",
  appleTouchIcon: "/branding/ars-cms-apple-touch-icon.png",
  maskable: "/branding/ars-cms-maskable-512.png",
  ogImage: "/branding/ars-cms-og-image.png",
  /** Owner's brand sheet palette. */
  colors: {
    primary: "#004B8D",
    accent: "#0A72D9",
    red: "#E30613",
    light: "#EAF3FF",
  },
  /** Browser bar and installed-app title bar. */
  themeColor: "#004B8D",
  /** The installed app's splash screen (the logo's own blue). */
  backgroundColor: "#004B8D",
} as const;

/** Page titles: "Approvals · ARS CMS". */
export const TITLE_TEMPLATE = `%s · ${APP_BRANDING.appName}`;
