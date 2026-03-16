import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';

/**
 * Hook para Auditoria Administrativa
 * 
 * Registra todas as ações administrativas no banco de dados
 * para rastreabilidade e compliance.
 * 
 * Uso:
 * ```tsx
 * const { logAction } = useAdminAudit();
 * 
 * await logAction({
 *   action: 'APPROVE_AD',
 *   resourceType: 'announcement',
 *   resourceId: adId,
 *   oldValue: { status: 'PENDING' },
 *   newValue: { status: 'ACTIVE' },
 *   reason: 'Anúncio aprovado após revisão'
 * });
 * ```
 */

export interface AdminAuditLogParams {
  action: string; // 'APPROVE_AD', 'REJECT_AD', 'DELETE_USER', 'UPDATE_PLAN', etc.
  resourceType: string; // 'announcement', 'user', 'plan', 'subscription', etc.
  resourceId?: string | null; // UUID do recurso afetado
  oldValue?: Record<string, any> | null; // Estado anterior (JSON)
  newValue?: Record<string, any> | null; // Estado novo (JSON)
  reason?: string | null; // Motivo da ação
}

interface UseAdminAuditReturn {
  logAction: (params: AdminAuditLogParams) => Promise<{ success: boolean; error?: any }>;
  isLoading: boolean;
}

export const useAdminAudit = (): UseAdminAuditReturn => {
  const { user, isAdmin } = useAuth();

  const getClientInfo = () => {
    return {
      ipAddress: null, // IP será capturado no backend via Edge Function ou RPC
      userAgent: navigator.userAgent
    };
  };

  const logAction = async (params: AdminAuditLogParams): Promise<{ success: boolean; error?: any }> => {
    // Validação: apenas admins podem registrar logs
    if (!user || !isAdmin) {
      console.error('[AdminAudit] Usuário não é administrador');
      return { 
        success: false, 
        error: { message: 'Apenas administradores podem registrar ações' } 
      };
    }

    // Validação de parâmetros obrigatórios
    if (!params.action || !params.resourceType) {
      console.error('[AdminAudit] Parâmetros obrigatórios ausentes');
      return { 
        success: false, 
        error: { message: 'Action e resourceType são obrigatórios' } 
      };
    }

    const clientInfo = getClientInfo();

    try {
      // Chamar função RPC do banco que faz a inserção com SECURITY DEFINER
      const { data, error } = await supabase.rpc('log_admin_action', {
        p_action: params.action,
        p_resource_type: params.resourceType,
        p_resource_id: params.resourceId || null,
        p_old_value: params.oldValue ? JSON.stringify(params.oldValue) : null,
        p_new_value: params.newValue ? JSON.stringify(params.newValue) : null,
        p_reason: params.reason || null,
        p_ip_address: clientInfo.ipAddress,
        p_user_agent: clientInfo.userAgent
      });

      if (error) {
        console.error('[AdminAudit] Erro ao registrar log:', error);
        return { success: false, error };
      }

      console.log('[AdminAudit] Ação registrada com sucesso:', {
        logId: data,
        action: params.action,
        resource: `${params.resourceType}:${params.resourceId}`
      });

      return { success: true };
    } catch (error) {
      console.error('[AdminAudit] Erro inesperado:', error);
      return { success: false, error };
    }
  };

  return {
    logAction,
    isLoading: false
  };
};

/**
 * Tipos de ações administrativas predefinidas
 * (para autocomplete e consistência)
 */
export const ADMIN_ACTIONS = {
  // Anúncios
  APPROVE_AD: 'APPROVE_AD',
  REJECT_AD: 'REJECT_AD',
  DELETE_AD: 'DELETE_AD',
  FEATURE_AD: 'FEATURE_AD',
  UNFEATURE_AD: 'UNFEATURE_AD',
  
  // Usuários
  DELETE_USER: 'DELETE_USER',
  SUSPEND_USER: 'SUSPEND_USER',
  UNSUSPEND_USER: 'UNSUSPEND_USER',
  UPDATE_USER_ROLE: 'UPDATE_USER_ROLE',
  VERIFY_USER: 'VERIFY_USER',
  
  // Planos e Assinaturas
  UPDATE_PLAN: 'UPDATE_PLAN',
  CANCEL_SUBSCRIPTION: 'CANCEL_SUBSCRIPTION',
  REFUND_PAYMENT: 'REFUND_PAYMENT',
  GRANT_CREDITS: 'GRANT_CREDITS',
  
  // Configurações
  UPDATE_SMTP_CONFIG: 'UPDATE_SMTP_CONFIG',
  UPDATE_BANNER: 'UPDATE_BANNER',
  CREATE_PAGE: 'CREATE_PAGE',
  UPDATE_PAGE_CONTENT: 'UPDATE_PAGE_CONTENT',
  DELETE_PAGE: 'DELETE_PAGE',
  PUBLISH_PAGE: 'PUBLISH_PAGE',
  UNPUBLISH_PAGE: 'UNPUBLISH_PAGE',
  
  // Sistema
  FORCE_LOGOUT: 'FORCE_LOGOUT',
  CLEAR_CACHE: 'CLEAR_CACHE',
  RUN_MIGRATION: 'RUN_MIGRATION'
} as const;

/**
 * Tipos de recursos (para consistência)
 */
export const RESOURCE_TYPES = {
  ANNOUNCEMENT: 'announcement',
  USER: 'user',
  PLAN: 'plan',
  SUBSCRIPTION: 'subscription',
  BANNER: 'banner',
  PAGE: 'page',
  SMTP_CONFIG: 'smtp_config',
  SYSTEM: 'system'
} as const;
