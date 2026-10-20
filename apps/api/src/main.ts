import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import { ApiExceptionFilter } from './common/api-exception.filter.js';
import { assertRuntimeConfig } from './common/config.js';

async function bootstrap() {
  // Sin secretos JWT ni clave de cifrado, producción no arranca con valores por defecto conocidos.
  assertRuntimeConfig();
  // Conserva el cuerpo exacto para validar la firma criptográfica de webhooks
  // de proveedores como Resend (Svix).
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  // Detrás de un proxy inverso, la IP real llega en X-Forwarded-For (límite de intentos y bitácora).
  if (process.env.TRUST_PROXY) app.getHttpAdapter().getInstance().set('trust proxy', process.env.TRUST_PROXY === 'true' ? true : process.env.TRUST_PROXY);
  const defaultFrontendOrigins = [
    'https://dev-qa.nuiti.org',
    'https://medmind.com.pe',
    'http://localhost:3001',
  ];
  const configuredFrontendOrigins = (process.env.FRONTEND_URL ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const frontendOrigins = [...defaultFrontendOrigins, ...configuredFrontendOrigins];

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow requests with no origin (like mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);

      const isConfigured = frontendOrigins.includes(origin) || frontendOrigins.includes('*');
      const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

      if (isConfigured || isLocalhost) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    exposedHeaders: ['Set-Cookie'],
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new ApiExceptionFilter());
  await app.listen(Number(process.env.PORT ?? 3000), '0.0.0.0');
}

void bootstrap();
