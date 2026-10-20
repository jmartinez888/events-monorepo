/**
 * Lectura centralizada de la configuración sensible. En producción, una clave
 * ausente detiene el arranque en lugar de caer en un valor por defecto conocido.
 */
const isProduction = () => process.env.NODE_ENV === 'production';

function required(name: string, devFallback: string) {
  const value = process.env[name]?.trim();
  if (value) return value;
  if (isProduction()) throw new Error(`Falta la variable de entorno ${name}`);
  return devFallback;
}

export const config = {
  jwtAccessSecret: () => required('JWT_ACCESS_SECRET', 'dev-access-secret-local-only'),
  jwtRefreshSecret: () => required('JWT_REFRESH_SECRET', 'dev-refresh-secret-local-only'),
  /** Cifra secretos TOTP y credenciales de integraciones. Si se pierde, los 2FA por app dejan de validar. */
  encryptionKey: () => required('ENCRYPTION_KEY', `${process.env.JWT_ACCESS_SECRET || 'dev'}::encryption-local-only`),
  /** Firma las URLs temporales de descarga de archivos. */
  fileUrlSecret: () => required('FILE_URL_SECRET', `${process.env.JWT_ACCESS_SECRET || 'dev'}::files-local-only`),
  appName: () => process.env.APP_NAME?.trim() || 'Eventos IIAP',
  panelUrl: () => (process.env.FRONTEND_URL?.split(',')[0]?.trim() || 'http://localhost:5173').replace(/\/+$/, ''),
  portalUrl: () => (process.env.PORTAL_URL?.trim() || 'http://localhost:4321').replace(/\/+$/, ''),
  apiPublicUrl: () => (process.env.API_PUBLIC_URL?.trim() || `http://localhost:${process.env.PORT ?? 3000}/api`).replace(/\/+$/, ''),
  timezone: 'America/Lima',
};

/** Falla al arrancar si la configuración obligatoria de producción no existe. */
export function assertRuntimeConfig() {
  config.jwtAccessSecret();
  config.jwtRefreshSecret();
  config.encryptionKey();
  config.fileUrlSecret();
}
