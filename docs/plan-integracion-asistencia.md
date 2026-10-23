# Plan de integración: Sistema de Asistencia ↔ Sistema de Eventos

Documento para el equipo de **attendance-control** (Asistencia IIAP).
Fecha: 22 de octubre de 2026.

## 1. Objetivo

El Sistema de Eventos ya está desplegado. Para los eventos y sesiones **presenciales**, la asistencia se registra con la app móvil de Asistencia, que el equipo de Asistencia mantiene.

La integración debe lograr cuatro cosas:

1. Que Eventos cree en Asistencia una **copia (espejo)** de cada sesión presencial. Esto **ya funciona** con la API actual de Asistencia; no requiere cambios.
2. Que cada marca registrada en Asistencia sobre un evento espejo **avise a Eventos en el momento** (webhook).
3. Que Asistencia, cuando la persona no está inscrita, **pida a Eventos** que la registre. En Asistencia ya se registra a la persona como asistente local; lo nuevo es que también quede inscrita en Eventos.
4. Que los eventos espejo **no se editen ni borren** desde Asistencia por error.

Eventos es el **dueño** de los eventos. Asistencia guarda copias y aporta las marcas de asistencia. Ningún flujo de Asistencia que hoy funciona (jornada laboral, QR de supervisor, reconocimiento facial, eventos propios) debe cambiar de comportamiento.

## 2. Cómo funciona hoy, sin cambios en Asistencia

Esta parte ya está implementada en Eventos y usa la API actual de Asistencia tal como existe:

| Paso | Quién | Llamada | Notas |
| --- | --- | --- | --- |
| Crear espejo | Eventos | `POST /api/events` | Una vez por **sesión** presencial o híbrida. |
| Actualizar espejo | Eventos | `PATCH /api/events/:id` | Cuando cambia el horario o el título en Eventos. |
| Leer marcas | Eventos | `GET /api/events/:id` | Al cerrar la sesión y cada 15 min durante 3 días (reconciliación). |

**Cuerpo que envía Eventos al crear o actualizar.** Son solo campos que ya existen en `CreateEventDto`:

```json
{
  "title": "Simposio Amazónico 2026 · Mesa de trabajo: pesquerías sostenibles",
  "description": "…",
  "location": "IIAP Sede Central, Iquitos",
  "start_date": "2026-11-12T16:00:00.000Z",
  "end_date": "2026-11-12T17:30:00.000Z",
  "type": "CONFERENCIA",
  "requires_attendance": true,
  "qr_code": "EVENTOS-6a1f3c2e-…-uuid-de-la-sesion"
}
```

- **`qr_code` con prefijo `EVENTOS-`** identifica, desde hoy, que el evento es un espejo de Eventos. La sección 5 usa esta marca.
- **Autenticación:** Eventos envía `Authorization: Bearer <token>` de una cuenta de servicio con rol `ADMIN_EVENTO` (Fase 0).
- **Campos que Eventos lee de `GET /api/events/:id`:** `attendees[].id`, `user_name`, `user_email`, `document_number` y `registered_at`. **No cambien ni quiten esos campos** de la respuesta.

Solo con esto, Eventos ya recupera las marcas por **consulta periódica**, con hasta 15 minutos de retraso tras terminar la sesión. Las fases siguientes las vuelven inmediatas y completas.

## 3. Reglas para no romper nada

