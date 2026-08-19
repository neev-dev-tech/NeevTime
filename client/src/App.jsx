import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import axios from 'axios';
import PropTypes from 'prop-types';

// Layout & Components
import MainLayout from './layouts/MainLayout';
import { ToastProvider, ThemeProvider as EnhancedThemeProvider } from './components';
import ErrorBoundary from './components/ErrorBoundary';
import ConfirmDialog from './components/ConfirmDialog';

// Pages
import Dashboard from './pages/Dashboard';
import Logs from './pages/Logs';
import Employees from './pages/Employees';
import Contractors from './pages/Contractors';
import ReportsInsights from './pages/ReportsInsights';
import ShiftRotations from './pages/ShiftRotations';
import Devices from './pages/Devices';
import Departments from './pages/Departments';
import Positions from './pages/Positions';
import Login from './pages/Login';
import GenericCrud from './components/GenericCrud';
import Area from './pages/Area';
import Resign from './pages/Resign';
import AuditTrail from './pages/AuditTrail';
import DeletedEmployees from './pages/DeletedEmployees';
import StatutoryRegisters from './pages/StatutoryRegisters';
import PayrollExport from './pages/PayrollExport';
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
import LeaveTypes from './pages/LeaveTypes';
import LeaveBalances from './pages/LeaveBalances';
import DeviceMessages from './pages/DeviceMessages';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import DeviceCommands from './pages/DeviceCommands';
import SystemLogs from './pages/SystemLogs';
import DatabaseTools from './pages/DatabaseTools';
import DeviceData from './pages/DeviceData';
import DeviceSync from './pages/DeviceSync';
import Integrations from './pages/Integrations';
import Geofences from './pages/Geofences';
import MobilePunch from './pages/MobilePunch';

import Regularizations from './pages/Regularizations';
import PortalLogin from './pages/portal/PortalLogin';
import EmployeePortal from './pages/portal/EmployeePortal';

import useStore from './store/useStore';
import { loadReportSettings } from './utils/reportSettings';

// Setup Axios Interceptor for Token
axios.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Expired/invalid session: clear credentials and return to login
axios.interceptors.response.use(
  response => response,
  error => {
    if (error.response && error.response.status === 401) {
      let loginPath = '/login';
      try {
        const user = JSON.parse(localStorage.getItem('user'));
        if (user?.role === 'employee') loginPath = '/portal/login';
      } catch { /* fall back to admin login */ }
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (window.location.pathname !== loginPath) {
        window.location.href = loginPath;
      }
    }
    return Promise.reject(error);
  }
);

function PrivateRoute({ children }) {
  const auth = useStore(state => state.auth);
  if (!auth) return <Navigate to="/login" />;
  // Employees belong in the self-service portal, not the admin app
  if (auth.role === 'employee') return <Navigate to="/portal" />;
  return children;
}

function EmployeeRoute({ children }) {
  const auth = useStore(state => state.auth);
  if (!auth) return <Navigate to="/portal/login" />;
  return auth.role === 'employee' ? children : <Navigate to="/" />;
}

EmployeeRoute.propTypes = {
  children: PropTypes.node.isRequired,
};

PrivateRoute.propTypes = {
  children: PropTypes.node.isRequired,
};

function AdminRoute({ children }) {
  const auth = useStore(state => state.auth);
  if (!auth) return <Navigate to="/login" />;
  // Matches server/utils/rbac.js: only a true admin reaches settings, database,
  // integrations, system logs and user management.
  return String(auth.role).toLowerCase() === 'admin' ? children : <Navigate to="/" />;
}

AdminRoute.propTypes = {
  children: PropTypes.node.isRequired,
};

