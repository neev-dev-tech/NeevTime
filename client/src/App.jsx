import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation, Navigate, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, Clock, TabletSmartphone, FileText, Settings as SettingsIcon, ShieldCheck, PieChart, Menu, LogOut, Grid, MapPin, Plane, UserCheck, GitBranch, GitCommit, Calendar, ChevronDown, ChevronRight, Database, Activity, FileBarChart, ClipboardList, UserX, Briefcase, Building2, Timer, CalendarDays, CalendarCheck, FileSpreadsheet, Upload, Download, Bell, Shield, Cog, User, Info, HelpCircle, Globe, KeyRound, Camera, FileQuestion, AlertCircle, Fingerprint, Building, Network, MessageSquare, Workflow, BarChart3, Zap, ScanLine, UserCircle, FolderOpen, FileCheck, Calendar as CalendarIcon, TrendingUp, Settings2, Server, Cloud, Lock, Sparkles, Palette, Layers, Target, Rocket, Star, Award, Crown, Gem } from 'lucide-react';
import io from 'socket.io-client';
import axios from 'axios';

// Pages
import Dashboard from './pages/Dashboard';
import Logs from './pages/Logs';
import Employees from './pages/Employees';
import Devices from './pages/Devices';
import Departments from './pages/Departments';
import Positions from './pages/Positions';
import Login from './pages/Login';
import GenericCrud from './components/GenericCrud';
import Area from './pages/Area';
import Resign from './pages/Resign';
import EmployeeDocs from './pages/EmployeeDocs';
import ShiftMaster from './pages/ShiftMaster';
import ImportWizard from './pages/ImportWizard';
import ExportCenter from './pages/ExportCenter';
import AttendanceRegister from './pages/AttendanceRegister';
import EmployeeProfile from './pages/EmployeeProfile';
import AttendanceCalendar from './pages/AttendanceCalendar';
import ManualEntry from './pages/ManualEntry';
import LeaveApplications from './pages/LeaveApplications';
import ApprovalRole from './pages/ApprovalRole';
import ApprovalFlow from './pages/ApprovalFlow';
import ApprovalNode from './pages/ApprovalNode';
import Settings from './pages/Settings';
import UsersPage from './pages/Users';
import Timetable from './pages/Timetable';
import ScheduleCalendar from './pages/ScheduleCalendar';
import DepartmentSchedule from './pages/DepartmentSchedule';
import EmployeeSchedule from './pages/EmployeeSchedule';
import ReportsLegacy from './pages/ReportsLegacy';
import ReportsDashboard from './pages/ReportsDashboard';
import FirstLastReport from './pages/reports/FirstLastReport';
import AttendanceRules from './pages/AttendanceRules';
import HolidayLocation from './pages/HolidayLocation';
import DeviceCommands from './pages/DeviceCommands';
import SystemLogs from './pages/SystemLogs';
import DatabaseTools from './pages/DatabaseTools';
import DeviceData from './pages/DeviceData';
import Integrations from './pages/Integrations';
import AdvancedReports from './pages/AdvancedReports';
import ScheduledReports from './pages/ScheduledReports';
import SyncDashboard from './pages/SyncDashboard';
import Geofences from './pages/Geofences';
import MobilePunch from './pages/MobilePunch';

// Legacy Toast (for backward compatibility)
import ToastContainer from './components/ToastContainer';
import ConfirmDialog from './components/ConfirmDialog';
import ErrorBoundary from './components/ErrorBoundary';
import GlobalSearch from './components/GlobalSearch';
import ThemeToggle from './components/ThemeToggle';
import { ThemeProvider } from './contexts/ThemeContext';

// New Enhanced UI Components
import { ToastProvider, ThemeProvider as EnhancedThemeProvider, ThemeButton } from './components';


// Setup Axios Interceptor for Token
axios.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

function PrivateRoute({ children, auth }) {
  return auth ? children : <Navigate to="/login" />;
}