1. **Solo cambios aditivos.** No se renombra, quita ni cambia el tipo de ninguna columna, endpoint o campo de respuesta existente.
2. **Columnas nuevas siempre `nullable`**, con migración TypeORM en `src/database/migrations`. En producción `synchronize` está desactivado (`app.module.ts`). No dependan del `ALTER TABLE` de `onModuleInit` para columnas nuevas.
3. **DTOs:** cualquier campo nuevo que Eventos vaya a enviar se agrega como **opcional** en `CreateEventDto` y `UpdateEventDto` **antes** de que Eventos lo envíe. `ValidationPipe` usa `forbidNonWhitelisted: true`, así que un campo desconocido devuelve 400 y rompe la sincronización.
4. **La integración nunca bloquea la sede.** Si Eventos no responde, la marca se guarda igual en Asistencia y el aviso se reintenta después. Ningún registro de asistencia debe fallar por culpa de Eventos.
5. **Todo detrás de una variable:** `EVENTOS_INTEGRATION_ENABLED=false` deja el sistema exactamente como hoy.
6. **Los eventos propios no cambian:** los que no son espejo, sin prefijo `EVENTOS-` ni `external_source`, se comportan igual que siempre.
7. **Las pruebas cubren lo existente:** antes de desplegar, verifiquen el registro por QR, el registro manual y el registro web (`registro.html`) en un evento **no** espejo.

## 4. Fase 0: cuenta de servicio y datos de conexión (sin código)

Responsable: administrador de Asistencia.

1. Crear un usuario solo para la integración, por ejemplo `eventos-sync@iiap.gob.pe`, con una contraseña aleatoria larga, `is_active = true` y `is_verified = true`.
2. Asignarle el rol **`ADMIN_EVENTO`** con `PATCH /api/users/:id/role`, como SUPERADMIN. No debe ser SUPERADMIN ni ADMIN.
3. Iniciar sesión una vez con esa cuenta:
   ```bash
   curl -s -X POST https://<dominio-asistencia>/api/auth/login \
     -H 'Content-Type: application/json' \
     -d '{"email":"eventos-sync@iiap.gob.pe","password":"<clave>"}'
   ```
   El `access_token` de la respuesta es permanente: `ignoreExpiration: true` y se valida contra la base en cada petición.
4. Entregar al equipo de Eventos, **por un canal privado y no por chat**:
   - `ATTENDANCE_API_URL` = `https://<dominio-asistencia>/api`
   - `ATTENDANCE_API_TOKEN` = el `access_token` anterior.

Para **revocar** el acceso basta con desactivar el usuario (`is_active = false`): `JwtStrategy` rechaza el token aunque no haya expirado.

## 5. Fase 1: aviso inmediato de cada marca (webhook)

### 5.1 Variables nuevas en Asistencia

| Variable | Valor | Origen |
| --- | --- | --- |
| `EVENTOS_INTEGRATION_ENABLED` | `true` / `false` | Ustedes. `false` mantiene el comportamiento actual. |
| `EVENTOS_API_URL` | `https://dev-api-eventos.iiap.gob.pe/api` | Equipo de Eventos (ya existe). |
| `EVENTOS_WEBHOOK_SECRET` | Cadena larga | Equipo de Eventos: es su `ATTENDANCE_WEBHOOK_SECRET`. |
| `EVENTOS_SERVICE_KEY` | Cadena larga | Equipo de Eventos: es su `ATTENDANCE_SERVICE_KEY` (Fase 2). |

Agréguenlas a `.env.example` y regístrenlas como **opcionales** en `validateEnv`: Asistencia debe arrancar sin ellas.

### 5.2 Columnas nuevas, opcionales pero recomendadas

Migración nueva sobre la tabla `events`:

```sql
ALTER TABLE events ADD COLUMN IF NOT EXISTS external_source varchar(30) NULL;
ALTER TABLE events ADD COLUMN IF NOT EXISTS external_id varchar(100) NULL;
CREATE INDEX IF NOT EXISTS idx_events_external ON events (external_source, external_id);
```

Además:
- Agréguenlas a la entidad `Event` como `nullable: true`.
- Agréguenlas a `CreateEventDto` como opcionales, con `@IsOptional() @IsString()`.

Cuando estén desplegadas, avísennos: Eventos empezará a enviar `external_source: "EVENTOS"` y `external_id: "<id de sesión>"`. **Hasta entonces, Eventos no las envía**, porque provocaría un 400.

Para saber si un evento es espejo, usen esta función. Funciona desde ya gracias al `qr_code`:

