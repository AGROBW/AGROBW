import { supabase } from './supabaseClient';

let refreshSessionPromise: Promise<boolean> | null = null;

export const isSupabaseUnauthorizedError = (error: any) => {
  if (!error) return false;

  const status = Number(error.status || error.statusCode || error.code);
  const message = String(error.message || error.error_description || error.details || '').toLowerCase();

  return (
    status === 401 ||
    error.code === 'PGRST301' ||
    message.includes('jwt') ||
    message.includes('token') ||
    message.includes('unauthorized') ||
    message.includes('invalid claim')
  );
};

export const refreshSupabaseSession = async () => {
  if (refreshSessionPromise) return refreshSessionPromise;

  refreshSessionPromise = (async () => {
    const { data: currentSession } = await supabase.auth.getSession();

    if (!currentSession.session) {
      return false;
    }

    const { data, error } = await supabase.auth.refreshSession();
    return !error && !!data.session;
  })();

  try {
    return await refreshSessionPromise;
  } finally {
    refreshSessionPromise = null;
  }
};
