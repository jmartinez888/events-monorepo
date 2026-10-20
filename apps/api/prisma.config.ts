import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { defineConfig } from 'prisma/config';

// Con prisma.config.ts, la CLI deja de cargar .env por su cuenta. Se cargan el
// .env local de la API y el global del monorepo, en ese orden de prioridad, sin
// pisar variables ya definidas en el entorno (Docker, CI o pruebas).
for (const file of [path.join(__dirname, '.env'), path.join(__dirname, '..', '..', '.env')]) {
  if (!existsSync(file)) continue;
  for (const [key, value] of Object.entries(parseEnv(readFileSync(file, 'utf8')))) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
});
