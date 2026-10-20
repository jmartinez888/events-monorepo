// Migraciones para despliegues (contenedor «migrate» de docker compose).
//
// El historial de prisma/migrations es incremental: no incluye una migración
// inicial completa. Por eso:
// - Base vacía: se crea el esquema actual con `db push` y todas las migraciones
//   se marcan como aplicadas (línea base). Desde ahí, `migrate deploy` normal.
// - Base con historial (_prisma_migrations): solo `migrate deploy`.
// - Base heredada sin historial (instalaciones antiguas con db push): se detiene
//   sin tocar nada, porque las migraciones incluyen pasos de datos que db push no hace.
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'package.json'));
const { PrismaClient } = require('@prisma/client');
const prismaCli = require.resolve('prisma/build/index.js');
const prisma = (...args) => execFileSync(process.execPath, [prismaCli, ...args], { cwd: root, stdio: 'inherit' });

const db = new PrismaClient();
const [state] = await db.$queryRaw`
  SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS "hasHistory",
         to_regclass('public.main_events') IS NOT NULL AS "hasTables"`;
await db.$disconnect();

if (!state.hasHistory && state.hasTables) {
  console.error('La base tiene tablas pero no historial de migraciones (instalación con db push). Crea la línea base a mano antes de desplegar; no se modificó nada.');
  process.exit(1);
}

if (!state.hasHistory) {
  console.log('Base vacía: se crea el esquema y se registra la línea base de migraciones.');
  prisma('db', 'push', '--skip-generate');
  const migrations = readdirSync(path.join(root, 'prisma', 'migrations')).filter((name) => statSync(path.join(root, 'prisma', 'migrations', name)).isDirectory()).sort();
  for (const name of migrations) prisma('migrate', 'resolve', '--applied', name);
}

prisma('migrate', 'deploy');
console.log('Migraciones al día.');

// Primera cuenta SUPER_ADMIN: solo si se configuró y todavía no existe ninguna.
const email = process.env.SEED_SUPERADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.SEED_SUPERADMIN_PASSWORD;
if (email && password) {
  const bootstrap = new PrismaClient();
  if (!(await bootstrap.authUser.count({ where: { role: 'SUPER_ADMIN' } }))) {
    const bcrypt = require('bcryptjs');
    const account = await bootstrap.authUser.upsert({
      where: { email },
      create: { email, passwordHash: await bcrypt.hash(password, 10), role: 'SUPER_ADMIN', emailVerifiedAt: new Date() },
      update: { role: 'SUPER_ADMIN', emailVerifiedAt: new Date() },
    });
    await bootstrap.profile.upsert({ where: { authUserId: account.id }, create: { authUserId: account.id, firstName: 'Administrador', lastName: 'General', primaryEmail: email, additionalEmails: [email] }, update: {} });
    console.log(`Cuenta SUPER_ADMIN creada: ${email}. Cambia la contraseña tras el primer acceso.`);
  }
  await bootstrap.$disconnect();
}
