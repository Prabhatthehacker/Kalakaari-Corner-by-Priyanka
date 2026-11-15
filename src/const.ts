export const LOGIN_EVENT = "kalakari:login";

// Opens the sign-in window (see components/AuthDialog.tsx).
export const startLogin = () => {
  window.dispatchEvent(new Event(LOGIN_EVENT));
};

// Builds a link that works on GitHub Pages, e.g. appUrl("/class/5") or appUrl("/", "open=recordings").
export const appUrl = (path = "/", query = "") => {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}${query ? `?${query}` : ""}#${path}`;
};
