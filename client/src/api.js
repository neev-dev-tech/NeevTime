import axios from 'axios';

const api = axios.create();

// Add a request interceptor
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers['Authorization'] = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Add a response interceptor (optional, but good for handling 401s globally)
api.interceptors.response.use(
    (response) => response,
    (error) => {
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

// ==========================================
// INTEGRATIONS API
// ==========================================
export const integrationsAPI = {
    getAll: () => api.get('/api/hrms/integrations'),
    getById: (id) => api.get(`/api/hrms/integrations/${id}`),
    create: (data) => api.post('/api/hrms/integrations', data),
    update: (id, data) => api.put(`/api/hrms/integrations/${id}`, data),
    delete: (id) => api.delete(`/api/hrms/integrations/${id}`),
    test: (id) => api.post(`/api/hrms/integrations/${id}/test`),
    syncEmployees: (id) => api.post(`/api/hrms/integrations/${id}/sync/employees`),
    syncAttendance: (id) => api.post(`/api/hrms/integrations/${id}/sync/attendance`),
    syncFull: (id) => api.post(`/api/hrms/integrations/${id}/sync/full`),
    getLogs: (id, params) => api.get(`/api/hrms/integrations/${id}/logs`, { params }),
    getMappings: (id) => api.get(`/api/hrms/integrations/${id}/mappings`),
    setMappings: (id, mappings) => api.post(`/api/hrms/integrations/${id}/mappings`, { mappings }),
    getTypes: () => api.get('/api/hrms/integration-types')
};

// ==========================================
// REPORTS API
// ==========================================
export const reportsAPI = {
    getDashboard: () => api.get('/api/reports/dashboard'),
    getTypes: () => api.get('/api/reports/types'),
    getDailyAttendance: (params) => api.get('/api/reports/daily-attendance', { params }),
    getMonthlySummary: (params) => api.get('/api/reports/monthly-summary', { params }),
    getLateEarly: (params) => api.get('/api/reports/late-early', { params }),
    getAbsent: (params) => api.get('/api/reports/absent', { params }),
    getOvertime: (params) => api.get('/api/reports/overtime', { params }),
    getDeviceHealth: () => api.get('/api/reports/device-health'),
    getBiometricSummary: () => api.get('/api/reports/biometric-summary'),
    exportCSV: (reportType, params) => {
        const queryString = new URLSearchParams(params).toString();
        return `/api/reports/${reportType}/export/csv?${queryString}`;
    },
    exportHTML: (reportType, params) => {
        const queryString = new URLSearchParams(params).toString();
        return `/api/reports/${reportType}/export/html?${queryString}`;
    }
};

// ==========================================
// DEPARTMENTS API
// ==========================================
export const departmentsAPI = {
    getAll: () => api.get('/api/departments'),
    getById: (id) => api.get(`/api/departments/${id}`),
    create: (data) => api.post('/api/departments', data),
    update: (id, data) => api.put(`/api/departments/${id}`, data),
    delete: (id) => api.delete(`/api/departments/${id}`)
};

// ==========================================
// AREAS API
// ==========================================
export const areasAPI = {
    getAll: () => api.get('/api/areas'),
    getById: (id) => api.get(`/api/areas/${id}`),
    create: (data) => api.post('/api/areas', data),
    update: (id, data) => api.put(`/api/areas/${id}`, data),
    delete: (id) => api.delete(`/api/areas/${id}`)
};

// ==========================================
// DEVICES API
// ==========================================
export const devicesAPI = {
    getAll: () => api.get('/api/devices'),
    getById: (serial) => api.get(`/api/devices/${serial}`),
    getInfo: (serial) => api.get(`/api/devices/${serial}/info`),
    create: (data) => api.post('/api/devices', data),
    update: (serial, data) => api.put(`/api/devices/${serial}`, data),
    delete: (serial) => api.delete(`/api/devices/${serial}`),
    forceOnline: (serial) => api.post(`/api/devices/${serial}/force-online`),
    testConnection: (serial) => api.post(`/api/devices/${serial}/test-connection`),
    // Health & Queue
    getHealthSummary: () => api.get('/api/devices/health/summary'),
    getDevicesHealth: () => api.get('/api/devices/health/devices'),
    getDeviceHealth: (serial) => api.get(`/api/devices/health/devices/${serial}`),
    getAlerts: () => api.get('/api/devices/health/alerts'),
    getQueueStats: (device) => api.get('/api/devices/queue/stats', { params: { device } }),
    getDeadLetter: (params) => api.get('/api/devices/queue/dead-letter', { params }),
    retryDeadLetter: (id) => api.post(`/api/devices/queue/dead-letter/${id}/retry`),
    cancelQueue: (serial, commandType) => api.post(`/api/devices/queue/cancel/${serial}`, { commandType }),
    // Capabilities
    getCapabilities: () => api.get('/api/devices/sync/device-capabilities'),
    getDeviceCapabilities: (serial) => api.get(`/api/devices/sync/device-capabilities/${serial}`),
    probeCapabilities: (serial) => api.post(`/api/devices/sync/device-capabilities/probe/${serial}`)
};

// ==========================================
// EMPLOYEES API
// ==========================================
export const employeesAPI = {
    getAll: () => api.get('/api/employees'),
    getById: (id) => api.get(`/api/employees/${id}`),
    create: (data) => api.post('/api/employees', data),
    update: (id, data) => api.put(`/api/employees/${id}`, data),
    delete: (id) => api.delete(`/api/employees/${id}`),
    bulkDelete: (ids) => api.delete('/api/employees', { data: { ids } }),
    import: (employees) => api.post('/api/employees/import', { employees })
};

// ==========================================
// SCHEDULED REPORTS API
// ==========================================
export const scheduledReportsAPI = {
    getAll: () => api.get('/api/reports/scheduled'),
    getById: (id) => api.get(`/api/reports/scheduled/${id}`),
    create: (data) => api.post('/api/reports/scheduled', data),
    update: (id, data) => api.put(`/api/reports/scheduled/${id}`, data),
    delete: (id) => api.delete(`/api/reports/scheduled/${id}`),
    run: (id) => api.post(`/api/reports/scheduled/${id}/run`)
};

export default api;
