import { useUserStore } from "./store/store";
import { apiClient } from "./utils/api";

export async function checkAuthAndHandleLogout(): Promise<boolean | void> {
  try {
    const userId = useUserStore.getState().userId;
    if (userId == null) return; // No logged-in user, skip
    
    const response = await apiClient.get('/authorize', {
      headers: {
        'x-userid': userId, // number is fine; axios/stringify handles it
      },
      validateStatus: () => true, // Prevent axios from throwing on 401
    });

    if (
      response.status === 401 ||
      response?.data?.modifiedAfterLogin === true
    ) {
      useUserStore.getState().logout();
      window.location.href = '/';
      return;
    }

    return true;
  } catch (error) {
    console.error('Auth check failed:', error);
    return;
  }
}