# Adaptación IIAP: primera fase

Fecha: 7 de octubre de 2026.

Esta fase aplica parte del diagnóstico de [plan-adaptacion-iiap.md](plan-adaptacion-iiap.md). No supone cumplimiento completo de los once documentos.

## Cambios disponibles

- **Directorio:** las inscripciones principales, altas manuales y altas de ponentes reutilizan una persona por correo o documento. Las operaciones concurrentes se serializan. Una coincidencia ambigua o contradictoria devuelve un conflicto y revierte la inscripción; no modifica la identidad existente.
- **Roles:** se pueden crear códigos propios, etiquetas, roles de ponente, horas, texto de participación y requisito de asistencia. Una inscripción puede tener varios roles. El rol principal anterior se conserva por compatibilidad. Los roles inactivos no se pueden asignar.
- **Asistencia manual:** el panel permite aprobar o retirar asistencia individualmente o por lote, con motivo opcional. Se registra autor, fecha, estado anterior y lote. Repetir una aprobación no cambia su atribución original. La asistencia por sesión no aprueba automáticamente el evento completo.
- **Protección del historial:** no se pueden borrar inscripciones con asistencia o certificados. Un certificado emitido bloquea cambios de roles y retirada de asistencia hasta revocarlo.
- **Certificados locales:** la emisión comprueba el rol principal activo y la asistencia requerida. La conexión al sistema externo y la emisión independiente por cada rol quedan pendientes.
- **Permisos:** la configuración de roles, asignaciones y aprobación de asistencia exige administración de la organización o superadministración vigente en la base de datos.

## Demo local

Abrir <http://127.0.0.1:5175/login>.

- Usuario: `demo.iiap@example.test`
- Contraseña: `IIAPdemo2026!`
- Organización: `IIAP · Demostración local`
- Evento: `Simposio de investigación amazónica`

Dentro del evento, abrir **Roles** y **Asistentes**. Los datos son ficticios. Las capturas están en [roles.png](capturas-iiap/roles.png) y [asistencia.png](capturas-iiap/asistencia.png).

La demo usa PostgreSQL en `127.0.0.1:55432`, API en `3015` y panel en `5175`. La base habitual del proyecto no se modificó. Los procesos deben estar activos para acceder.

## Validación

Se verificaron compilación de API y panel, validación Prisma y doce pruebas de integración sobre PostgreSQL aislado. Cubren concurrencia, capacidad del formulario, conflictos de identidad, permisos, roles múltiples, historial, límites por edición y reglas locales de certificados.

La prueba en Edge verificó inicio de sesión, creación y persistencia de roles personalizados, retirada y aprobación por lote, y persistencia de asistencia y roles múltiples después de recargar. No hubo errores JavaScript de página.

La migración se ejecutó sobre el esquema anterior con registros históricos. Conservó la asistencia heredada sin inventar un autor. La comparación posterior con el esquema Prisma actual no detectó diferencias.

La compilación del panel mantiene advertencias de tamaño de bundle y mezcla de importación estática/dinámica de jsPDF. No impiden la compilación.

## Reproducir integración y migración

Los comandos siguientes requieren una **base de prueba nueva y vacía**. No deben ejecutarse sobre una base con datos reales. Las pruebas rechazan conexiones que no sean `localhost` o `127.0.0.1`, puerto `55432`, base `events_test`.

Desde la raíz del repositorio, en PowerShell:

```powershell
$env:DATABASE_URL='postgresql://events_test:events_test_local@127.0.0.1:55432/events_test?schema=public'
pnpm.cmd --filter events-api exec prisma db push --schema test/fixtures/before-adaptation.prisma --skip-generate
pnpm.cmd --filter events-api exec prisma db execute --file test/fixtures/legacy-attendance.sql --schema prisma/schema.prisma
pnpm.cmd --filter events-api exec prisma db execute --file prisma/migrations/20261007120000_directory_roles_attendance/migration.sql --schema prisma/schema.prisma
pnpm.cmd --filter events-api exec prisma migrate diff --from-url $env:DATABASE_URL --to-schema-datamodel prisma/schema.prisma --exit-code
pnpm.cmd --filter events-api exec prisma generate
pnpm.cmd --filter events-api build
pnpm.cmd --filter events-api test:adaptation
node apps/api/scripts/seed-adaptation-demo.mjs
```

Para iniciar la demo preparada:

```powershell
$env:DATABASE_URL='postgresql://events_test:events_test_local@127.0.0.1:55432/events_test?schema=public'
$env:JWT_ACCESS_SECRET='iiap-preview-access-key-local-only-2026'
$env:JWT_REFRESH_SECRET='iiap-preview-refresh-key-local-only-2026'
$env:FRONTEND_URL='http://127.0.0.1:5175'
$env:PORT='3015'
node apps/api/dist/main.js
```

En otra consola:

```powershell
$env:VITE_API_URL='http://127.0.0.1:3015/api'
pnpm.cmd --filter panel-admin dev --host 127.0.0.1 --port 5175 --strictPort
```

La nueva migración es incremental y necesita las tablas existentes. El repositorio ya tenía migraciones incrementales sin una migración inicial completa. Antes de aplicar `migrate deploy` en otra instalación, revisar su historial y baseline. Esta fase no modifica ese historial ni ejecuta migraciones en producción.

## Trabajo pendiente

La resolución de conflictos todavía no tiene una cola persistente de revisión o fusión. No fusiona duplicados históricos automáticamente. Sin correo ni documento no puede deduplicar con certeza. Los formularios secundarios conservan su flujo de respuestas independientes.

Quedan pendientes Authelia/OIDC, Directorio externo, QR externo, importación de Zoom, conexión y emisión externa de certificados por rol, Telegram, almacenamiento privado y documentos versionados. El campo de plantilla externa está preparado en el modelo, pero no establece conexión con Certificados.

Las nuevas comprobaciones de permisos cubren las operaciones modificadas; esta fase no es una auditoría completa de todos los endpoints históricos.
