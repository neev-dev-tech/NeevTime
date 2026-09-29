import { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, LogOut, Info, HelpCircle, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import PropTypes from 'prop-types';
import { modules, personnelSidebar, deviceSidebar, attendanceSidebar, systemSidebar } from '../config/navigation';
import useBranding from '../hooks/useBranding';
import useDismissable from '../hooks/useDismissable';
import GlobalSearch from '../components/GlobalSearch';
import AnimatedBackground from '../components/AnimatedBackground';
import NotificationCenter from '../components/NotificationCenter';
import { DarkModeToggle } from '../components/Theme';
import VersionDisplay from '../components/VersionDisplay';
import useStore from '../store/useStore';
import { usePermissions } from '../hooks/usePermissions';

export default function MainLayout({ children }) {
  const { logo, hasLogo, name } = useBranding();
  const location = useLocation();
  const navigate = useNavigate();
  const { auth, logout } = useStore();
  const { isViewer } = usePermissions();
  const [activeModule, setActiveModule] = useState('Dashboard');
  const [expandedGroups, setExpandedGroups] = useState({});
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const profileMenuRef = useRef(null);
  const profileTriggerRef = useRef(null);
  // Declared after showProfileMenu on purpose: the hook reads it, and placing
  // the call above the useState throws "cannot access before initialization".
  useDismissable(showProfileMenu, () => setShowProfileMenu(false), profileMenuRef, profileTriggerRef);
  const [showAbout, setShowAbout] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const toggleGroup = (groupName) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupName]: !prev[groupName]
    }));
  };

  const currentSidebar = useMemo(() => {
    switch (activeModule) {
      case 'Personnel': return personnelSidebar;
      case 'Device': return deviceSidebar;
      case 'Attendance': return attendanceSidebar;
      case 'System': return systemSidebar;
      default: return [];
    }
  }, [activeModule]);

  useEffect(() => {
    const path = location.pathname;
    if (path === '/' || path === '/dashboard') {
      setActiveModule('Dashboard');
    } else if (['/devices', '/device-commands', '/device-messages', '/device-sync'].some(p => path.startsWith(p))) {
      setActiveModule('Device');
    } else if (['/logs', '/shifts', '/shift-rotations', '/timetables', '/break-times', '/schedule', '/rules', '/holidays', '/leaves', '/leave-types', '/leave-balance', '/attendance', '/reports', '/export', '/import', '/geofences', '/holiday-locations', '/mobile', '/regularizations'].some(p => path.startsWith(p))) {
      setActiveModule('Attendance');
    } else if (['/settings', '/users', '/database', '/system-logs', '/integrations', '/api-access', '/advanced-reports', '/audit'].some(p => path.startsWith(p))) {
      setActiveModule('System');
    } else {
      setActiveModule('Personnel');
    }
  }, [location.pathname]);

  useEffect(() => {
    currentSidebar.forEach(group => {
      if (group.items.some(item => {
        if (item.path.includes('?')) {
          return (location.pathname + location.search) === item.path;
        }
        return location.pathname === item.path;
      })) {
        setExpandedGroups(prev => ({ ...prev, [group.group]: true }));
      }
    });
  }, [location.pathname, location.search, currentSidebar]);

  return (
    <div className="app-shell flex h-screen font-sans overflow-hidden">
      <AnimatedBackground />
      <GlobalSearch />

      {/* ── Persistent left sidebar ─────────────────────────────────────── */}
      <aside className="w-64 flex-shrink-0 flex flex-col border-r border-slate-200 dark:border-slate-700 bg-app-surface/90 backdrop-blur-xl z-40">
        {/* Logo */}
        <div className="h-16 flex items-center gap-2.5 px-5 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
          {hasLogo ? (
            <img src={logo} alt={name} className="h-8 w-auto max-w-[180px] object-contain" />
          ) : (
            <>
              <img src="/logo.png" alt="" aria-hidden="true" className="w-8 h-8" />
              <span className="text-xl font-bold">
                <span className="text-slate-800 dark:text-slate-100">Neev</span><span className="text-slate-900 dark:text-slate-100">Time</span>
              </span>
            </>
          )}
        </div>

        {/* Nav: modules, with the active one expanded to its groups/items */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          <p className="px-3 mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Main</p>
          {modules.map((mod) => {
            const isActive = activeModule === mod.name;
            return (
              <div key={mod.name}>
                <button
                  onClick={() => { setActiveModule(mod.name); if (mod.path !== '#') navigate(mod.path); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-ui ${isActive
                    ? 'bg-slate-900 text-white shadow-sm dark:bg-slate-100 dark:text-slate-900'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-app-hover dark:hover:bg-slate-800'}`}
                >
                  <mod.icon size={18} />
                  <span className="flex-1 text-left">{mod.name}</span>
                  {currentSidebar.length > 0 && isActive && <ChevronDown size={14} />}
                </button>

                {isActive && currentSidebar.length > 0 && (
                  <div className="mt-1 mb-2 ml-4 pl-3 border-l border-slate-200 dark:border-slate-700 space-y-0.5">
                    {currentSidebar.map((group, i) => (
                      <div key={i}>
                        <button
                          onClick={() => toggleGroup(group.group)}
                          className="w-full px-2 py-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        >
                          <span>{group.group}</span>
                          {expandedGroups[group.group] ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        </button>
                        <AnimatePresence>
                          {expandedGroups[group.group] && (
                            <motion.nav
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden space-y-0.5 pb-1"
                            >
                              {group.items.map((item, j) => {
                                const itemActive = item.path.includes('?')
                                  ? (location.pathname + location.search) === item.path
                                  : location.pathname === item.path;
                                return (
                                  <Link
                                    key={j}
                                    to={item.path}
                                    className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-sm transition-ui ${itemActive
                                      ? 'bg-app-hover text-slate-900 dark:text-white font-semibold'
                                      : 'text-slate-500 dark:text-slate-400 hover:bg-app-hover hover:text-slate-800 dark:hover:text-slate-200'}`}
                                  >
                                    <item.icon size={16} />
                                    {item.label}
                                  </Link>
                                );
                              })}
                            </motion.nav>
                          )}
                        </AnimatePresence>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-700 flex-shrink-0">
          <VersionDisplay />
        </div>
      </aside>

      {/* ── Main column ─────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col">
        {isViewer && (
          <div className="px-6 py-2 text-center text-xs font-semibold bg-amber-100 text-amber-900 border-b border-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-800">
            Read-only access — you can view everything here, but changes are disabled for your account.
          </div>
        )}

        {/* Top bar */}
        <header className="h-16 flex-shrink-0 flex items-center justify-between px-6 border-b border-slate-200 dark:border-slate-700 bg-app-surface/80 backdrop-blur-md">
          {/* Visible search that opens the existing Ctrl/⌘+K palette — same
              component, just discoverable. Dispatches the shortcut it already
              listens for, so search behaviour is untouched. */}
          <button
            type="button"
            onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}
            className="flex items-center gap-2.5 w-full max-w-md h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-app-hover/60 text-sm text-slate-400 hover:border-slate-300 dark:hover:border-slate-600 hover:text-slate-600 dark:hover:text-slate-300 transition-colors cursor-pointer"
            aria-label="Search employees, devices and pages"
          >
            <Search size={16} aria-hidden="true" />
            <span className="flex-1 text-left">Search employees, devices, pages…</span>
            <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded-md border border-slate-200 dark:border-slate-600 bg-app-surface text-[11px] font-medium text-slate-500">⌘K</kbd>
          </button>
          <div className="flex items-center gap-3">
            <DarkModeToggle />
            <NotificationCenter />
            <div className="relative">
              <button
                ref={profileTriggerRef}
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-full hover:bg-app-hover transition-colors"
              >
                <div className="w-9 h-9 bg-slate-900 dark:bg-slate-100 dark:text-slate-900 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-sm">
                  {auth?.username?.charAt(0).toUpperCase() || 'U'}
                </div>
                <ChevronDown size={14} className={`text-slate-400 transition-transform ${showProfileMenu ? 'rotate-180' : ''}`} />
              </button>
              <AnimatePresence>
                {showProfileMenu && (
                  <motion.div
                    ref={profileMenuRef}
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    className="absolute right-0 mt-2 w-56 bg-app-surface shadow-xl rounded-2xl overflow-hidden z-40 border border-slate-200 dark:border-slate-700"
                  >
                    <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 bg-app-hover/50 dark:bg-slate-900/40">
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{auth?.username}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{auth?.role}</p>
                    </div>
                    <div className="py-2">
                      <button onClick={() => { setShowProfileMenu(false); setShowAbout(true); }} className="w-full px-4 py-2 text-left text-sm text-slate-600 dark:text-slate-300 hover:bg-app-hover dark:hover:bg-slate-700 flex items-center gap-3">
                        <Info size={16} /> <span>About</span>
                      </button>
                      <button onClick={() => { setShowProfileMenu(false); setShowHelp(true); }} className="w-full px-4 py-2 text-left text-sm text-slate-600 dark:text-slate-300 hover:bg-app-hover dark:hover:bg-slate-700 flex items-center gap-3">
                        <HelpCircle size={16} /> <span>Help</span>
                      </button>
                    </div>
                    <div className="border-t border-slate-100 dark:border-slate-700">
                      <button onClick={logout} className="w-full px-4 py-2.5 text-left text-sm text-red-600 dark:text-rose-400 hover:bg-red-50 dark:hover:bg-rose-500/10 flex items-center gap-3 font-semibold">
                        <LogOut size={16} /> <span>Logout</span>
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        <main className="flex-1 min-h-0 overflow-auto">
          <div className="p-6">
            {children}
          </div>
        </main>
      </div>

      {/* Modals */}
      {showAbout && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4" onClick={() => setShowAbout(false)}>
          <div className="bg-app-surface rounded-2xl shadow-2xl p-6 w-full max-w-sm text-center" onClick={e => e.stopPropagation()}>
            <div className="text-3xl font-bold mb-2">
              <span className="text-slate-800 dark:text-slate-100">Neev</span><span className="text-slate-900 dark:text-slate-100">Time</span>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Simplicity Attendance — biometric attendance management</p>
            <div className="flex justify-center mb-4"><VersionDisplay /></div>
            <button onClick={() => setShowAbout(false)} className="w-full py-2 bg-slate-900 hover:bg-slate-700 text-white text-sm font-semibold rounded-lg">Close</button>
          </div>
        </div>
      )}

      {showHelp && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4" onClick={() => setShowHelp(false)}>
          <div className="bg-app-surface rounded-2xl shadow-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4">Quick Help</h3>
            <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
              <div className="flex items-center justify-between">
                <span>Global search (employees, devices, pages)</span>
                <kbd className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 border dark:border-slate-600 rounded text-xs font-mono">Ctrl / ⌘ + K</kbd>
              </div>
              <div className="flex items-center justify-between">
                <span>Close dialogs</span>
                <kbd className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 border dark:border-slate-600 rounded text-xs font-mono">Esc</kbd>
              </div>
              <hr className="dark:border-slate-700" />
              <p><b className="text-slate-800 dark:text-slate-100">Modules:</b> switch from the left sidebar; each module expands to its own sub-menu.</p>
              <p><b className="text-slate-800 dark:text-slate-100">Reports:</b> Attendance → Reports → All Reports. Every report exports CSV / Excel / PDF.</p>
              <p><b className="text-slate-800 dark:text-slate-100">Employee portal:</b> employees sign in at <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded">/portal/login</code> after HR sets a portal password on their profile.</p>
              <p><b className="text-slate-800 dark:text-slate-100">Theme:</b> the toggle in the top bar switches light / dark.</p>
            </div>
            <button onClick={() => setShowHelp(false)} className="mt-5 w-full py-2 bg-slate-900 hover:bg-slate-700 text-white text-sm font-semibold rounded-lg">Got it</button>
          </div>
        </div>
      )}
    </div>
  );
}

MainLayout.propTypes = {
  children: PropTypes.node.isRequired,
};
