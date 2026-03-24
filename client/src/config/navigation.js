import { LayoutDashboard, Users, Clock, TabletSmartphone, Settings2, Grid, MapPin, Plane, UserCheck, GitBranch, GitCommit, Calendar, Database, Activity, ClipboardList, UserX, Briefcase, Building2, Timer, CalendarDays, CalendarCheck, Upload, Download, Shield, ShieldCheck, UserCircle, FolderOpen, FileCheck, TrendingUp, Server, FileText, PieChart, Globe, Network, MessageSquare, Workflow, BarChart3, Zap, Fingerprint, Camera, FileQuestion, AlertCircle, Building } from 'lucide-react';

export const modules = [
  { name: 'Dashboard', icon: LayoutDashboard, path: '/', iconColor: '#F97316' },
  { name: 'Personnel', icon: Users, path: '/employees', iconColor: '#3B82F6' },
  { name: 'Device', icon: TabletSmartphone, path: '/devices', iconColor: '#10B981' },
  { name: 'Attendance', icon: Clock, path: '/logs', iconColor: '#8B5CF6' },
  { name: 'System', icon: Settings2, path: '/settings', iconColor: '#64748B' },
];

export const personnelSidebar = [
  {
    group: 'Organization',
    icon: Building,
    iconColor: '#2563EB',
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
    iconColor: '#EA580C',
    items: [
      { label: 'Employee', path: '/employees', icon: UserCircle, iconColor: '#EA580C' },
      { label: 'Resign', path: '/resign', icon: UserX, iconColor: '#DC2626' },
    ]
  },
  {
    group: 'Approval Workflow',
    icon: Workflow,
    iconColor: '#7C3AED',
    items: [
      { label: 'Role', path: '/workflow/roles', icon: Shield, iconColor: '#2563EB' },
      { label: 'Flow', path: '/workflow/flows', icon: GitBranch, iconColor: '#7C3AED' },
      { label: 'Node', path: '/workflow/nodes', icon: GitCommit, iconColor: '#059669' },
    ]
  },
  {
    group: 'Configurations',
    icon: Settings2,
    iconColor: '#475569',
    items: [
      { label: 'Employee Document', path: '/employee-docs', icon: FolderOpen, iconColor: '#D97706' },
    ]
  }
];

export const deviceSidebar = [
  {
    group: 'Device Management',
    icon: TabletSmartphone,
    iconColor: '#2563EB',
    items: [
      { label: 'Device', path: '/devices', icon: TabletSmartphone, iconColor: '#2563EB' },
      { label: 'Device Command', path: '/device-commands', icon: Zap, iconColor: '#D97706' },
      { label: 'Message', path: '/device-messages', icon: MessageSquare, iconColor: '#059669' },
    ]
  },
  {
    group: 'Data',
    icon: Database,
    iconColor: '#7C3AED',
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
    iconColor: '#DC2626',
    items: [
      { label: 'Operation Log', path: '/devices?view=operation-log', icon: Activity, iconColor: '#059669' },
      { label: 'Error Log', path: '/devices?view=error-log', icon: AlertCircle, iconColor: '#DC2626' },
      { label: 'Upload Log', path: '/devices?view=upload-log', icon: Upload, iconColor: '#2563EB' },
    ]
  }
];

export const attendanceSidebar = [
  {
    group: 'Rule',
    icon: ShieldCheck,
    iconColor: '#2563EB',
    items: [
      { label: 'Attendance Rules', path: '/attendance-rules', icon: ShieldCheck, iconColor: '#2563EB' },
      { label: 'Holiday & Locations', path: '/holiday-locations', icon: MapPin, iconColor: '#059669' },
      { label: 'Geofences', path: '/geofences', icon: MapPin, iconColor: '#EA580C' },
    ]
  },
  {
    group: 'Shift',
    icon: Timer,
    iconColor: '#EA580C',
    items: [
      { label: 'Break Time', path: '/break-times', icon: Clock, iconColor: '#EA580C' },
      { label: 'Timetable', path: '/timetables', icon: CalendarDays, iconColor: '#7C3AED' },
      { label: 'Shift', path: '/shifts', icon: Timer, iconColor: '#D97706' },
    ]
  },
  {
    group: 'Schedule',
    icon: CalendarCheck,
    iconColor: '#059669',
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
    iconColor: '#DB2777',
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
    iconColor: '#D97706',
    items: [
      { label: 'Holiday', path: '/holidays', icon: Plane, iconColor: '#D97706' },
    ]
  },
  {
    group: 'Leave Management',
    icon: Calendar,
    iconColor: '#7C3AED',
    items: [
      { label: 'Leave Type', path: '/leave-types', icon: FileText, iconColor: '#2563EB' },
      { label: 'Leave Balance', path: '/leave-balance', icon: PieChart, iconColor: '#DB2777' },
    ]
  },
  {
    group: 'Reports',
    icon: BarChart3,
    iconColor: '#059669',
    items: [
      { label: 'All Reports', path: '/reports', icon: BarChart3, iconColor: '#059669' },
      { label: 'Export Center', path: '/export', icon: Download, iconColor: '#2563EB' },
    ]
  },
  {
    group: 'Data',
    icon: Database,
    iconColor: '#7C3AED',
    items: [
      { label: 'Live Logs', path: '/logs', icon: Activity, iconColor: '#DC2626' },
      { label: 'Attendance Register', path: '/attendance-register', icon: ClipboardList, iconColor: '#2563EB' },
      { label: 'Attendance Calendar', path: '/attendance-calendar', icon: CalendarDays, iconColor: '#059669' },
      { label: 'Import Wizard', path: '/import', icon: Upload, iconColor: '#EA580C' },
    ]
  },
];

export const systemSidebar = [
  {
    group: 'Authentication',
    icon: Shield,
    iconColor: '#2563EB',
    items: [
      { label: 'User', path: '/users', icon: Users, iconColor: '#2563EB' },
    ]
  },
  {
    group: 'Integrations',
    icon: Globe,
    iconColor: '#059669',
    items: [
      { label: 'HRMS Integration', path: '/integrations', icon: Network, iconColor: '#059669' },
    ]
  },
  {
    group: 'Reports',
    icon: BarChart3,
    iconColor: '#7C3AED',
    items: [
      { label: 'Advanced Reports', path: '/advanced-reports', icon: TrendingUp, iconColor: '#7C3AED' },
    ]
  },
  {
    group: 'Database',
    icon: Database,
    iconColor: '#EA580C',
    items: [
      { label: 'Backup', path: '/database/backup', icon: Server, iconColor: '#EA580C' },
      { label: 'System Log', path: '/system-logs', icon: FileText, iconColor: '#475569' },
    ]
  },
  {
    group: 'Configuration',
    icon: Settings2,
    iconColor: '#475569',
    items: [
      { label: 'Settings', path: '/settings', icon: Settings2, iconColor: '#EA580C' },
    ]
  },
];
