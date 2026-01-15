import api from './index';

export const login = (data) => api.post('/auth/login', data);
export const register = (data) => api.post('/auth/register', data);
export const getMe = () => api.get('/auth/me');
export const updateUsername = (username) => api.patch('/account/username', { username });
export const updatePassword = (data) => api.patch('/account/password', data);
