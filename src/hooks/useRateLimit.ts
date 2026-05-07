/**
 * Formata um tempo restante em segundos para exibição na interface.
 * Mantido aqui apenas como utilitário temporário para o login admin,
 * que já usa limitação real no servidor.
 */
export const formatTimeRemaining = (seconds: number): string => {
  if (seconds <= 0) return '0s';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }

  return `${secs}s`;
};
