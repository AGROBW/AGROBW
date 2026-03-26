// =====================================================
// SERVIÇO DE GEOLOCALIZAÇÃO
// =====================================================
// Converte CEP em coordenadas (latitude/longitude)
// usando APIs externas (ViaCEP + OpenStreetMap Nominatim)
// =====================================================

interface GeoCoordinates {
  latitude: number;
  longitude: number;
  formatted_address?: string;
}

interface ViaCepResponse {
  cep: string;
  logradouro: string;
  complemento: string;
  bairro: string;
  localidade: string;
  uf: string;
  ibge: string;
  gia: string;
  ddd: string;
  siafi: string;
}

/**
 * Busca informações do CEP via ViaCEP
 */
async function fetchCepData(cep: string): Promise<ViaCepResponse | null> {
  try {
    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length !== 8) {
      throw new Error('CEP inválido');
    }

    const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
    
    if (!response.ok) {
      throw new Error('Erro ao buscar CEP');
    }

    const data = await response.json();
    
    if (data.erro) {
      throw new Error('CEP não encontrado');
    }

    return data;
  } catch (error) {
    console.error('Erro no ViaCEP:', error);
    return null;
  }
}

/**
 * Converte endereço em coordenadas usando Nominatim (OpenStreetMap)
 */
async function geocodeAddress(address: string): Promise<GeoCoordinates | null> {
  try {
    // Nominatim requer um user-agent
    const encodedAddress = encodeURIComponent(address);
    const url = `https://nominatim.openstreetmap.org/search?q=${encodedAddress}&format=json&limit=1`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'BWAGRO-Platform/1.0'
      }
    });

    if (!response.ok) {
      throw new Error('Erro ao geocodificar endereço');
    }

    const data = await response.json();

    if (!data || data.length === 0) {
      throw new Error('Endereço não encontrado');
    }

    const result = data[0];
    
    return {
      latitude: parseFloat(result.lat),
      longitude: parseFloat(result.lon),
      formatted_address: result.display_name
    };
  } catch (error) {
    console.error('Erro no Nominatim:', error);
    return null;
  }
}

async function geocodeWithFallbacks(addressCandidates: string[]): Promise<GeoCoordinates | null> {
  for (const candidate of addressCandidates) {
    const normalizedCandidate = candidate.trim();
    if (!normalizedCandidate) continue;

    const coordinates = await geocodeAddress(normalizedCandidate);
    if (coordinates) {
      return coordinates;
    }
  }

  return null;
}

/**
 * Converte CEP em coordenadas geográficas
 * Retorna latitude e longitude ou null se não conseguir
 */
export async function cepToCoordinates(cep: string): Promise<GeoCoordinates | null> {
  try {
    // 1. Buscar dados do CEP
    const cepData = await fetchCepData(cep);
    
    if (!cepData) {
      console.error('Não foi possível obter dados do CEP');
      return null;
    }

    // 2. Montar variações do endereço para fallback progressivo
    const addressCandidates = [
      [cepData.logradouro, cepData.bairro, cepData.localidade, cepData.uf, 'Brasil'].filter(Boolean).join(', '),
      [cepData.bairro, cepData.localidade, cepData.uf, 'Brasil'].filter(Boolean).join(', '),
      [cepData.localidade, cepData.uf, 'Brasil'].filter(Boolean).join(', '),
      [cepData.cep, 'Brasil'].filter(Boolean).join(', ')
    ];

    // 3. Geocodificar endereço com fallback
    const coordinates = await geocodeWithFallbacks(addressCandidates);

    if (!coordinates) {
      console.error('Não foi possível geocodificar o endereço a partir do CEP:', cepData.cep);
      return null;
    }

    return coordinates;
  } catch (error) {
    console.error('Erro ao converter CEP em coordenadas:', error);
    return null;
  }
}

/**
 * Calcula distância entre dois pontos geográficos usando fórmula de Haversine
 * Retorna distância em quilômetros
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const earthRadiusKm = 6371;

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusKm * c;
}

/**
 * Converte graus para radianos
 */
function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Valida se um CEP é válido
 */
export function isValidCep(cep: string): boolean {
  const cleanCep = cep.replace(/\D/g, '');
  return cleanCep.length === 8;
}

/**
 * Formata CEP para exibição (12345-678)
 */
export function formatCep(cep: string): string {
  const cleanCep = cep.replace(/\D/g, '');
  if (cleanCep.length !== 8) return cep;
  return `${cleanCep.slice(0, 5)}-${cleanCep.slice(5)}`;
}

/**
 * Atualiza coordenadas de um usuário no banco
 */
export async function updateUserCoordinates(
  userId: string,
  cep: string,
  supabase: any
): Promise<boolean> {
  try {
    const coordinates = await cepToCoordinates(cep);
    
    if (!coordinates) {
      return false;
    }

    const { error } = await supabase
      .from('users')
      .update({
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        geo_updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (error) {
      console.error('Erro ao atualizar coordenadas do usuário:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Erro em updateUserCoordinates:', error);
    return false;
  }
}

/**
 * Atualiza coordenadas de um anúncio no banco
 */
export async function updateAnnouncementCoordinates(
  announcementId: string,
  cep: string,
  supabase: any
): Promise<boolean> {
  try {
    const coordinates = await cepToCoordinates(cep);
    
    if (!coordinates) {
      return false;
    }

    const { error } = await supabase
      .from('announcements')
      .update({
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        geo_updated_at: new Date().toISOString()
      })
      .eq('id', announcementId);

    if (error) {
      console.error('Erro ao atualizar coordenadas do anúncio:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Erro em updateAnnouncementCoordinates:', error);
    return false;
  }
}

/**
 * Busca anúncios dentro de um raio específico
 */
export async function findAnnouncementsWithinRadius(
  userLat: number,
  userLon: number,
  radiusKm: number,
  supabase: any
): Promise<any[]> {
  try {
    // Buscar todos os anúncios com coordenadas
    const { data: announcements, error } = await supabase
      .from('announcements')
      .select('*')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null);

    if (error) {
      console.error('Erro ao buscar anúncios:', error);
      return [];
    }

    if (!announcements) {
      return [];
    }

    // Filtrar por distância
    const filtered = announcements.filter((ad: any) => {
      const distance = calculateDistance(
        userLat,
        userLon,
        ad.latitude,
        ad.longitude
      );
      return distance <= radiusKm;
    });

    return filtered;
  } catch (error) {
    console.error('Erro em findAnnouncementsWithinRadius:', error);
    return [];
  }
}

export default {
  cepToCoordinates,
  calculateDistance,
  isValidCep,
  formatCep,
  updateUserCoordinates,
  updateAnnouncementCoordinates,
  findAnnouncementsWithinRadius
};
