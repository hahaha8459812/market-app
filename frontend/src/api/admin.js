import api from './index';

export const getStats = () => api.get('/admin/stats');
export const getConfig = () => api.get('/admin/config');
export const updateConfig = (data) => api.patch('/admin/config', data);
export const getUsers = () => api.get('/admin/users');
export const createUser = (data) => api.post('/admin/users', data);
export const getUserDetail = (id) => api.get(`/admin/users/${id}`);
export const deleteUser = (id) => api.delete(`/admin/users/${id}`);
