// Serviço de cálculo de distância entre CEPs e funcionalidades logísticas

interface CepCoordinates {
  lat: number;
  lng: number;
  cidade: string;
  uf: string;
}

interface DistanceResult {
  distanceKm: number;
  origin: CepCoordinates;
  destination: CepCoordinates;
}

// Cache de coordenadas para evitar requisições repetidas
const coordinatesCache = new Map<string, CepCoordinates>();

/**
 * Busca coordenadas aproximadas de um CEP
 * Usa a API do AwesomeAPI que retorna lat/lng
 */
async function fetchCepCoordinates(cep: string): Promise<CepCoordinates | null> {
  // Remove formatação do CEP
  const cleanCep = cep.replace(/\D/g, '');
  
  if (cleanCep.length !== 8) {
    return null;
  }

  // Verifica cache
  if (coordinatesCache.has(cleanCep)) {
    return coordinatesCache.get(cleanCep)!;
  }

  try {
    // Primeiro busca dados básicos do CEP
    const viaCepResponse = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
    const viaCepData = await viaCepResponse.json();

    if (viaCepData.erro) {
      return null;
    }

    // Para obter coordenadas, vamos usar a API do OpenStreetMap Nominatim
    const searchQuery = `${viaCepData.localidade}, ${viaCepData.uf}, Brazil`;
    const nominatimResponse = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&limit=1`,
      {
        headers: {
          'User-Agent': 'BWAGRO-Logistics-App'
        }
      }
    );

    const nominatimData = await nominatimResponse.json();

    if (nominatimData.length === 0) {
      // Fallback: coordenadas aproximadas por cidade
      return null;
    }

    const coordinates: CepCoordinates = {
      lat: parseFloat(nominatimData[0].lat),
      lng: parseFloat(nominatimData[0].lon),
      cidade: viaCepData.localidade,
      uf: viaCepData.uf
    };

    // Armazena no cache
    coordinatesCache.set(cleanCep, coordinates);

    return coordinates;
  } catch (error) {
    console.error('Erro ao buscar coordenadas do CEP:', error);
    return null;
  }
}

/**
 * Calcula distância entre duas coordenadas usando fórmula de Haversine
 * Retorna distância em quilômetros
 */
function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Raio da Terra em km
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return Math.round(distance * 10) / 10; // Arredonda para 1 casa decimal
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Calcula distância entre dois CEPs
 */
export async function calculateDistanceBetweenCeps(
  cep1: string,
  cep2: string
): Promise<DistanceResult | null> {
  try {
    const [coord1, coord2] = await Promise.all([
      fetchCepCoordinates(cep1),
      fetchCepCoordinates(cep2)
    ]);

    if (!coord1 || !coord2) {
      return null;
    }

    const distanceKm = calculateHaversineDistance(
      coord1.lat,
      coord1.lng,
      coord2.lat,
      coord2.lng
    );

    return {
      distanceKm,
      origin: coord1,
      destination: coord2
    };
  } catch (error) {
    console.error('Erro ao calcular distância:', error);
    return null;
  }
}

/**
 * Gera link do Google Maps entre dois CEPs
 */
export function generateGoogleMapsLink(cep1: string, cep2: string): string {
  const cleanCep1 = cep1.replace(/\D/g, '');
  const cleanCep2 = cep2.replace(/\D/g, '');
  
  return `https://www.google.com/maps/dir/${cleanCep1}/${cleanCep2}`;
}

/**
 * Formata número de telefone para WhatsApp
 */
export function formatPhoneForWhatsApp(phone: string): string {
  // Remove tudo que não é número
  const cleaned = phone.replace(/\D/g, '');
  
  // Se já tem código do país, retorna
  if (cleaned.startsWith('55') && cleaned.length >= 12) {
    return cleaned;
  }
  
  // Adiciona código do país (55)
  return `55${cleaned}`;
}

/**
 * Gera link do WhatsApp com mensagem pré-definida
 */
export function generateWhatsAppLink(phone: string, message: string = ''): string {
  const formattedPhone = formatPhoneForWhatsApp(phone);
  const encodedMessage = encodeURIComponent(message);
  
  return `https://wa.me/${formattedPhone}${message ? `?text=${encodedMessage}` : ''}`;
}

/**
 * Calcula custo de frete baseado em distância e valor por km
 */
export function calculateFreightCost(distanceKm: number, pricePerKm: number): number {
  return Math.round(distanceKm * pricePerKm * 100) / 100;
}
