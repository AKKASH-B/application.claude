// Empty on web (same origin as the Vercel deployment). Native builds get the full URL from eas.json.
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/+$/, "");
export const APP_NAME = "Kharcha";
export const SUPPORT_EMAIL = "support@example.com"; // TODO: replace with your real support address before publishing
