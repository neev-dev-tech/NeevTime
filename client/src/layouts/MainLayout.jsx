import { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, LogOut, Info, HelpCircle, Search, Menu, X } from 'lucide-react';
import { motion, AnimatePresence, MotionConfig } from 'framer-motion';
import PropTypes from 'prop-types';
import { modules, personnelSidebar, deviceSidebar, attendanceSidebar, systemSidebar } from '../config/navigation';
import useBranding from '../hooks/useBranding';
import useDismissable from '../hooks/useDismissable';
import GlobalSearch from '../components/GlobalSearch';
import Modal from '../components/Modal';
import AnimatedBackground from '../components/AnimatedBackground';
import NotificationCenter from '../components/NotificationCenter';
import { DarkModeToggle } from '../components/Theme';
import VersionDisplay from '../components/VersionDisplay';
import useStore from '../store/useStore';
import { usePermissions } from '../hooks/usePermissions';
import { LegalLinks } from '../pages/legal/LegalLayout';

// Which navigation module a route belongs to.
const MODULE_PREFIXES = [
  ['Device', ['/devices', '/device-commands', '/device-messages', '/device-sync']],
  ['Attendance', ['/logs', '/shifts', '/shift-rotations', '/timetables', '/break-times', '/schedule', '/rules', '/holidays', '/leaves', '/leave-types', '/leave-balance', '/attendance', '/reports', '/export', '/import', '/geofences', '/holiday-locations', '/mobile', '/regularizations']],
  ['System', ['/settings', '/users', '/database', '/system-logs', '/integrations', '/api-access', '/advanced-reports', '/audit']]
];
function moduleForPath(path) {
  if (path === '/' || path === '/dashboard') return 'Dashboard';
  const hit = MODULE_PREFIXES.find(([, prefixes]) => prefixes.some(p => path.startsWith(p)));
  return hit ? hit[0] : 'Personnel';
}

