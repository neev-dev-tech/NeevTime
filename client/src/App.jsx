import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import axios from 'axios';
import PropTypes from 'prop-types';

// Layout & Components
import MainLayout from './layouts/MainLayout';
import { ToastProvider, ThemeProvider as EnhancedThemeProvider } from './components';
import { ThemeProvider } from './contexts/ThemeContext';
import ErrorBoundary from './components/ErrorBoundary';

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
import Geofences from './pages/Geofences';
import MobilePunch from './pages/MobilePunch';

import useStore from './store/useStore';

// Setup Axios Interceptor for Token
axios.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

function PrivateRoute({ children }) {
  const auth = useStore(state => state.auth);
  return auth ? children : <Navigate to="/login" />;
}

PrivateRoute.propTypes = {
  children: PropTypes.node.isRequired,
};

export default function App() {
  const { setAuth } = useStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Initial load is handled by useStore default value, but we signal ready here
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
                  <PrivateRoute>
                    <MainLayout>
                      <Routes>
                        <Route path="/" element={<Dashboard />} />
                        <Route path="/employees" element={<Employees />} />
                        <Route path="/employees/:id" element={<EmployeeProfile />} />
                        <Route path="/departments" element={<Departments />} />
                        <Route path="/positions" element={<Positions />} />
                        <Route path="/areas" element={<Area />} />
                        <Route path="/resign" element={<Resign />} />
                        <Route path="/employee-docs" element={<EmployeeDocs />} />
                        <Route path="/workflow/roles" element={<ApprovalRole />} />
                        <Route path="/workflow/flows" element={<ApprovalFlow />} />
                        <Route path="/workflow/nodes" element={<ApprovalNode />} />
                        <Route path="/devices" element={<Devices />} />
                        <Route path="/devices/data" element={<DeviceData />} />
                        <Route path="/device-commands" element={<DeviceCommands />} />
                        <Route path="/attendance-rules" element={<AttendanceRules />} />
                        <Route path="/holiday-locations" element={<HolidayLocation />} />
                        <Route path="/geofences" element={<Geofences />} />
                        <Route path="/break-times" element={<GenericCrud title="Break Times" endpoint="/api/break-times" columns={[{ key: 'name', label: 'Name' }]} />} />
                        <Route path="/timetables" element={<Timetable />} />
                        <Route path="/shifts" element={<ShiftMaster />} />
                        <Route path="/schedule/department" element={<DepartmentSchedule />} />
                        <Route path="/schedule/employee" element={<EmployeeSchedule />} />
                        <Route path="/schedule/calendar" element={<ScheduleCalendar />} />
                        <Route path="/attendance/manual" element={<ManualEntry />} />
                        <Route path="/leaves" element={<LeaveApplications />} />
                        <Route path="/mobile/punch" element={<MobilePunch />} />
                        <Route path="/reports" element={<ReportsDashboard />} />
                        <Route path="/reports/legacy" element={<ReportsLegacy />} />
                        <Route path="/reports/first-last" element={<FirstLastReport />} />
                        <Route path="/export" element={<ExportCenter />} />
                        <Route path="/logs" element={<Logs />} />
                        <Route path="/attendance-register" element={<AttendanceRegister />} />
                        <Route path="/attendance-calendar" element={<AttendanceCalendar />} />
                        <Route path="/import" element={<ImportWizard />} />
                        <Route path="/users" element={<UsersPage />} />
                        <Route path="/database/backup" element={<DatabaseTools />} />
                        <Route path="/system-logs" element={<SystemLogs />} />
                        <Route path="/settings" element={<Settings />} />
                        <Route path="/integrations" element={<Integrations />} />
                        <Route path="/advanced-reports" element={<AdvancedReports />} />
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