function MainLayout({ auth, setAuth, children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeModule, setActiveModule] = useState('Dashboard');
  const [expandedGroups, setExpandedGroups] = useState({});

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setAuth(null);
    navigate('/login');
  };

  const toggleGroup = (groupName) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupName]: !prev[groupName]
    }));
  };

  const [showProfileMenu, setShowProfileMenu] = useState(false);

  // Top Navigation Modules (matching EasyTime Pro)
  const modules = [
    { name: 'Dashboard', icon: LayoutDashboard, path: '/', iconColor: '#F97316' },
    { name: 'Personnel', icon: Users, path: '/employees', iconColor: '#3B82F6' },
    { name: 'Device', icon: TabletSmartphone, path: '/devices', iconColor: '#10B981' },
    { name: 'Attendance', icon: Clock, path: '/logs', iconColor: '#8B5CF6' },
    { name: 'System', icon: Settings2, path: '/settings', iconColor: '#64748B' },
  ];

  // Personnel Sidebar (matching EasyTime Pro structure)
  const personnelSidebar = [
    {
      group: 'Organization',
      icon: Building,
      iconColor: '#2563EB', // Bright Blue
      items: [
        { label: 'Department', path: '/departments', icon: Grid, iconColor: '#2563EB' },
        { label: 'Position', path: '/positions', icon: Briefcase, iconColor: '#7C3AED' },
        { label: 'Area', path: '/areas', icon: MapPin, iconColor: '#059669' },
        { label: 'Holiday Location', path: '/holiday-locations', icon: Plane, iconColor: '#D97706' },
      ]
    },
    {
      group: 'Employee Management',
      icon: Users,
      iconColor: '#EA580C', // Bright Saffron
      items: [
        { label: 'Employee', path: '/employees', icon: UserCircle, iconColor: '#EA580C' },
        { label: 'Resign', path: '/resign', icon: UserX, iconColor: '#DC2626' },
      ]
    },
    {
      group: 'Approval Workflow',
      icon: Workflow,
      iconColor: '#7C3AED', // Bright Purple
      items: [
        { label: 'Role', path: '/workflow/roles', icon: Shield, iconColor: '#2563EB' },
        { label: 'Flow', path: '/workflow/flows', icon: GitBranch, iconColor: '#7C3AED' },
        { label: 'Node', path: '/workflow/nodes', icon: GitCommit, iconColor: '#059669' },
      ]
    },
    {
      group: 'Configurations',
      icon: Settings2,
      iconColor: '#475569', // Darker Slate
      items: [
        { label: 'Employee Document', path: '/employee-docs', icon: FolderOpen, iconColor: '#D97706' },
      ]
    }
  ];

  // Device Sidebar
  const deviceSidebar = [
    {
      group: 'Device Management',
      icon: TabletSmartphone,
      iconColor: '#2563EB', // Bright Blue
      items: [
        { label: 'Device', path: '/devices', icon: TabletSmartphone, iconColor: '#2563EB' },
        { label: 'Device Command', path: '/device-commands', icon: Zap, iconColor: '#D97706' },
        { label: 'Message', path: '/device-messages', icon: MessageSquare, iconColor: '#059669' },
      ]
    },
    {
      group: 'Data',
      icon: Database,
      iconColor: '#7C3AED', // Bright Purple
      items: [
        { label: 'Work Code', path: '/devices?view=work-code', icon: Briefcase, iconColor: '#EA580C' },
        { label: 'Bio-Template', path: '/devices?view=bio-template', icon: Fingerprint, iconColor: '#059669' },
        { label: 'Bio-Photo', path: '/devices?view=bio-photo', icon: Camera, iconColor: '#DB2777' },
        { label: 'Transaction', path: '/devices?view=transaction', icon: FileCheck, iconColor: '#2563EB' },
        { label: 'Unregistered', path: '/devices?view=unregistered', icon: FileQuestion, iconColor: '#D97706' },
      ]
    },
    {
      group: 'Log',
      icon: Activity,
      iconColor: '#DC2626', // Bright Red
      items: [
        { label: 'Operation Log', path: '/devices?view=operation-log', icon: Activity, iconColor: '#059669' },
        { label: 'Error Log', path: '/devices?view=error-log', icon: AlertCircle, iconColor: '#DC2626' },
        { label: 'Upload Log', path: '/devices?view=upload-log', icon: Upload, iconColor: '#2563EB' },
      ]
    }
  ];

  // Attendance Sidebar (matching EasyTime Pro structure)
  const attendanceSidebar = [
    {
      group: 'Rule',
      icon: ShieldCheck,
      iconColor: '#2563EB', // Bright Blue
      items: [
        { label: 'Attendance Rules', path: '/attendance-rules', icon: ShieldCheck, iconColor: '#2563EB' },
        { label: 'Holiday & Locations', path: '/holiday-locations', icon: MapPin, iconColor: '#059669' },
        { label: 'Geofences', path: '/geofences', icon: MapPin, iconColor: '#EA580C' },
      ]
    },
    {
      group: 'Shift',
      icon: Timer,
      iconColor: '#EA580C', // Bright Saffron
      items: [
        { label: 'Break Time', path: '/break-times', icon: Clock, iconColor: '#EA580C' },
        { label: 'Timetable', path: '/timetables', icon: CalendarDays, iconColor: '#7C3AED' },
        { label: 'Shift', path: '/shifts', icon: Timer, iconColor: '#D97706' },
      ]
    },
    {
      group: 'Schedule',
      icon: CalendarCheck,
      iconColor: '#059669', // Bright Green
      items: [
        { label: 'Department Schedule', path: '/schedule/department', icon: Building2, iconColor: '#2563EB' },
        { label: 'Employee Schedule', path: '/schedule/employee', icon: UserCheck, iconColor: '#EA580C' },
        { label: 'Temporary Schedule', path: '/schedule/temporary', icon: Calendar, iconColor: '#7C3AED' },
        { label: 'Schedule View', path: '/schedule/calendar', icon: CalendarDays, iconColor: '#059669' },
      ]
    },
    {
      group: 'Approvals',
      icon: ClipboardList,
      iconColor: '#DB2777', // Bright Pink
      items: [
        { label: 'Manual Log', path: '/attendance/manual', icon: FileCheck, iconColor: '#2563EB' },
        { label: 'Mobile Entry', path: '/mobile/punch', icon: TabletSmartphone, iconColor: '#DB2777' },
        { label: 'Leave', path: '/leaves', icon: Plane, iconColor: '#059669' },
        { label: 'Overtime', path: '/approvals/overtime', icon: Clock, iconColor: '#D97706' },
      ]
    },
    {
      group: 'Holiday',
      icon: Plane,
      iconColor: '#D97706', // Bright Amber
      items: [
        { label: 'Holiday', path: '/holidays', icon: Plane, iconColor: '#D97706' },
      ]
    },
    {
      group: 'Leave Management',
      icon: Calendar,
      iconColor: '#7C3AED', // Bright Purple
      items: [
        { label: 'Leave Type', path: '/leave-types', icon: FileText, iconColor: '#2563EB' },
        { label: 'Leave Balance', path: '/leave-balance', icon: PieChart, iconColor: '#DB2777' },
      ]
    },
    {
      group: 'Reports',
      icon: BarChart3,
      iconColor: '#059669', // Bright Green
      items: [
        { label: 'All Reports', path: '/reports', icon: BarChart3, iconColor: '#059669' },
        { label: 'Export Center', path: '/export', icon: Download, iconColor: '#2563EB' },
      ]
    },
    {
      group: 'Data',
      icon: Database,
      iconColor: '#7C3AED', // Bright Purple
      items: [
        { label: 'Live Logs', path: '/logs', icon: Activity, iconColor: '#DC2626' },
        { label: 'Attendance Register', path: '/attendance-register', icon: ClipboardList, iconColor: '#2563EB' },
        { label: 'Attendance Calendar', path: '/attendance-calendar', icon: CalendarDays, iconColor: '#059669' },
        { label: 'Import Wizard', path: '/import', icon: Upload, iconColor: '#EA580C' },
      ]
    },
  ];

  // System Sidebar
  const systemSidebar = [
    {
      group: 'Authentication',
      icon: Shield,
      iconColor: '#2563EB', // Bright Blue
      items: [
        { label: 'User', path: '/users', icon: Users, iconColor: '#2563EB' },
      ]
    },
    {
      group: 'Integrations',
      icon: Globe,
      iconColor: '#059669', // Bright Green
      items: [
        { label: 'HRMS Integration', path: '/integrations', icon: Network, iconColor: '#059669' },
        { label: 'Sync Monitoring', path: '/sync-monitoring', icon: Activity, iconColor: '#3B82F6' },
      ]
    },
    {
      group: 'Reports',
      icon: BarChart3,
      iconColor: '#7C3AED', // Bright Purple
      items: [
        { label: 'Advanced Reports', path: '/advanced-reports', icon: TrendingUp, iconColor: '#7C3AED' },
        { label: 'Scheduled Reports', path: '/scheduled-reports', icon: Clock, iconColor: '#F97316' },
      ]
    },
    {
      group: 'Database',
      icon: Database,
      iconColor: '#EA580C', // Bright Saffron
      items: [
        { label: 'Backup', path: '/database/backup', icon: Server, iconColor: '#EA580C' },
        { label: 'System Log', path: '/system-logs', icon: FileText, iconColor: '#475569' },
      ]
    },
    {
      group: 'Configuration',
      icon: Settings2,
      iconColor: '#475569', // Darker Slate
      items: [
        { label: 'Settings', path: '/settings', icon: Settings2, iconColor: '#EA580C' },
      ]
    },
  ];

  // Get sidebar based on active module
  const getSidebar = () => {
    switch (activeModule) {
      case 'Personnel': return personnelSidebar;
      case 'Device': return deviceSidebar;
      case 'Attendance': return attendanceSidebar;
      case 'System': return systemSidebar;
      default: return [];
    }
  };

  // Determine active module based on current path
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

  // Auto-expand group containing current path
  useEffect(() => {
    const sidebar = getSidebar();
    sidebar.forEach(group => {
      if (group.items.some(item => {
        if (item.path.includes('?')) {
          return (location.pathname + location.search) === item.path;
        }
        return location.pathname === item.path;
      })) {
        setExpandedGroups(prev => ({ ...prev, [group.group]: true }));
      }
    });
  }, [location.pathname, activeModule]);

  const currentSidebar = getSidebar();

  return (
    <div className="flex flex-col min-h-screen font-sans" style={{ backgroundColor: '#FAFBFC' }}>
      {/* Top Navigation - Modern Gradient */}
      <header className="sticky top-0 z-50 border-b" style={{
        background: 'linear-gradient(135deg, #FFFFFF 0%, #FFFBF5 50%, #FFF7ED 100%)',
        borderColor: '#FED7AA',
        boxShadow: '0 2px 8px rgba(249, 115, 22, 0.08), 0 0 1px rgba(0, 0, 0, 0.05)'
      }}>
        <div className="px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-10">
            {/* Logo */}
            <div className="flex items-center gap-2.5">
              <img
                src="/vayutime_logo.png?v=5"
                alt="VayuTime Logo"
                className="object-contain"
                style={{
                  height: '64px',
                  width: 'auto',
                  maxWidth: '280px',
                  display: 'block',
                  objectFit: 'contain'
                }}
                onError={(e) => {
                  e.target.style.display = 'none';
                  // Show text fallback if image fails
                  const fallback = document.createElement('div');
                  fallback.className = 'flex items-center gap-2';
                  fallback.innerHTML = '<span class="text-2xl font-bold" style="color: #1E293B">Vayu</span><span class="text-2xl font-bold" style="color: #059669">Time</span>';
                  e.target.parentElement?.appendChild(fallback);
                }}
              />
            </div>

            {/* Main Nav - Enhanced */}
            <nav className="hidden md:flex items-center gap-1 p-1 rounded-full border" style={{
              background: 'linear-gradient(135deg, #FFFFFF 0%, #FFFBF5 100%)',
              borderColor: '#FED7AA',
              boxShadow: '0 2px 4px rgba(249, 115, 22, 0.06)'
            }}>
              {modules.map((mod, index) => {
                const isActive = activeModule === mod.name;
                return (
                  <button
                    key={mod.name}
                    onClick={() => {
                      setActiveModule(mod.name);
                      if (mod.path !== '#') navigate(mod.path);
                    }}
                    className={`px-5 py-1.5 rounded-lg transition-all flex items-center gap-2 text-sm font-semibold ${isActive
                      ? 'text-orange-700'
                      : 'text-charcoal'
                      }`}
                    style={{
                      backgroundColor: isActive ? '#FFF7ED' : 'transparent',
                      border: 'none',
                      boxShadow: isActive ? 'inset 0 0 0 1px #FED7AA, 0 1px 2px rgba(0, 0, 0, 0.05)' : 'none',
                      transition: 'all 200ms cubic-bezier(0.25, 0.8, 0.25, 1)',
                      fontWeight: 600,
                      position: 'relative'
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.backgroundColor = '#FFFFFF';
                        e.currentTarget.style.boxShadow = 'inset 0 0 0 1px #FED7AA, 0 1px 2px rgba(249, 115, 22, 0.1)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.backgroundColor = 'transparent';
                        e.currentTarget.style.boxShadow = 'none';
                      }
                    }}
                  >
                    <mod.icon
                      size={18}
                      style={{
                        color: isActive ? '#C2410C' : (mod.iconColor || '#1E293B'),
                        transition: 'all 200ms cubic-bezier(0.25, 0.8, 0.25, 1)'
                      }}
                    />
                    {mod.name}
                  </button>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <ThemeButton className="hidden sm:flex" />
            <ThemeToggle className="mr-1" />
            <button
              onClick={() => window.location.reload()}
              className="p-2 rounded-full transition-colors"
              style={{ color: '#9CA3AF' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#FFF7ED';
                e.currentTarget.style.color = '#F97316';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = '#9CA3AF';
              }}
              title="Refresh"
            >
              <Activity size={20} />
            </button>

            {/* Profile Dropdown */}
            <div className="relative dropdown-container">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowProfileMenu(!showProfileMenu);
                }}
                className="flex items-center gap-2 px-3 py-2 rounded-full transition-colors group"
                style={{
                  transition: 'all 200ms cubic-bezier(0.25, 0.8, 0.25, 1)'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#FFF7ED'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <div className="w-9 h-9 bg-gradient-to-br from-saffron-light to-saffron-dark rounded-full flex items-center justify-center text-white font-bold text-sm shadow-sm">
                  {auth.username?.charAt(0).toUpperCase() || 'U'}
                </div>
                <div className="text-xs text-left hidden sm:block">
                  <p className="font-bold text-charcoal group-hover:text-saffron transition-colors">{auth.username}</p>
                  <p className="text-slate-grey text-[10px] uppercase tracking-wider">{auth.role}</p>
                </div>
                <ChevronDown size={14} className={`text-gray-400 transition-transform ${showProfileMenu ? 'rotate-180' : ''}`} />
              </button>

              {showProfileMenu && (
                <>
                  {/* Backdrop */}
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setShowProfileMenu(false)}
                  />

                  {/* Dropdown Menu */}
                  <div className="absolute right-0 mt-2 w-56 shadow-xl rounded-2xl overflow-hidden z-40 dropdown-menu" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E5E7EB' }}>
                    <div className="px-4 py-3 border-b" style={{ background: 'linear-gradient(to right, #FFF7ED, #FFFFFF)', borderColor: '#FED7AA' }}>
                      <p className="text-sm font-bold" style={{ color: '#1E293B' }}>{auth.username}</p>
                      <p className="text-xs" style={{ color: '#475569' }}>{auth.role}</p>
                    </div>

                    <div className="py-2">
                      <button className="w-full px-4 py-2.5 text-left text-sm transition-colors flex items-center gap-3 group" style={{ color: '#475569' }} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#FFF7ED'; e.currentTarget.style.color = '#1E293B'; }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#475569'; }}>
                        <Info size={16} style={{ color: '#64748B' }} className="group-hover:text-saffron" />
                        <span>About</span>
                      </button>
                      <button className="w-full px-4 py-2.5 text-left text-sm transition-colors flex items-center gap-3 group" style={{ color: '#475569' }} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#FFF7ED'; e.currentTarget.style.color = '#1E293B'; }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#475569'; }}>
                        <HelpCircle size={16} style={{ color: '#64748B' }} className="group-hover:text-saffron" />
                        <span>Help</span>
                      </button>
                      <button className="w-full px-4 py-2.5 text-left text-sm transition-colors flex items-center gap-3 group" style={{ color: '#475569' }} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#FFF7ED'; e.currentTarget.style.color = '#1E293B'; }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#475569'; }}>
                        <Globe size={16} style={{ color: '#64748B' }} className="group-hover:text-saffron" />
                        <span>Language</span>
                      </button>
                      <button className="w-full px-4 py-2.5 text-left text-sm transition-colors flex items-center gap-3 group" style={{ color: '#475569' }} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#FFF7ED'; e.currentTarget.style.color = '#1E293B'; }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#475569'; }}>
                        <KeyRound size={16} style={{ color: '#64748B' }} className="group-hover:text-saffron" />
                        <span>Password</span>
                      </button>
                    </div>

                    <div className="border-t" style={{ borderColor: '#E5E7EB' }}>
                      <button
                        onClick={handleLogout}
                        className="w-full px-4 py-2.5 text-left text-sm transition-colors flex items-center gap-3 group"
                        style={{ color: '#DC2626' }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#FEE2E2'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                      >
                        <LogOut size={16} style={{ color: '#EF4444' }} className="group-hover:text-red-600" />
                        <span className="font-medium">Logout</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Dynamic Sidebar with Collapsible Groups - Enhanced Typography */}
        {activeModule !== 'Dashboard' && currentSidebar.length > 0 && (
          <aside className="w-64 border-r flex-shrink-0 overflow-y-auto pb-10 custom-scrollbar" style={{
            background: 'linear-gradient(180deg, #FFFFFF 0%, #FFFBF5 100%)',
            borderColor: '#FED7AA',
            boxShadow: '4px 0 12px rgba(249, 115, 22, 0.06), 0 0 1px rgba(0, 0, 0, 0.04)'
          }}>
            {currentSidebar.map((group, i) => (
              <div key={i} className="border-b pb-2 mb-2" style={{ borderColor: '#FED7AA', opacity: 0.5 }}>
                <button
                  onClick={() => toggleGroup(group.group)}
                  className="w-full px-5 py-3 flex items-center justify-between transition-colors"
                  style={{
                    transition: 'all 200ms cubic-bezier(0.25, 0.8, 0.25, 1)'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#FFF7ED'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <div className="flex items-center gap-3 uppercase text-xs tracking-wider whitespace-nowrap" style={{ color: '#000000', fontWeight: 900, letterSpacing: '0.05em', fontSize: '12px' }}>
                    <group.icon size={20} style={{ color: group.iconColor || '#000000', strokeWidth: 2.5 }} />
                    {group.group}
                  </div>
                  {expandedGroups[group.group] ? (
                    <ChevronDown size={16} style={{ color: '#475569', strokeWidth: 2.5 }} />
                  ) : (
                    <ChevronRight size={16} style={{ color: '#475569', strokeWidth: 2.5 }} />
                  )}
                </button>
                {expandedGroups[group.group] && (
                  <nav className="px-3 space-y-1">
                    {group.items.map((item, j) => {
                      const isActive = (item.path.includes('?')
                        ? (location.pathname + location.search) === item.path
                        : location.pathname === item.path && (item.path !== '/devices' || location.search === ''));
                      return (
                        <Link
                          key={j}
                          to={item.path}
                          className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-all font-semibold ${isActive
                            ? 'text-orange-700 shadow-sm border'
                            : 'hover:text-charcoal hover:shadow-sm border border-transparent'
                            }`}
                          style={{
                            fontWeight: 800,
                            transition: 'all 200ms cubic-bezier(0.25, 0.8, 0.25, 1)',
                            color: isActive ? '#C2410C' : '#000000',
                            backgroundColor: isActive ? '#FFF7ED' : 'transparent',
                            borderColor: isActive ? '#FED7AA' : 'transparent',
                            fontSize: '14px'
                          }}
                          onMouseEnter={(e) => {
                            if (!isActive) {
                              e.currentTarget.style.backgroundColor = '#FFF7ED';
                              e.currentTarget.style.borderColor = '#FED7AA';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isActive) {
                              e.currentTarget.style.backgroundColor = 'transparent';
                              e.currentTarget.style.borderColor = 'transparent';
                            }
                          }}
                        >
                          <item.icon
                            size={22}
                            className={isActive ? 'opacity-100' : 'opacity-100'}
                            style={{
                              color: isActive ? '#C2410C' : (item.iconColor || '#000000'),
                              transition: 'all 200ms cubic-bezier(0.25, 0.8, 0.25, 1)',
                              strokeWidth: 2.5
                            }}
                          />
                          {item.label}
                        </Link>
                      );
                    })}
                  </nav>
                )}
              </div>
            ))}
          </aside>
        )}

        <main className="flex-1 overflow-auto p-6" style={{ backgroundColor: '#FAFBFC' }}>
          {children}
        </main>
      </div>

      {/* Global Components */}
      <ToastContainer />
      <ConfirmDialog />
      <GlobalSearch />
    </div>
  );
}

export default function App() {
  const [auth, setAuth] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) setAuth(JSON.parse(storedUser));
    setLoading(false);
  }, []);

  if (loading) return null;

  return (
    <EnhancedThemeProvider>
      <ToastProvider position="top-right" maxToasts={5}>
        <ThemeProvider>
          <ErrorBoundary>
            <BrowserRouter>
              <Routes>
                <Route path="/login" element={<Login setAuth={setAuth} />} />
                <Route path="*" element={
                  <PrivateRoute auth={auth}>
                    <MainLayout auth={auth} setAuth={setAuth}>
                      <Routes>
                        <Route path="/" element={<Dashboard />} />

                        {/* Personnel / Organization */}
                        <Route path="/employees" element={<Employees />} />
                        <Route path="/employees/:id" element={<EmployeeProfile />} />
                        <Route path="/departments" element={<Departments />} />
                        <Route path="/positions" element={<Positions />} />
                        <Route path="/areas" element={<Area />} />
                        <Route path="/holiday-locations" element={<GenericCrud title="Holiday Locations" endpoint="/api/holiday_locations" columns={[{ key: 'name', label: 'Name' }, { key: 'description', label: 'Description' }]} icon={Plane} />} />

                        {/* Personnel / Employee Mgmt */}
                        <Route path="/resign" element={<Resign />} />
                        <Route path="/employee-docs" element={<EmployeeDocs />} />

                        {/* Workflow */}
                        <Route path="/workflow/roles" element={<ApprovalRole />} />
                        <Route path="/workflow/flows" element={<ApprovalFlow />} />
                        <Route path="/workflow/nodes" element={<ApprovalNode />} />

                        {/* Device Module */}
                        <Route path="/devices" element={<Devices />} />
                        <Route path="/devices/data" element={<DeviceData />} />
                        <Route path="/device-commands" element={<DeviceCommands />} />
                        <Route path="/device-messages" element={<GenericCrud title="Device Messages" endpoint="/api/device-messages" columns={[{ key: 'device_name', label: 'Device' }, { key: 'message', label: 'Message' }, { key: 'created_at', label: 'Time' }]} icon={Bell} />} />

                        {/* Attendance Module - Rules */}
                        <Route path="/attendance-rules" element={<AttendanceRules />} />
                        <Route path="/rules/global" element={<AttendanceRules />} />
                        <Route path="/rules/department" element={<AttendanceRules />} />
                        <Route path="/holiday-locations" element={<HolidayLocation />} />
                        <Route path="/geofences" element={<Geofences />} />

                        {/* Attendance Module - Shift */}
                        <Route path="/break-times" element={<GenericCrud title="Break Times" endpoint="/api/break-times" columns={[{ key: 'name', label: 'Name' }, { key: 'start_time', label: 'Start' }, { key: 'end_time', label: 'End' }]} icon={Clock} />} />
                        <Route path="/timetables" element={<Timetable />} />
                        <Route path="/shifts" element={<ShiftMaster />} />

                        {/* Attendance Module - Schedule */}
                        <Route path="/schedule/department" element={<DepartmentSchedule />} />
                        <Route path="/schedule/employee" element={<EmployeeSchedule />} />
                        <Route path="/schedule/temporary" element={<GenericCrud title="Temporary Schedule" endpoint="/api/schedules/temporary" columns={[{ key: 'employee_name', label: 'Employee' }, { key: 'date', label: 'Date' }, { key: 'shift_name', label: 'Shift' }]} icon={Calendar} />} />
                        <Route path="/schedule/calendar" element={<ScheduleCalendar />} />

                        {/* Attendance Module - Approvals */}
                        <Route path="/attendance/manual" element={<ManualEntry />} />
                        <Route path="/leaves" element={<LeaveApplications />} />
                        <Route path="/mobile/punch" element={<MobilePunch />} />
                        <Route path="/approvals/overtime" element={<GenericCrud title="Overtime Approvals" endpoint="/api/approvals/overtime" columns={[{ key: 'employee_name', label: 'Employee' }, { key: 'date', label: 'Date' }, { key: 'hours', label: 'Hours' }, { key: 'status', label: 'Status' }]} icon={Clock} />} />

                        {/* Attendance Module - Holiday & Leave */}
                        <Route path="/holidays" element={<GenericCrud title="Holidays" endpoint="/api/holidays" columns={[{ key: 'name', label: 'Holiday' }, { key: 'date', label: 'Date' }]} icon={Plane} />} />
                        <Route path="/leave-types" element={<GenericCrud title="Leave Types" endpoint="/api/leave-types" columns={[{ key: 'code', label: 'Code' }, { key: 'name', label: 'Name' }, { key: 'annual_quota', label: 'Quota' }]} icon={Calendar} />} />
                        <Route path="/leave-balance" element={<GenericCrud title="Leave Balance" endpoint="/api/leave-balance" columns={[{ key: 'employee_name', label: 'Employee' }, { key: 'leave_type', label: 'Type' }, { key: 'balance', label: 'Balance' }]} icon={PieChart} />} />

                        {/* Attendance Module - Reports */}
                        <Route path="/reports" element={<ReportsDashboard />} />
                        <Route path="/reports/legacy" element={<ReportsLegacy />} /> {/* Keep for fallback */}

                        {/* Individual Report Routes - Transaction */}
                        <Route path="/reports/transactions" element={<ReportsLegacy type="transaction_log" hideSidebar={true} />} />
                        <Route path="/reports/mobile-transactions" element={<ReportsLegacy type="mobile_trans" hideSidebar={true} />} />
                        <Route path="/reports/total-punches" element={<ReportsLegacy type="total_punches" hideSidebar={true} />} />

                        {/* Individual Report Routes - Scheduling */}
                        <Route path="/reports/scheduled-log" element={<ReportsLegacy type="scheduled_log" hideSidebar={true} />} />
                        <Route path="/reports/time-card" element={<ReportsLegacy type="time_card" hideSidebar={true} />} />
                        <Route path="/reports/missed-punch" element={<ReportsLegacy type="missed_punch" hideSidebar={true} />} />
                        <Route path="/reports/late-coming" element={<ReportsLegacy type="late_coming" hideSidebar={true} />} />
                        <Route path="/reports/early-leaving" element={<ReportsLegacy type="early_leaving" hideSidebar={true} />} />
                        <Route path="/reports/birthday" element={<ReportsLegacy type="birthday" hideSidebar={true} />} />
                        <Route path="/reports/overtime" element={<ReportsLegacy type="overtime_report" hideSidebar={true} />} />
                        <Route path="/reports/absent" element={<ReportsLegacy type="absent_report" hideSidebar={true} />} />
                        <Route path="/reports/break-time" element={<GenericCrud title="Break Times" endpoint="/api/break-times" columns={[{ key: 'name', label: 'Name' }, { key: 'start_time', label: 'Start' }, { key: 'end_time', label: 'End' }]} icon={Clock} />} />
                        <Route path="/reports/half-day" element={<ReportsLegacy type="half_day" hideSidebar={true} />} />

                        {/* Individual Report Routes - Daily */}
                        <Route path="/reports/daily-attendance" element={<ReportsLegacy type="daily_attendance" hideSidebar={true} />} />
                        <Route path="/reports/daily-details" element={<ReportsLegacy type="daily_details" hideSidebar={true} />} />
                        <Route path="/reports/daily-summary" element={<ReportsLegacy type="daily_summary" hideSidebar={true} />} />
                        <Route path="/reports/daily-status" element={<ReportsLegacy type="daily_status" hideSidebar={true} />} />

                        {/* Individual Report Routes - Monthly */}
                        <Route path="/reports/monthly-summary" element={<ReportsLegacy type="monthly_summary" hideSidebar={true} />} />
                        <Route path="/reports/basic-status" element={<ReportsLegacy type="basic_status" hideSidebar={true} />} />
                        <Route path="/reports/status-summary" element={<ReportsLegacy type="status_summary" hideSidebar={true} />} />
                        <Route path="/reports/ot-summary" element={<ReportsLegacy type="ot_summary" hideSidebar={true} />} />
                        <Route path="/reports/work-duration" element={<ReportsLegacy type="work_duration" hideSidebar={true} />} />
                        <Route path="/reports/work-detailed" element={<ReportsLegacy type="work_detailed" hideSidebar={true} />} />
                        <Route path="/reports/att-sheet" element={<ReportsLegacy type="att_sheet" hideSidebar={true} />} />
                        <Route path="/reports/att-status" element={<ReportsLegacy type="att_status" hideSidebar={true} />} />
                        <Route path="/reports/att-summary" element={<ReportsLegacy type="att_summary" hideSidebar={true} />} />
                        <Route path="/reports/muster-roll" element={<ReportsLegacy type="muster_roll" hideSidebar={true} />} />

                        <Route path="/reports/first-last" element={<FirstLastReport />} />

                        <Route path="/export" element={<ExportCenter />} />

                        {/* Attendance Module - Data */}
                        <Route path="/logs" element={<Logs />} />
                        <Route path="/attendance-register" element={<AttendanceRegister />} />
                        <Route path="/attendance-calendar" element={<AttendanceCalendar />} />
                        <Route path="/import" element={<ImportWizard />} />

                        {/* System Module */}
                        <Route path="/users" element={<UsersPage />} />
                        <Route path="/database/backup" element={<DatabaseTools />} />
                        <Route path="/system-logs" element={<SystemLogs />} />
                        <Route path="/settings" element={<Settings />} />
                        <Route path="/integrations" element={<Integrations />} />
                        <Route path="/sync-monitoring" element={<SyncDashboard />} />
                        <Route path="/advanced-reports" element={<AdvancedReports />} />
                        <Route path="/scheduled-reports" element={<ScheduledReports />} />
                      </Routes>
                    </MainLayout>
                  </PrivateRoute>
                } />
              </Routes>
            </BrowserRouter>
          </ErrorBoundary>
        </ThemeProvider>
      </ToastProvider>
    </EnhancedThemeProvider>
  );
}

