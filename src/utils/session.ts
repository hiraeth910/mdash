// Even though a valid role/userId sit in localStorage, a login older than this
// must not silently carry the user forward — they have to enter credentials again.
const SESSION_TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

export const recordLogin = () => {
  localStorage.setItem("loginAt", Date.now().toString());
};

// Missing timestamp counts as expired so a session stored before this feature
// shipped gets one forced re-login rather than running with no expiry at all.
export const isSessionExpired = (): boolean => {
  const loginAt = localStorage.getItem("loginAt");
  if (!loginAt) return true;
  const loginTime = Number(loginAt);
  return Number.isNaN(loginTime) || Date.now() - loginTime > SESSION_TTL_MS;
};

export const clearStoredSession = () => {
  localStorage.removeItem("role");
  localStorage.removeItem("userId");
  localStorage.removeItem("loginAt");
};
