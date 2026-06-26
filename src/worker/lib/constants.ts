export const USERNAME_RE = /^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const MAX_DISPLAY_NAME = 100;
export const MAX_LINKS = 50;
export const MAX_LINK_TITLE = 100;
export const MAX_LINK_URL = 2048;
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export const RESERVED_USERNAMES = new Set([
  "api", "avatars", "signin", "signup", "create", "settings", "analytics", "admin",
]);

export const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif", "image/avif",
]);
