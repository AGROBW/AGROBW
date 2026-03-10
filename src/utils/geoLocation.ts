/**
 * Detecta o estado (UF) do visitante através de geolocalização por IP
 * Tenta múltiplos serviços com fallback automático
 */

// Cache para evitar múltiplas chamadas à API
let cachedState: string | null = null;
let detectionAttempted = false;

/**
 * Detecta o estado do visitante
 * @returns Sigla do estado (ex: 'SP', 'RJ') ou null se não conseguir detectar
 */
export async function detectUserState(): Promise<string | null> {
  // 1. Retornar cache se já detectamos nesta sessão
  if (detectionAttempted) {
    return cachedState;
  }

  detectionAttempted = true;

  try {
    // Tentar API 1: ipinfo.io (mais confiável, gratuito até 50k req/mês)
    try {
      const response = await fetch('https://ipinfo.io/json', {
        signal: AbortSignal.timeout(3000)
      });

      if (response.ok) {
        const data = await response.json();
        
        // ipinfo.io retorna "region" com nome completo, precisamos mapear
        if (data.country === 'BR' && data.region) {
          const state = mapRegionNameToCode(data.region);
          if (state) {
            cachedState = state;
            console.log('[GeoLocation] Estado detectado via ipinfo.io:', cachedState);
            return cachedState;
          }
        }
      }
    } catch (err) {
      console.warn('[GeoLocation] Falha no ipinfo.io, tentando alternativa...');
    }

    // Tentar API 2: ip-api.com (gratuito até 45 req/min)
    try {
      const response = await fetch('https://ip-api.com/json/?fields=status,countryCode,region', {
        signal: AbortSignal.timeout(3000)
      });

      if (response.ok) {
        const data = await response.json();
        
        if (data.status === 'success' && data.countryCode === 'BR' && isValidBrazilianState(data.region)) {
          cachedState = data.region.toUpperCase();
          console.log('[GeoLocation] Estado detectado via ip-api.com:', cachedState);
          return cachedState;
        }
      }
    } catch (err) {
      console.warn('[GeoLocation] Falha no ip-api.com');
    }

    // Se todas as APIs falharem, retornar null (não crítico)
    console.warn('[GeoLocation] Não foi possível detectar estado - clique não será registrado');
    return null;

  } catch (error) {
    console.error('[GeoLocation] Erro geral:', error);
    return null;
  }
}

/**
 * Mapeia nome completo do estado para sigla (usado por ipinfo.io)
 */
function mapRegionNameToCode(regionName: string): string | null {
  const stateMap: Record<string, string> = {
    'Acre': 'AC',
    'Alagoas': 'AL',
    'Amapá': 'AP',
    'Amazonas': 'AM',
    'Bahia': 'BA',
    'Ceará': 'CE',
    'Distrito Federal': 'DF',
    'Espírito Santo': 'ES',
    'Goiás': 'GO',
    'Maranhão': 'MA',
    'Mato Grosso': 'MT',
    'Mato Grosso do Sul': 'MS',
    'Minas Gerais': 'MG',
    'Pará': 'PA',
    'Paraíba': 'PB',
    'Paraná': 'PR',
    'Pernambuco': 'PE',
    'Piauí': 'PI',
    'Rio de Janeiro': 'RJ',
    'Rio Grande do Norte': 'RN',
    'Rio Grande do Sul': 'RS',
    'Rondônia': 'RO',
    'Roraima': 'RR',
    'Santa Catarina': 'SC',
    'São Paulo': 'SP',
    'Sergipe': 'SE',
    'Tocantins': 'TO'
  };

  return stateMap[regionName] || null;
}

/**
 * Valida se é uma sigla válida de estado brasileiro
 */
function isValidBrazilianState(state: string | undefined): boolean {
  if (!state || typeof state !== 'string') return false;
  
  const validStates = [
    'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
    'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
    'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
  ];
  
  return validStates.includes(state.toUpperCase());
}

/**
 * Limpa o cache de estado (útil para testes)
 */
export function clearStateCache(): void {
  cachedState = null;
  detectionAttempted = false;
}
