import { create } from 'zustand';

const useStore = create((set) => ({
  // Auth State
  auth: JSON.parse(localStorage.getItem('user')) || null,
  setAuth: (user) => {
    localStorage.setItem('user', JSON.stringify(user));
    set({ auth: user });
  },
  logout: () => {
    // Record the audit entry before the token is discarded. Fire-and-forget:
    // a failed call must never block the user from signing out.
    const token = localStorage.getItem('token');
    if (token) {
      fetch('/api/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      }).catch(() => {});
    }
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    set({ auth: null });
  },

  // Theme state used to live here as well, under its own 'theme' localStorage
  // key, writing state that nothing read and touching no DOM class. Nothing
  // consumed it, but a control wired to it by mistake would have looked exactly
  // like a toggle that does nothing. ThemeProvider in components/Theme.jsx is
  // the single owner: it holds 'theme-dark-mode' and applies the `dark` class.

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
