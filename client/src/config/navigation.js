import {
  RefreshCw, LayoutDashboard, Users, Clock, TabletSmartphone, Settings2, Grid, MapPin, Plane, UserCheck, GitBranch, GitCommit, Calendar, Database, Activity, ClipboardList, UserX, Briefcase, Building2, Timer, CalendarDays, CalendarCheck, Upload, Download, Shield, ShieldCheck, UserCircle, FolderOpen, FileCheck, TrendingUp, Server, FileText, PieChart, Globe, Network, MessageSquare, Workflow, BarChart3, Zap, Fingerprint, Camera, FileQuestion, AlertCircle, Building, Trash2, Calculator, Mail, BellRing } from 'lucide-react';

export const modules = [
  { name: 'Dashboard', icon: LayoutDashboard, path: '/', iconColor: '#64748B' },
  { name: 'Personnel', icon: Users, path: '/employees', iconColor: '#64748B' },
  { name: 'Device', icon: TabletSmartphone, path: '/devices', iconColor: '#64748B' },
  { name: 'Attendance', icon: Clock, path: '/logs', iconColor: '#64748B' },
  { name: 'System', icon: Settings2, path: '/settings', iconColor: '#64748B' },
];

export const personnelSidebar = [
  {
    group: 'Organization',
    icon: Building,
    iconColor: '#64748B',
    items: [
      { label: 'Department', path: '/departments', icon: Grid, iconColor: '#64748B' },
      { label: 'Position', path: '/positions', icon: Briefcase, iconColor: '#64748B' },
      { label: 'Area', path: '/areas', icon: MapPin, iconColor: '#64748B' },
    ]
  },
  {
    group: 'Employee Management',
    icon: Users,
    iconColor: '#64748B',
    items: [
      { label: 'Employee', path: '/employees', icon: UserCircle, iconColor: '#64748B' },
      { label: 'Contractors', path: '/contractors', icon: Building2, iconColor: '#64748B' },
      { label: 'Resignations', path: '/resign', icon: UserX, iconColor: '#64748B' },
      { label: 'Deleted', path: '/employees/deleted', icon: Trash2, iconColor: '#64748B' },
    ]
  },
  {
    group: 'Approval Workflow',
    icon: Workflow,
    iconColor: '#64748B',
    items: [
      { label: 'Role', path: '/workflow/roles', icon: Shield, iconColor: '#64748B' },
      { label: 'Flow', path: '/workflow/flows', icon: GitBranch, iconColor: '#64748B' },
      { label: 'Node', path: '/workflow/nodes', icon: GitCommit, iconColor: '#64748B' },
    ]
  },
  {
    group: 'Configurations',
    icon: Settings2,
    iconColor: '#64748B',
    items: [
      { label: 'Employee Document', path: '/employee-docs', icon: FolderOpen, iconColor: '#64748B' },
    ]
  }
];

export const deviceSidebar = [
  {
    group: 'Device Management',
    icon: TabletSmartphone,
    iconColor: '#64748B',
    items: [
      { label: 'Device', path: '/devices', icon: TabletSmartphone, iconColor: '#64748B' },
      { label: 'Device Command', path: '/device-commands', icon: Zap, iconColor: '#64748B' },
      { label: 'Sync & Queue', path: '/device-sync', icon: RefreshCw, iconColor: '#64748B' },
      { label: 'Message', path: '/device-messages', icon: MessageSquare, iconColor: '#64748B' },
    ]
  },
  {
    group: 'Data',
    icon: Database,
    iconColor: '#64748B',
    items: [
      { label: 'Work Code', path: '/devices/data?view=work-code', icon: Briefcase, iconColor: '#64748B' },
      { label: 'Bio-Template', path: '/devices/data?view=bio-template', icon: Fingerprint, iconColor: '#64748B' },
      { label: 'Bio-Photo', path: '/devices/data?view=bio-photo', icon: Camera, iconColor: '#64748B' },
      { label: 'Transaction', path: '/devices/data?view=transaction', icon: FileCheck, iconColor: '#64748B' },
      { label: 'Unregistered', path: '/devices/data?view=unregistered', icon: FileQuestion, iconColor: '#64748B' },
    ]
  },
  {
    group: 'Log',
    icon: Activity,
    iconColor: '#64748B',
    items: [
      { label: 'Operation Log', path: '/devices/data?view=operation-log', icon: Activity, iconColor: '#64748B' },
      { label: 'Error Log', path: '/devices/data?view=error-log', icon: AlertCircle, iconColor: '#64748B' },
      { label: 'Upload Log', path: '/devices/data?view=upload-log', icon: Upload, iconColor: '#64748B' },
    ]
  }
];