export default function App() {
  const { setAuth } = useStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Initial load is handled by useStore default value, but we signal ready here
    setLoading(false);
    // Prime company + PDF settings so exports pick them up without awaiting
    if (localStorage.getItem('token')) loadReportSettings();
  }, []);

  if (loading) return null;

  return (
    <EnhancedThemeProvider>
      <ToastProvider position="top-right" maxToasts={5}>
          <ConfirmDialog />
          <ErrorBoundary>
            <BrowserRouter>
              <Routes>
                <Route path="/login" element={<Login setAuth={setAuth} />} />
                <Route path="/portal/login" element={<PortalLogin />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/portal" element={<EmployeeRoute><EmployeePortal /></EmployeeRoute>} />
                <Route path="*" element={
                  <PrivateRoute>
                    <MainLayout>
                      <Routes>
                        <Route path="/" element={<Dashboard />} />
                        <Route path="/employees" element={<Employees />} />
                        <Route path="/contractors" element={<Contractors />} />
                        <Route path="/employees/:id" element={<EmployeeProfile />} />
                        <Route path="/departments" element={<Departments />} />
                        <Route path="/positions" element={<Positions />} />
                        <Route path="/areas" element={<Area />} />
                        <Route path="/resign" element={<Resign />} />
                        <Route path="/employees/deleted" element={<DeletedEmployees />} />
                        <Route path="/reports/registers" element={<StatutoryRegisters />} />
                        <Route path="/reports/insights" element={<ReportsInsights />} />
                        <Route path="/reports/payroll" element={<PayrollExport />} />
                        <Route path="/employee-docs" element={<EmployeeDocs />} />
                        <Route path="/workflow/roles" element={<ApprovalRole />} />
                        <Route path="/workflow/flows" element={<ApprovalFlow />} />
                        <Route path="/workflow/nodes" element={<ApprovalNode />} />
                        <Route path="/devices" element={<Devices />} />
                        <Route path="/devices/data" element={<DeviceData />} />
                        <Route path="/device-commands" element={<DeviceCommands />} />
                        <Route path="/device-sync" element={<DeviceSync />} />
                        <Route path="/device-messages" element={<DeviceMessages />} />
                        <Route path="/attendance-rules" element={<AttendanceRules />} />
                        <Route path="/holiday-locations" element={<HolidayLocation />} />
                        <Route path="/geofences" element={<Geofences />} />
                        <Route path="/break-times" element={<GenericCrud title="Break Times" endpoint="/api/break-times" columns={[{ key: 'name', label: 'Name' }]} />} />
                        <Route path="/timetables" element={<Timetable />} />
                        <Route path="/shifts" element={<ShiftMaster />} />
                        <Route path="/schedule/department" element={<DepartmentSchedule />} />
                        <Route path="/schedule/employee" element={<EmployeeSchedule />} />
                        {/* Temporary schedules are employee schedules flagged is_temporary */}
                        <Route path="/schedule/temporary" element={<EmployeeSchedule />} />
                        <Route path="/schedule/calendar" element={<ScheduleCalendar />} />
                        <Route path="/attendance/manual" element={<ManualEntry />} />
                        <Route path="/leaves" element={<LeaveApplications />} />
                        <Route path="/regularizations" element={<Regularizations />} />
                        <Route path="/holidays" element={<HolidayLocation initialTab="holidays" />} />
                        <Route path="/leave-types" element={<LeaveTypes />} />
                        <Route path="/leave-balance" element={<LeaveBalances />} />
                        <Route path="/mobile/punch" element={<MobilePunch />} />
                        <Route path="/reports" element={<ReportsDashboard />} />
                        <Route path="/reports/legacy" element={<ReportsLegacy />} />
                        <Route path="/reports/first-last" element={<FirstLastReport />} />
                        {/* Report dashboard cards → legacy report engine, one route per card */}
                        {Object.entries({
                            '/reports/transactions': 'transaction_log',
                            '/reports/mobile-transactions': 'mobile_trans',
                            '/reports/total-punches': 'total_punches',
                            '/reports/scheduled-log': 'scheduled_log',
                            '/reports/time-card': 'time_card',
                            '/reports/missed-punch': 'missed_punch',
                            '/reports/late-coming': 'late_coming',
                            '/reports/early-leaving': 'early_leaving',
                            '/reports/birthday': 'birthday',
                            '/reports/overtime': 'overtime_report',
                            '/reports/absent': 'absent_report',
                            '/reports/half-day': 'half_day',
                            '/reports/daily-attendance': 'daily_attendance',
                            '/reports/daily-details': 'daily_details',
                            '/reports/daily-summary': 'daily_summary',
                            '/reports/daily-status': 'daily_status',
                            '/reports/basic-status': 'basic_status',
                            '/reports/status-summary': 'status_summary',
                            '/reports/ot-summary': 'ot_summary',
                            '/reports/work-duration': 'work_duration',
                            '/reports/work-detailed': 'work_detailed',
                            '/reports/att-sheet': 'att_sheet',
                            '/reports/att-status': 'att_status',
                            '/reports/att-summary': 'att_summary',
                            '/reports/device-health': 'device_health',
                            '/reports/payroll': 'payroll',
                            '/reports/biometric-summary': 'biometric_summary',
                        }).map(([path, type]) => (
                            <Route key={path} path={path} element={<ReportsLegacy type={type} />} />
                        ))}
                        <Route path="/export" element={<ExportCenter />} />
                        <Route path="/logs" element={<Logs />} />
                        <Route path="/attendance-register" element={<AttendanceRegister />} />
                        <Route path="/attendance-calendar" element={<AttendanceCalendar />} />
                        <Route path="/import" element={<ImportWizard />} />
                        <Route path="/users" element={<AdminRoute><UsersPage /></AdminRoute>} />
                        <Route path="/audit" element={<AdminRoute><AuditTrail /></AdminRoute>} />
                        <Route path="/database/backup" element={<AdminRoute><DatabaseTools /></AdminRoute>} />
                        <Route path="/system-logs" element={<AdminRoute><SystemLogs /></AdminRoute>} />
                        <Route path="/settings" element={<AdminRoute><Settings /></AdminRoute>} />
                        <Route path="/settings/:tab" element={<AdminRoute><Settings /></AdminRoute>} />
                        <Route path="/integrations" element={<AdminRoute><Integrations /></AdminRoute>} />
                        {/* Legacy MUI report generator merged into /reports */}
                        <Route path="/advanced-reports" element={<Navigate to="/reports" replace />} />
                      </Routes>
                    </MainLayout>
                  </PrivateRoute>
                } />
              </Routes>
            </BrowserRouter>
          </ErrorBoundary>
      </ToastProvider>
    </EnhancedThemeProvider>
  );
}

