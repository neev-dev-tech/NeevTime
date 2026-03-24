import { create } from 'zustand';

const useStore = create((set) => ({
  // Auth State
  auth: JSON.parse(localStorage.getItem('user')) || null,
  setAuth: (user) => {
    localStorage.setItem('user', JSON.stringify(user));
    set({ auth: user });
  },
  logout: () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    set({ auth: null });
  },

  // UI State
  theme: localStorage.getItem('theme') || 'light',
  setTheme: (theme) => {
    localStorage.setItem('theme', theme);
    set({ theme });
  },

  // Notifications
  notifications: [],
  addNotification: (notification) => set((state) => ({ 
    notifications: [...state.notifications, { ...notification, id: Date.now() }] 
  })),
  removeNotification: (id) => set((state) => ({ 
    notifications: state.notifications.filter(n => n.id !== id) 
  })),

  // Global Refresh Helpers
  refreshKey: 0,
  triggerRefresh: () => set((state) => ({ refreshKey: state.refreshKey + 1 })),
}));

export default useStore;