```ts
// src/modules/events/eventos-mirror.util.ts
export const isEventosMirror = (event: { external_source?: string | null; qr_code?: string | null }) =>
  event.external_source === 'EVENTOS' || !!event.qr_code?.startsWith('EVENTOS-');
```

### 5.3 Dónde engancharlo

En `src/modules/events/events.service.ts`, método `registerAttendance`, **después** de:

```ts
await this.attendeeRepository.save(attendee);
```

agreguen la llamada al notificador **sin `await` bloqueante**: el registro responde al usuario como hoy.

```ts
if (isEventosMirror(event)) {
  void this.eventosNotifier.attendanceRecorded(event, attendee); // no bloquea, no lanza
}
```

Es el **único** punto donde se crean marcas de eventos. Las marcas de jornada laboral (`attendance.service.ts`) **no** se notifican.

### 5.4 Contrato del webhook

**Petición:**

```
POST {EVENTOS_API_URL}/webhooks/attendance
Content-Type: application/json
X-Attendance-Signature: <hex de HMAC-SHA256(cuerpo exacto, EVENTOS_WEBHOOK_SECRET)>
```

```json
{
  "event_id": "<id del evento en Asistencia (events.id)>",
  "attendee": {
    "id": "<event_attendees.id>",
    "user_name": "María Pérez",
    "user_email": "maria@correo.pe",
    "document_number": "41234567",
    "registered_at": "2026-11-12T16:05:12.000Z",
    "is_external": true
  }
}
```

- La firma se calcula sobre **los mismos bytes** que se envían. Serialicen una sola vez y firmen ese string.
- `X-Attendance-Signature` acepta el hex solo o con prefijo `sha256=`.
- Eventos cruza a la persona **primero por `document_number`** y luego por `user_email`. Si no existe, la crea con origen «registro en sede». Envíen siempre el documento cuando lo tengan.
- **Reenviar es seguro.** Eventos descarta duplicados por `event_id` + `attendee.id`.

**Respuestas de Eventos:**

| Código | Cuerpo | Qué hacer |
| --- | --- | --- |
| 200 | `{"matched": true, "registrationId": "…"}` | Listo. |
| 200 | `{"duplicate": true}` | Ya se había recibido. Listo. |
| 200 | `{"matched": false}` | El `event_id` no es un espejo conocido. No reintentar. |
| 403 | `Firma inválida` | Secreto mal configurado. **No reintentar**; registrar el error en el log. |
| 5xx o error de red | — | Reintentar (5.6). |

### 5.5 Implementación de referencia (Node 18+, sin dependencias nuevas)

