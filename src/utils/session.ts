// Even though a valid role/userId sit in storage, a login older than this
// must not silently carry the user forward — they have to enter credentials again.
const SESSION_TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

const KEYS = ["role", "userId", "loginAt", "token", "userName"] as const;

// Each tab keeps its own login in sessionStorage, so a user login and an admin login can run side
// by side in one browser without one tab sending the other's token. localStorage only remembers the
// most recent login, which a newly opened tab starts from.
if (!sessionStorage.getItem("token") && localStorage.getItem("token")) {
  KEYS.forEach((key) => {
    const value = localStorage.getItem(key);
    if (value !== null) sessionStorage.setItem(key, value);
  });
}

export const getTabToken = (): string | null => sessionStorage.getItem("token");
export const getTabRole = (): string | null => sessionStorage.getItem("role");
export const getTabUserId = (): string | null => sessionStorage.getItem("userId");
export const getTabUserName = (): string | null => sessionStorage.getItem("userName");
export const saveUserName = (name: string) => sessionStorage.setItem("userName", name);

export const saveLogin = (role: string, id: number, token: string, name?: string) => {
  const values: Record<string, string> = { role, userId: String(id), loginAt: Date.now().toString(), token };
  if (name) values.userName = name;
  Object.entries(values).forEach(([key, value]) => {
    sessionStorage.setItem(key, value);
    localStorage.setItem(key, value);
  });
};

// Missing timestamp counts as expired so a session stored before this feature
// shipped gets one forced re-login rather than running with no expiry at all.
export const isSessionExpired = (): boolean => {
  const loginAt = sessionStorage.getItem("loginAt");
  if (!loginAt) return true;
  const loginTime = Number(loginAt);
  return Number.isNaN(loginTime) || Date.now() - loginTime > SESSION_TTL_MS;
};

// Logs out this tab only. The remembered login for new tabs is dropped when it is this tab's
// login (or a pre-token leftover), never another tab's.
export const clearStoredSession = () => {
  const tabToken = sessionStorage.getItem("token");
  const lastToken = localStorage.getItem("token");
  if (!lastToken || lastToken === tabToken) KEYS.forEach((key) => localStorage.removeItem(key));
  KEYS.forEach((key) => sessionStorage.removeItem(key));
  sessionStorage.removeItem("user-store");
};

// Sessions stored before the server issued tokens cannot call the API.
export const hasToken = (): boolean => !!sessionStorage.getItem("token");

export const isAdminRole = (role: string | null): boolean =>
  role === "admin" || role === "superadmin";
