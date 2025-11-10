import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

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

// Read initial values from localStorage
const storedRole = localStorage.getItem("role");
const storedUserId = localStorage.getItem("userId");

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      userRole: storedRole ? storedRole : null,
      userId: storedUserId ? Number(storedUserId) : null,
      setUser: (role, id) => {
        set({ userRole: role, userId: id });
        // Ensure localStorage is in sync
        if (role !== null) {
          localStorage.setItem("role", role);
        } else {
          localStorage.removeItem("role");
        }
        if (id !== null) {
          localStorage.setItem("userId", id.toString());
        } else {
          localStorage.removeItem("userId");
        }
      },
      logout: () => {
        set({ userRole: null, userId: null });
        localStorage.removeItem("role");
        localStorage.removeItem("userId");
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
