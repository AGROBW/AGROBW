import { SmtpClient } from 'https://deno.land/x/smtp@v0.7.0/mod.ts';

const denoCompat = Deno as unknown as {
  writeAll?: (writer: { write: (data: Uint8Array) => Promise<number> }, data: Uint8Array) => Promise<void>;
  writeAllSync?: (writer: { writeSync: (data: Uint8Array) => number }, data: Uint8Array) => void;
};

if (!denoCompat.writeAll) {
  denoCompat.writeAll = async (writer, data) => {
    let written = 0;

    while (written < data.length) {
      written += await writer.write(data.subarray(written));
    }
  };
}

if (!denoCompat.writeAllSync) {
  denoCompat.writeAllSync = (writer, data) => {
    let written = 0;

    while (written < data.length) {
      written += writer.writeSync(data.subarray(written));
    }
  };
}

export type SmtpSettings = {
  id: string;
  host: string;
  port: number;
  user_name: string;
  password: string;
  encryption: 'SSL' | 'TLS' | 'NONE';
  from_email: string;
  from_name: string;
  is_active: boolean;
};

export const loadSmtpSettings = async (supabaseAdmin: any): Promise<SmtpSettings | null> => {
  const { data, error } = await supabaseAdmin
    .from('smtp_settings')
    .select('id, host, port, user_name, password, encryption, from_email, from_name, is_active')
    .eq('id', 'smtp_config_1')
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load SMTP settings: ${error.message}`);
  }

  if (!data || !data.is_active) {
    return null;
  }

  return data as SmtpSettings;
};

export const validateSmtpSettings = (settings: SmtpSettings | null) => {
  if (!settings) {
    return 'Configuracao SMTP do painel nao encontrada ou inativa';
  }

  if (!settings.host || !settings.user_name || !settings.password || !settings.from_email) {
    return 'Configuracao SMTP do painel esta incompleta';
  }

  return null;
};

export const connectSmtpClientWithSettings = async (client: SmtpClient, settings: SmtpSettings) => {
  const smtpPort = Number(settings.port || 587);
  const smtpEncryption = (settings.encryption || 'TLS').toUpperCase();

  if (smtpEncryption === 'SSL' || smtpPort === 465) {
    await client.connectTLS({
      hostname: settings.host,
      port: smtpPort,
      username: settings.user_name,
      password: settings.password,
    });
    return;
  }

  await client.connect({
    hostname: settings.host,
    port: smtpPort,
    username: settings.user_name,
    password: settings.password,
  });
};