export default function MainLayout({ children }) {
  const { logo, hasLogo, name } = useBranding();
  const location = useLocation();
  const navigate = useNavigate();
  const { auth, logout } = useStore();
  const { isViewer, canAdminister } = usePermissions();
  // System holds settings, users, database and integrations — admin-only on
  // the server, so other roles are not shown a module that only bounces them.
  const visibleModules = modules.filter(m => m.name !== 'System' || canAdminister);
  const [activeModule, setActiveModule] = useState('Dashboard');
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const profileMenuRef = useRef(null);
  const profileTriggerRef = useRef(null);
  // Declared after showProfileMenu on purpose: the hook reads it, and placing
  // the call above the useState throws "cannot access before initialization".
  useDismissable(showProfileMenu, () => setShowProfileMenu(false), profileMenuRef, profileTriggerRef);
  const [showAbout, setShowAbout] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  // Below lg the sidebar is an off-canvas drawer. It closes on every route
  // change so tapping a link both navigates and gets the menu out of the way.
  const [navOpen, setNavOpen] = useState(false);
  useEffect(() => { setNavOpen(false); }, [location.pathname, location.search]);
  useEffect(() => {
    if (!navOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setNavOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navOpen]);

  const currentSidebar = useMemo(() => {
    switch (activeModule) {
      case 'Personnel': return personnelSidebar;
      case 'Device': return deviceSidebar;
      case 'Attendance': return attendanceSidebar;
      case 'System': return systemSidebar;
      default: return [];
    }
  }, [activeModule]);

  // Re-applied whenever the drawer closes, so browsing another module's pages
  // in the drawer without picking one leaves the rail matching the page on screen.
  useEffect(() => {
    if (!navOpen) setActiveModule(moduleForPath(location.pathname));
  }, [location.pathname, navOpen]);

  // The browser tab and the screen-reader page title follow the page. Read from
  // the page's own heading, so every page gets one without each setting it; the
  // static "NeevTime" made every tab look the same. Pages render their heading
  // after data loads, so the heading is watched rather than read once.
  useEffect(() => {
    const main = document.getElementById('main-content');
    if (!main) return undefined;
    // A timer, not requestAnimationFrame: rAF does not run in a background
    // tab, and a tab's title is exactly what is read while it is in the background.
    let timer = 0;
    const apply = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const h1 = main.querySelector('h1');
        // data-page-title when the heading also carries a count or badge.
        const heading = (h1?.dataset.pageTitle || h1?.textContent || '').trim();
        const next = heading ? `${heading} · NeevTime` : 'NeevTime';
        if (document.title !== next) document.title = next;
      }, 0);
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(main, { childList: true, subtree: true, characterData: true });
    return () => { observer.disconnect(); clearTimeout(timer); };
  }, [location.pathname]);

  return (
    // reducedMotion="user": framer-motion's JS animations follow the OS
    // "reduce motion" setting, as the CSS ones already do.
    <MotionConfig reducedMotion="user">
    <div className="app-shell flex h-screen font-sans overflow-hidden">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[2000] focus:px-3 focus:py-2 focus:rounded-lg focus:bg-slate-900 focus:text-white focus:text-sm">
        Skip to content
      </a>
      <AnimatedBackground />
      <GlobalSearch />

      {/* Drawer backdrop (small screens only) */}
      {navOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden"
          onClick={() => setNavOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Left navigation: module rail + the active module's pages ──────
          Persistent from lg; below that the pair slides in as one drawer. */}
      <aside
        id="app-sidebar"
        className={`fixed inset-y-0 left-0 z-50 flex border-r border-slate-200 dark:border-slate-800 bg-sidebar
                    transition-transform duration-200 ease-out lg:static lg:z-auto lg:translate-x-0 lg:flex-shrink-0
                    ${navOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full'}`}
      >
        {/* Rail: one icon per module */}
        <nav aria-label="Modules" className="w-[72px] flex-shrink-0 flex flex-col items-center border-r border-slate-200 dark:border-slate-800">
          <div className="h-16 w-full flex items-center justify-center border-b border-slate-200 dark:border-slate-800">
            <img
              src={hasLogo ? logo : '/logo.png'}
              alt={name}
              className="w-9 h-9 object-contain"
            />
          </div>
          <div className="flex-1 w-full overflow-y-auto py-3 px-2 space-y-1">
            {visibleModules.map((mod) => {
              const isActive = activeModule === mod.name;
              return (
                <button
                  key={mod.name}
                  type="button"
                  onClick={() => {
                    setActiveModule(mod.name);
                    // In the phone drawer, a module tap only switches the pages
                    // panel so the user can pick one; navigating would close the
                    // drawer first. Dashboard has no pages, so it navigates.
                    if (navOpen && mod.name !== 'Dashboard') return;
                    if (mod.path !== '#') navigate(mod.path);
                  }}
                  aria-current={isActive ? 'page' : undefined}
                  title={mod.name}
                  className={`w-full flex flex-col items-center gap-1 py-2 rounded-xl transition-ui focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 ${isActive
                    ? 'bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-900'
                    : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-200'}`}
                >
                  <mod.icon size={20} />
                  <span className={`text-[11px] leading-none ${isActive ? 'font-semibold' : 'font-medium'}`}>{mod.name}</span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* Panel: the active module's pages under plain headings. Dashboard has
            no pages, so the panel steps aside and the content gets the room. */}
        <div className={`${currentSidebar.length > 0 ? 'flex' : 'hidden'} w-60 flex-col`}>
          <div className="h-16 flex items-center justify-between gap-2 px-5 border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
            <h2 className="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">{activeModule}</h2>
            <button
              type="button"
              onClick={() => setNavOpen(false)}
              className="grid place-items-center w-9 h-9 rounded-lg text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden"
              aria-label="Close menu"
            >
              <X size={18} />
            </button>
          </div>

          <nav aria-label={`${activeModule} pages`} className="flex-1 overflow-y-auto px-3 py-3">
            {currentSidebar.map((group, i) => (
              <div key={group.group} className={i === 0 ? '' : 'mt-5'}>
                <p className="px-3 mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500 dark:text-slate-400">{group.group}</p>
                <ul className="space-y-0.5">
                  {group.items.map((item) => {
                    const itemActive = item.path.includes('?')
                      ? (location.pathname + location.search) === item.path
                      : location.pathname === item.path
                        || (item.matchPrefix && location.pathname.startsWith(`${item.path}/`));
                    return (
                      <li key={item.path}>
                        <Link
                          to={item.path}
                          aria-current={itemActive ? 'page' : undefined}
                          className={`relative flex items-center gap-2.5 px-3 h-8 rounded-lg text-[13px] transition-ui focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 ${itemActive
                            ? 'bg-slate-900 text-white font-medium shadow-sm dark:bg-white dark:text-slate-900'
                            : 'text-slate-700 hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/60 dark:hover:text-slate-100'}`}
                        >
                          <item.icon size={15} className={`shrink-0 ${itemActive ? '' : 'text-slate-500 dark:text-slate-400'}`} />
                          <span className="truncate">{item.label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>

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
        <header className="h-16 flex-shrink-0 flex items-center justify-between gap-3 px-4 lg:px-6 border-b border-slate-200 dark:border-slate-700 bg-app-surface/80 backdrop-blur-md">
          {/* Visible search that opens the existing Ctrl/⌘+K palette — same
              component, just discoverable. Dispatches the shortcut it already
              listens for, so search behaviour is untouched. */}
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            className="grid place-items-center w-10 h-10 -ml-1 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden flex-shrink-0"
            aria-label="Open menu"
            aria-controls="app-sidebar"
            aria-expanded={navOpen}
          >
            <Menu size={20} />
          </button>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}
            className="flex items-center justify-center sm:justify-start gap-2.5 w-10 sm:w-full min-w-0 max-w-md h-10 px-0 sm:px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-app-hover/60 text-sm text-slate-500 hover:border-slate-300 dark:hover:border-slate-600 hover:text-slate-600 dark:hover:text-slate-300 transition-colors cursor-pointer"
            aria-label="Search employees, devices and pages"
          >
            <Search size={16} aria-hidden="true" />
            <span className="hidden sm:block flex-1 min-w-0 text-left truncate whitespace-nowrap">Search employees, devices, pages…</span>
            <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded-md border border-slate-200 dark:border-slate-600 bg-app-surface text-[11px] font-medium text-slate-600">⌘K</kbd>
          </button>
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            <DarkModeToggle />
            <NotificationCenter />
            <div className="relative">
              <button
                ref={profileTriggerRef}
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                aria-label="Account menu"
                aria-haspopup="menu"
                aria-expanded={showProfileMenu}
                className="flex items-center gap-2 px-2 py-1.5 rounded-full hover:bg-app-hover transition-colors"
              >
                <div className="w-9 h-9 bg-slate-900 dark:bg-slate-100 dark:text-slate-900 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-sm">
                  {auth?.username?.charAt(0).toUpperCase() || 'U'}
                </div>
                <ChevronDown size={14} className={`text-slate-500 transition-transform ${showProfileMenu ? 'rotate-180' : ''}`} />
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
                      <p className="text-xs text-slate-600 dark:text-slate-400">{auth?.role}</p>
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

        <main id="main-content" tabIndex={-1} className="flex-1 min-h-0 overflow-auto focus:outline-none">
          {/* h-full gives full-bleed pages a definite height to fill. */}
          <div className="h-full p-4 sm:p-6">
            {children}
          </div>
        </main>
      </div>

      {/* Modals */}
      {showAbout && (
        // No title bar: the wordmark is the heading, and the panel has its own Close.
        <Modal open onClose={() => setShowAbout(false)} size="sm" hideClose label="About NeevTime">
          <div className="text-center py-2">
            <div className="text-3xl font-bold mb-2">
              <span className="text-slate-800 dark:text-slate-100">Neev</span><span className="text-slate-900 dark:text-slate-100">Time</span>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">Simplicity Attendance — biometric attendance management</p>
            <div className="flex justify-center mb-4"><VersionDisplay /></div>
            <LegalLinks className="justify-center mb-4" />
            <button onClick={() => setShowAbout(false)} className="w-full py-2 bg-slate-900 hover:bg-slate-700 text-white text-sm font-semibold rounded-lg">Close</button>
          </div>
        </Modal>
      )}

      {showHelp && (
        <Modal open onClose={() => setShowHelp(false)} title="Quick Help" size="md">
          <>
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
          </>
        </Modal>
      )}
    </div>
    </MotionConfig>
  );
}

MainLayout.propTypes = {
  children: PropTypes.node.isRequired,
};
