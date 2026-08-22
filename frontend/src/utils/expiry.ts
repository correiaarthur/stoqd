export const EXPIRY_WARNING_DAYS = 90;

export type ExpiryStatus = 'none' | 'expired' | 'soon' | 'ok';

export function getExpiryStatus(expiryDate: string | null | undefined): ExpiryStatus {
  if (!expiryDate) return 'none';

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const due = new Date(expiryDate);
  due.setHours(0, 0, 0, 0);

  if (due < today) return 'expired';

  const limit = new Date(today);
  limit.setDate(limit.getDate() + EXPIRY_WARNING_DAYS);

  return due <= limit ? 'soon' : 'ok';
}

export function formatExpiryDate(expiryDate: string) {
  return new Date(expiryDate).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}