```ts
// src/modules/events/eventos-notifier.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { Event } from './entities/event.entity';
import { EventAttendee } from './entities/event-attendee.entity';

@Injectable()
export class EventosNotifierService {
  private readonly logger = new Logger(EventosNotifierService.name);
  constructor(private readonly config: ConfigService) {}

  private get enabled() {
    return this.config.get('EVENTOS_INTEGRATION_ENABLED') === 'true'
      && !!this.config.get('EVENTOS_API_URL') && !!this.config.get('EVENTOS_WEBHOOK_SECRET');
  }

  /** Nunca lanza: un fallo de Eventos no debe afectar el registro en sede. */
  async attendanceRecorded(event: Event, attendee: EventAttendee): Promise<void> {
    if (!this.enabled) return;
    const body = JSON.stringify({
      event_id: event.id,
      attendee: {
        id: attendee.id,
        user_name: attendee.user_name,
        user_email: attendee.user_email,
        document_number: attendee.document_number,
        registered_at: attendee.registered_at,
        is_external: attendee.is_external,
      },
    });
    const signature = createHmac('sha256', this.config.get<string>('EVENTOS_WEBHOOK_SECRET')!).update(body).digest('hex');
    try {
      const response = await fetch(`${this.config.get('EVENTOS_API_URL')}/webhooks/attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Attendance-Signature': signature },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) this.logger.warn(`Eventos respondió ${response.status} al notificar la marca ${attendee.id}`);
    } catch (error: any) {
      this.logger.warn(`No se pudo notificar a Eventos la marca ${attendee.id}: ${error?.message}`);
    }
  }
}
```

Regístrenlo en `EventsModule` (`providers`) e inyéctenlo en `EventsService`.

### 5.6 Reintentos (recomendado, no obligatorio)

Eventos ya **reconcilia** con `GET /api/events/:id` al cerrar cada sesión, así que una marca cuyo aviso falló se recupera igual. Para que la información llegue en tiempo real aunque Eventos esté caído un rato:

- Tabla `integration_outbox`: `id`, `payload jsonb`, `attempts int default 0`, `next_attempt_at timestamptz`, `last_error text`, `sent_at timestamptz null`.
- `registerAttendance` inserta la fila. Un `setInterval` de 60 s envía las pendientes. Los moldes ya existen en el repo, por ejemplo `weeklyResetTimer`.
- Espera creciente (1, 2, 4, 8… minutos) con un tope de 10 intentos.
- Un 403 se marca como fallido sin reintentar.

## 6. Fase 2: persona nueva registrada en sede

Hoy, si el supervisor registra a mano a alguien que no estaba inscrito, Asistencia lo guarda como asistente local y Eventos lo crea al recibir el webhook o al reconciliar. Esta fase hace que Asistencia **pida a Eventos** el registro en el momento y guarde los identificadores.

**Cuándo:** en `registerAttendance`, solo si `isEventosMirror(event)` y `user_id` viene vacío, es decir, un participante externo o un registro manual.

**Petición:**

```
POST {EVENTOS_API_URL}/integrations/attendance/person-registrations
Content-Type: application/json
X-Service-Key: <EVENTOS_SERVICE_KEY>
```

```json
{
  "attendanceEventId": "<events.id en Asistencia>",
  "person": {
    "firstName": "María",
    "lastName": "Pérez Ríos",
    "email": "maria@correo.pe",
    "documentType": "DNI",
    "documentNumber": "41234567",
    "phone": "965000000"
  }
}
```

- `firstName` y `lastName` son obligatorios, de máximo 120 caracteres. Si solo tienen `user_name`, separen la primera palabra como nombre y el resto como apellidos; si no hay resto, envíen `"-"`.
- `email`, `documentType` (máx. 20), `documentNumber` (máx. 30) y `phone` (máx. 30) son opcionales.

**Respuesta 200:**

```json
{ "personId": "…", "registrationId": "…", "status": "CONFIRMED", "needsReview": false }
```

- `needsReview: true` indica que los datos coincidían parcialmente con otra persona. Eventos la inscribió igual y un administrador lo revisará. **No bloqueen la marca.**
- Guarden los dos identificadores en columnas nuevas y opcionales de `event_attendees`, `eventos_person_id` y `eventos_registration_id`, ambas `varchar(100) NULL`.

**404** «Evento espejo no encontrado» significa que ese `attendanceEventId` no es un espejo creado por Eventos. No reintenten.

**Si Eventos falla** (red, 5xx o tiempo agotado de 10 s): guarden la marca igual y sigan. El webhook o la reconciliación completarán el registro en Eventos. Un 403 significa que la clave de servicio está mal configurada.

## 7. Fase 3: proteger los eventos espejo

Para evitar que un cambio hecho en Asistencia se pierda o desincronice:

1. **`PATCH /api/events/:id` y `DELETE /api/events/:id`.** Si `isEventosMirror(event)` y quien llama **no** es la cuenta de servicio, respondan `409` con el mensaje «Este evento se administra desde el Sistema de Eventos». Identifiquen la cuenta de servicio por su `id` en una variable, `EVENTOS_SERVICE_USER_ID`.
2. **App y panel:** muestren los eventos espejo con una etiqueta «Sistema de Eventos» y oculten las acciones de editar y eliminar.
3. **Supervisores:** se siguen asignando en Asistencia con el endpoint actual `POST /api/events/:id/managers`. Eventos no los gestiona por ahora.

## 8. Pruebas y criterios de aceptación

**Sin cambios de comportamiento (obligatorio en cada fase):**

- [ ] Registro por QR, manual y web en un evento **no** espejo: igual que antes y sin llamadas a Eventos (verificar en logs).
- [ ] Con `EVENTOS_INTEGRATION_ENABLED=false`, ningún flujo llama a Eventos.
- [ ] La jornada laboral, el QR de supervisor y el reconocimiento facial no cambian.

**Fase 1:**

- [ ] Una marca en un evento espejo llega a Eventos en menos de 10 s; en el panel de Eventos aparece como asistencia QR de la sesión.
- [ ] Con Eventos apagado, el registro en sede responde igual de rápido y sin error.
- [ ] Reenviar la misma marca no duplica nada en Eventos (`{"duplicate": true}`).

**Fase 2:**

- [ ] Una persona no inscrita aparece inscrita en Eventos con origen «registro en sede».
- [ ] Un DNI que coincide con otra persona y nombre distinto devuelve `needsReview: true` y la marca se guarda.

**Fase 3:**

- [ ] Editar o borrar un espejo con un usuario normal da 409. La cuenta de servicio sí puede.

**Probar la firma a mano.** Pídannos el secreto de staging y ejecuten:

```bash
BODY='{"event_id":"<id-espejo>","attendee":{"id":"prueba-1","user_name":"Prueba","user_email":"prueba@iiap.gob.pe","document_number":"00000001","registered_at":"2026-11-12T16:05:00.000Z","is_external":true}}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$EVENTOS_WEBHOOK_SECRET" -hex | sed 's/^.* //')
curl -s -X POST "$EVENTOS_API_URL/webhooks/attendance" \
  -H 'Content-Type: application/json' -H "X-Attendance-Signature: $SIG" -d "$BODY"
