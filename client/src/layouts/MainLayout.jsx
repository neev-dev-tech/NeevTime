import { useState, useEffect, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, LogOut, Info, HelpCircle, Globe, Activity } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import PropTypes from 'prop-types';
import { modules, personnelSidebar, deviceSidebar, attendanceSidebar, systemSidebar } from '../config/navigation';
import { ThemeButton } from '../components';
import useStore from '../store/useStore';

export default function MainLayout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { auth, logout } = useStore();
  const [activeModule, setActiveModule] = useState('Dashboard');
  const [expandedGroups, setExpandedGroups] = useState({});
  const [showProfileMenu, setShowProfileMenu] = useState(false);

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
    } else if (['/devices', '/device-commands', '/device-messages'].some(p => path.startsWith(p))) {
      setActiveModule('Device');
    } else if (['/logs', '/shifts', '/timetables', '/break-times', '/schedule', '/rules', '/holidays', '/leaves', '/leave-types', '/leave-balance', '/attendance', '/reports', '/export', '/import'].some(p => path.startsWith(p))) {
      setActiveModule('Attendance');
    } else if (['/settings', '/users', '/database', '/system-logs', '/integrations', '/advanced-reports'].some(p => path.startsWith(p))) {
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
    <div className="flex flex-col min-h-screen font-sans" style={{ backgroundColor: '#FAFBFC' }}>
      {/* Top Navigation */}
      <motion.header 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="sticky top-0 z-50 border-b bg-white/80 backdrop-blur-md"
        style={{
          borderColor: '#FED7AA',
          boxShadow: '0 2px 8px rgba(249, 115, 22, 0.08)'
        }}
      >
        <div className="px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-10">
            <div className="flex items-center gap-2.5">
               <span className="text-2xl font-bold" style={{ color: '#1E293B' }}>Neev</span>
               <span className="text-2xl font-bold" style={{ color: '#F97316' }}>Time</span>
            </div>

            <nav className="hidden md:flex items-center gap-1 p-1 rounded-full border border-orange-100 bg-orange-50/30">
              {modules.map((mod) => {
                const isActive = activeModule === mod.name;
                return (
                  <button
                    key={mod.name}
                    onClick={() => {
                      setActiveModule(mod.name);
                      if (mod.path !== '#') navigate(mod.path);
                    }}
                    className={`px-5 py-1.5 rounded-full transition-all flex items-center gap-2 text-sm font-semibold relative ${isActive ? 'text-white' : 'text-slate-600 hover:text-orange-600'}`}
                  >
                    {isActive && (
                      <motion.div 
                        layoutId="activeModule"
                        className="absolute inset-0 bg-orange-500 rounded-full"
                        style={{ zIndex: -1 }}
                      />
                    )}
                    <mod.icon size={18} />
                    {mod.name}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <ThemeButton className="hidden sm:flex" />
            <button className="p-2 rounded-full hover:bg-orange-50 text-slate-400 hover:text-orange-500 transition-colors">
              <Activity size={20} />
            </button>

            <div className="relative">
              <button
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="flex items-center gap-2 px-3 py-2 rounded-full hover:bg-orange-50 transition-colors"
              >
                <div className="w-9 h-9 bg-orange-500 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-sm ring-2 ring-orange-100">
                  {auth?.username?.charAt(0).toUpperCase() || 'U'}
                </div>
                <ChevronDown size={14} className={`text-gray-400 transition-transform ${showProfileMenu ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {showProfileMenu && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setShowProfileMenu(false)} />
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: 10 }}
                      className="absolute right-0 mt-2 w-56 bg-white shadow-xl rounded-2xl overflow-hidden z-40 border border-orange-100"
                    >
                      <div className="px-4 py-3 border-b border-orange-50 bg-orange-50/50">
                        <p className="text-sm font-bold text-slate-800">{auth?.username}</p>
                        <p className="text-xs text-slate-500">{auth?.role}</p>
                      </div>
                      <div className="py-2">
                        <button className="w-full px-4 py-2 text-left text-sm text-slate-600 hover:bg-orange-50 flex items-center gap-3">
                          <Info size={16} /> <span>About</span>
                        </button>
                        <button className="w-full px-4 py-2 text-left text-sm text-slate-600 hover:bg-orange-50 flex items-center gap-3">
                          <HelpCircle size={16} /> <span>Help</span>
                        </button>
                        <button className="w-full px-4 py-2 text-left text-sm text-slate-600 hover:bg-orange-50 flex items-center gap-3">
                          <Globe size={16} /> <span>Language</span>
                        </button>
                      </div>
                      <div className="border-t border-orange-50">
                        <button onClick={logout} className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-3 font-semibold">
                          <LogOut size={16} /> <span>Logout</span>
                        </button>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </motion.header>

      <div className="flex flex-1 overflow-hidden">
        {activeModule !== 'Dashboard' && currentSidebar.length > 0 && (
          <aside className="w-64 border-r flex-shrink-0 overflow-y-auto pb-10 bg-white" style={{ borderColor: '#FED7AA' }}>
            {currentSidebar.map((group, i) => (
              <div key={i} className="mb-2">
                <button
                  onClick={() => toggleGroup(group.group)}
                  className="w-full px-5 py-3 flex items-center justify-between hover:bg-orange-50/50"
                >
                  <div className="flex items-center gap-3 uppercase text-[10px] tracking-widest font-bold text-slate-400">
                    <group.icon size={16} style={{ color: group.iconColor || '#64748B' }} />
                    {group.group}
                  </div>
                  {expandedGroups[group.group] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                <AnimatePresence>
                  {expandedGroups[group.group] && (
                    <motion.nav 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="px-3 space-y-0.5 overflow-hidden"
                    >
                      {group.items.map((item, j) => {
                        const isActive = (item.path.includes('?') 
                          ? (location.pathname + location.search) === item.path 
                          : location.pathname === item.path);
                        return (
                          <Link
                            key={j}
                            to={item.path}
                            className={`flex items-center gap-3 px-4 py-2 rounded-xl text-sm transition-all font-medium ${isActive ? 'bg-orange-500 text-white shadow-md shadow-orange-200' : 'text-slate-600 hover:bg-orange-50 hover:text-orange-600'}`}
                          >
                            <item.icon size={18} />
                            {item.label}
                          </Link>
                        );
                      })}
                    </motion.nav>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </aside>
        )}
        <main className="flex-1 overflow-auto bg-slate-50/50">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="p-6"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

MainLayout.propTypes = {
  children: PropTypes.node.isRequired,
};
