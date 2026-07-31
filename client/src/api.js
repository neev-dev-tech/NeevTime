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

// Only integrationsAPI is imported anywhere; every other wrapper here was
// unused, since pages call the endpoints through `api` directly. The dead ones
// have been removed — three of them pointed at paths that do not exist
// (/api/devices/sync/device-capabilities*, GET /api/departments/:id,
// GET /api/areas/:id) and would have 404'd on first use.

export default api;
