import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { appError } from '../utils/appLogger';

export type WhatsappGatewayAction = 'health' | 'test_message';

export interface WhatsappGatewayActionResult {
  success: boolean;
  action?: WhatsappGatewayAction;
  requestId?: string;
  httpStatus?: number;
  checkedAt?: string;
  error?: string;
}

export const useWhatsappGatewayActions = () => {
  const [runningAction, setRunningAction] = useState<WhatsappGatewayAction | null>(null);
  const [lastResult, setLastResult] = useState<WhatsappGatewayActionResult | null>(null);

  const runAction = async (action: WhatsappGatewayAction): Promise<WhatsappGatewayActionResult> => {
    setRunningAction(action);
    setLastResult(null);
    try {
      const { data, error } = await supabase.functions.invoke<WhatsappGatewayActionResult>(
        'whatsapp-gateway-admin',
        { body: { action } },
      );
      if (error) {
        appError('[WhatsappGateway] Falha na operacao administrativa', error);
        const context = (error as { context?: Response }).context;
        const responseBody = context
          ? await context.clone().json().catch(() => null) as WhatsappGatewayActionResult | null
          : null;
        const result: WhatsappGatewayActionResult = responseBody || {
          success: false,
          error: 'Nao foi possivel concluir o teste do gateway.',
        };
        setLastResult(result);
        return result;
      }

      const result: WhatsappGatewayActionResult = data || {
        success: false,
        error: 'Resposta invalida do gateway.',
      };
      setLastResult(result);
      return result;
    } catch (error) {
      appError('[WhatsappGateway] Erro inesperado na operacao administrativa', error);
      const result: WhatsappGatewayActionResult = {
        success: false,
        error: 'Nao foi possivel concluir o teste do gateway.',
      };
      setLastResult(result);
      return result;
    } finally {
      setRunningAction(null);
    }
  };

  return { runningAction, lastResult, runAction };
};