export const attendanceSidebar = [
  {
    // Daily work first: the queues someone clears every morning.
    group: 'Approvals',
    icon: ClipboardList,
    iconColor: '#64748B',
    items: [
      { label: 'Leave Applications', path: '/leaves', icon: Plane, iconColor: '#64748B' },
      { label: 'Regularization', path: '/regularizations', icon: FileCheck, iconColor: '#64748B' },
    ]
  },
  {
    // Direct fixes an admin makes, not requests awaiting a decision.
    group: 'Corrections',
    icon: FileCheck,
    iconColor: '#64748B',
    items: [
      { label: 'Manual Entry', path: '/attendance/manual', icon: FileCheck, iconColor: '#64748B' },
      { label: 'Test Punch', path: '/mobile/punch', icon: TabletSmartphone, iconColor: '#64748B' },
    ]
  },
  {
    group: 'Data',
    icon: Database,
    iconColor: '#64748B',
    items: [
      { label: 'Attendance Logs', path: '/logs', icon: Activity, iconColor: '#64748B' },
      { label: 'Attendance Register', path: '/attendance-register', icon: ClipboardList, iconColor: '#64748B' },
      { label: 'Attendance Calendar', path: '/attendance-calendar', icon: CalendarDays, iconColor: '#64748B' },
      { label: 'Import Wizard', path: '/import', icon: Upload, iconColor: '#64748B' },
    ]
  },
  {
    group: 'Reports',
    icon: BarChart3,
    iconColor: '#64748B',
    items: [
      { label: 'All Reports', path: '/reports', icon: BarChart3, iconColor: '#64748B' },
      { label: 'Payroll Export', path: '/reports/payroll', icon: Calculator, iconColor: '#64748B' },
      { label: 'Statutory Registers', path: '/reports/registers', icon: FileText, iconColor: '#64748B' },
      { label: 'Insights', path: '/reports/insights', icon: TrendingUp, iconColor: '#64748B' },
      { label: 'Export Center', path: '/export', icon: Download, iconColor: '#64748B' },
    ]
  },
  {
    // Break times live inside Timetable, where they get the times and
    // timetable they need; the standalone name-only editor is gone.
    group: 'Shift',
    icon: Timer,
    iconColor: '#64748B',
    items: [
      { label: 'Timetables', path: '/timetables', icon: CalendarDays, iconColor: '#64748B' },
      { label: 'Shifts', path: '/shifts', icon: Timer, iconColor: '#64748B' },
      { label: 'Rotations', path: '/shift-rotations', icon: RefreshCw, iconColor: '#64748B' },
    ]
  },
  {
    group: 'Schedule',
    icon: CalendarCheck,
    iconColor: '#64748B',
    items: [
      { label: 'Department Schedule', path: '/schedule/department', icon: Building2, iconColor: '#64748B' },
      { label: 'Employee Schedule', path: '/schedule/employee', icon: UserCheck, iconColor: '#64748B' },
      { label: 'Temporary Schedule', path: '/schedule/temporary', icon: Calendar, iconColor: '#64748B' },
      { label: 'Schedule View', path: '/schedule/calendar', icon: CalendarDays, iconColor: '#64748B' },
    ]
  },
  {
    group: 'Leave Setup',
    icon: Calendar,
    iconColor: '#64748B',
    items: [
      { label: 'Leave Types', path: '/leave-types', icon: FileText, iconColor: '#64748B' },
      { label: 'Leave Balances', path: '/leave-balance', icon: PieChart, iconColor: '#64748B' },
    ]
  },
  {
    group: 'Rules & Holidays',
    icon: ShieldCheck,
    iconColor: '#64748B',
    items: [
      { label: 'Attendance Rules', path: '/attendance-rules', icon: ShieldCheck, iconColor: '#64748B' },
      { label: 'Holidays & Locations', path: '/holiday-locations', icon: Plane, iconColor: '#64748B' },
      { label: 'Geofences', path: '/geofences', icon: MapPin, iconColor: '#64748B' },
    ]
  },
];

export const systemSidebar = [
  {
    group: 'Authentication',
    icon: Shield,
    iconColor: '#64748B',
    items: [
      { label: 'Users', path: '/users', icon: Users, iconColor: '#64748B' },
      { label: 'Audit Trail', path: '/audit', icon: ShieldCheck, iconColor: '#64748B' },
    ]
  },
  {
    group: 'Integrations',
    icon: Globe,
    iconColor: '#64748B',
    items: [
      { label: 'HRMS Integration', path: '/integrations', icon: Network, iconColor: '#64748B' },
      { label: 'API Access', path: '/api-access', icon: Shield, iconColor: '#64748B' },
    ]
  },
  {
    group: 'Database',
    icon: Database,
    iconColor: '#64748B',
    items: [
      { label: 'Backup', path: '/database/backup', icon: Server, iconColor: '#64748B' },
      { label: 'System Log', path: '/system-logs', icon: FileText, iconColor: '#64748B' },
    ]
  },
  {
    group: 'Configuration',
    icon: Settings2,
    iconColor: '#64748B',
    items: [
      // "All settings" is the overview with each section's current state;
      // every section is also its own entry and URL, so "Email / SMTP" or
      // "Employee sign-in" is one click away. Order follows the overview.
      { label: 'All settings', path: '/settings', icon: Grid, iconColor: '#64748B' },
      { label: 'Company', path: '/settings/company', icon: Building, iconColor: '#64748B' },
      { label: 'Timezone', path: '/settings/timezone', icon: Globe, iconColor: '#64748B' },
      { label: 'Appearance', path: '/settings/appearance', icon: Settings2, iconColor: '#64748B' },
      { label: 'Attendance defaults', path: '/settings/attendance', icon: Timer, iconColor: '#64748B' },
      { label: 'Weekend rules', path: '/settings/weekend', icon: CalendarDays, iconColor: '#64748B' },
      { label: 'Approval chain', path: '/settings/approvals', icon: Workflow, iconColor: '#64748B' },
      { label: 'Email / SMTP', path: '/settings/notifications', icon: Mail, iconColor: '#64748B' },
      { label: 'Alerts', path: '/settings/alerts', icon: BellRing, iconColor: '#64748B' },
      { label: 'Auto reports', path: '/settings/reports', icon: BarChart3, iconColor: '#64748B' },
      { label: 'PDF & print', path: '/settings/pdf', icon: FileCheck, iconColor: '#64748B' },
      { label: 'Security', path: '/settings/security', icon: Shield, iconColor: '#64748B' },
      { label: 'Employee sign-in', path: '/settings/auth', icon: UserCheck, iconColor: '#64748B' },
      // Backup schedule and retention. The Backup entry above is the full
      // backup-and-restore tools page.
      { label: 'Backups', path: '/settings/database', icon: Database, iconColor: '#64748B' },
    ]
  },
];
