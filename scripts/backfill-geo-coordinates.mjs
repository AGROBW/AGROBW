import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY antes de rodar o backfill.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function normalizeCep(cep) {
  return String(cep || '').replace(/\D/g, '');
}

async function fetchCepData(cep) {
  const cleanCep = normalizeCep(cep);
  if (cleanCep.length !== 8) return null;

  const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
  if (!response.ok) return null;

  const data = await response.json();
  return data?.erro ? null : data;
}

async function geocodeAddress(address) {
  const encodedAddress = encodeURIComponent(address);
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodedAddress}&format=json&limit=1`,
    {
      headers: {
        'User-Agent': 'BWAGRO-GeoBackfill/1.0',
      },
    }
  );

  if (!response.ok) return null;
  const data = await response.json();
  if (!Array.isArray(data) || data.length === 0) return null;

  return {
    latitude: Number.parseFloat(data[0].lat),
    longitude: Number.parseFloat(data[0].lon),
  };
}

async function cepToCoordinates(cep) {
  const cepData = await fetchCepData(cep);
  if (!cepData) return null;

  const address = [
    cepData.logradouro,
    cepData.bairro,
    cepData.localidade,
    cepData.uf,
    'Brasil',
  ]
    .filter(Boolean)
    .join(', ');

  return geocodeAddress(address);
}

async function backfillUsers() {
  const { data, error } = await supabase
    .from('users')
    .select('id, cep')
    .not('cep', 'is', null)
    .is('latitude', null)
    .is('longitude', null)
    .limit(500);

  if (error) throw error;

  let updated = 0;
  for (const user of data || []) {
    const coords = await cepToCoordinates(user.cep);
    if (!coords) continue;

    const { error: updateError } = await supabase
      .from('users')
      .update({
        latitude: coords.latitude,
        longitude: coords.longitude,
        geo_updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (!updateError) updated += 1;
  }

  console.log(`Usuarios atualizados: ${updated}`);
}

async function backfillAnnouncements() {
  const { data, error } = await supabase
    .from('announcements')
    .select('id, cep')
    .not('cep', 'is', null)
    .is('latitude', null)
    .is('longitude', null)
    .limit(500);

  if (error) throw error;

  let updated = 0;
  for (const ad of data || []) {
    const coords = await cepToCoordinates(ad.cep);
    if (!coords) continue;

    const { error: updateError } = await supabase
      .from('announcements')
      .update({
        latitude: coords.latitude,
        longitude: coords.longitude,
        geo_updated_at: new Date().toISOString(),
      })
      .eq('id', ad.id);

    if (!updateError) updated += 1;
  }

  console.log(`Anuncios atualizados: ${updated}`);
}

async function run() {
  console.log('Iniciando backfill de coordenadas...');
  await backfillUsers();
  await backfillAnnouncements();
  console.log('Backfill concluido.');
}

run().catch((error) => {
  console.error('Erro no backfill de coordenadas:', error);
  process.exit(1);
});