```

## 9. Orden de despliegue

1. **Fase 0:** entregan `ATTENDANCE_API_URL` y `ATTENDANCE_API_TOKEN`. Eventos los configura y empieza a crear espejos.
2. **Fase 1:** despliegan con `EVENTOS_INTEGRATION_ENABLED=false`, verifican que nada cambió y luego lo pasan a `true`.
3. Si agregaron `external_source` y `external_id`, nos avisan y Eventos empieza a enviarlos.
4. **Fases 2 y 3**, en ese orden, cada una con su verificación.

Cada fase se puede revertir poniendo `EVENTOS_INTEGRATION_ENABLED=false`, sin tocar la base.

## 10. Observaciones de seguridad del código actual (no bloqueantes)

Las detectamos al revisar la integración. No son requisito para integrarse y **deben coordinarse con la app móvil** antes de cambiarlas:

1. **`GET /api/events` y `GET /api/events/:id` no requieren sesión** y devuelven los asistentes con DNI, correo y teléfono. Cualquiera con la URL puede descargarlos. Sugerencia: exigir JWT o quitar los datos personales de la respuesta pública.
2. **`POST /api/events/:id/attendance` y `/attendees` no requieren sesión.** Cualquiera puede registrar asistencias en cualquier evento conociendo su id. Si la página web de registro lo necesita, conviene un token por evento o un límite de intentos.
3. **`PATCH` y `DELETE /api/events/:id`** comprueban el rol, pero no que quien llama sea gestor de ese evento.
4. **Los JWT no expiran** (`ignoreExpiration: true`). Para revocar a alguien hay que desactivar el usuario; cambiar la contraseña no invalida tokens ya emitidos.

## 11. Qué necesitamos de vuelta

| Dato | Para qué |
| --- | --- |
| `ATTENDANCE_API_URL` | Que Eventos cree y lea espejos (Fase 0). |
| `ATTENDANCE_API_TOKEN` | Igual (Fase 0). |
| Aviso de despliegue de cada fase | Activar en Eventos el envío de `external_source`/`external_id` y probar en conjunto. |

Y de nuestra parte les entregamos, por canal privado: `EVENTOS_API_URL`, `EVENTOS_WEBHOOK_SECRET` y `EVENTOS_SERVICE_KEY`.
