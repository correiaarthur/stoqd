import { api } from '../api';

export const getDashboardSummary = () => api.get('/analytics/summary');
export const getSalesReport = (from: string) => api.get('/analytics/sales-report', { params: { from } });
