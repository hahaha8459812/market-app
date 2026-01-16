import api from './index';

export const getPlatformStats = () => api.get('/stats/platform');

