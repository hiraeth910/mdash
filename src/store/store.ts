import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { isSessionExpired, clearStoredSession, hasToken, getTabRole, getTabUserId } from "../utils/session";

interface UserState {
  userRole: string | null;
  userId: number | null;
  setUser: (role: string | null, id: number | null) => void;
  logout: () => void;
}

interface ThemeState {
  theme: "light" | "dark";
  toggleTheme: () => void;
  setTheme: (theme: "light" | "dark") => void;
}

// Read this tab's login. A stored login older than the session TTL is discarded
// here so a stale role/userId never boots the app straight past the login screen.
let storedRole = getTabRole();
let storedUserId = getTabUserId();
if ((storedRole || storedUserId) && (isSessionExpired() || !hasToken())) {
  clearStoredSession();
  storedRole = null;
  storedUserId = null;
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      userRole: storedRole ? storedRole : null,
      userId: storedUserId ? Number(storedUserId) : null,
      setUser: (role, id) => {
        set({ userRole: role, userId: id });
        if (role === null || id === null) clearStoredSession();
      },
      logout: () => {
        set({ userRole: null, userId: null });
        clearStoredSession();
      },
    }),
    {
      name: "user-store", // Key name in sessionStorage
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: "dark",
      toggleTheme: () => {
        const newTheme = get().theme === "dark" ? "light" : "dark";
        set({ theme: newTheme });
        document.documentElement.setAttribute("data-theme", newTheme);
      },
      setTheme: (theme) => {
        set({ theme });
        document.documentElement.setAttribute("data-theme", theme);
      },
    }),
    {
      name: "theme-store",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
