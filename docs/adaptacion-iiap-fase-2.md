# Adaptación IIAP: segunda fase

Fecha: 13 de octubre de 2026.

Esta fase continúa [adaptacion-iiap-fase-1.md](adaptacion-iiap-fase-1.md) y cubre los flujos 00–10 de «Sistema de Eventos», con la decisión de no usar Authelia ([plan-adaptacion-iiap.md](plan-adaptacion-iiap.md)). Las integraciones con Zoom, Facebook, Asistencia, Certificados y Telegram están implementadas, pero **no se probaron contra los servicios reales**: no hay credenciales en este entorno. Sin configurar, cada integración informa su estado y no bloquea el resto del sistema.

## Cuentas: verificación de correo y segundo factor (documentos 06 y 10)

- **Registro público** (`POST /auth/register`, página `/register` del panel). La cuenta nace como `USER` y sin organizaciones. No puede usarse hasta confirmar el correo con un código de 6 dígitos. `ALLOW_PUBLIC_SIGNUP=false` lo desactiva.
- **Inicio de sesión por pasos.** `POST /auth/login` responde con uno de tres estados:
  - `OK`: sesión abierta.
  - `VERIFY_EMAIL`: se envió un código al correo.
  - `MFA_REQUIRED`: falta el segundo factor.

  Los dos últimos incluyen un `pendingToken` de 10 minutos. Ese token solo sirve para `POST /auth/verify-email`, `POST /auth/login/2fa` y `POST /auth/resend-code`; no abre la API.
- **Segundo factor opcional para todas las cuentas, incluido SUPER_ADMIN** (perfil → Seguridad).
  - App autenticadora (TOTP RFC 6238, la misma lógica de `certificados_iiap`) o código por correo.
  - Al activarlo se entregan 8 códigos de recuperación de un solo uso.
  - El secreto TOTP se guarda cifrado con AES-256-GCM.
  - Un código TOTP no se acepta dos veces.
  - Un SUPER_ADMIN puede retirar el 2FA de quien perdió el teléfono y sus códigos.
- **Códigos por correo.**
  - Se guardan como HMAC.
  - Vencen a los 15 minutos y admiten 5 intentos.
  - Debe pasar al menos 45 s entre envíos, y solo vale el último código enviado.
- **Sesiones.** `sessionVersion` invalida los refresh tokens al cambiar contraseña, rol, estado o 2FA. «Cerrar las demás sesiones» hace lo mismo.
- **Bitácora.** `security_events` registra accesos, fallos, cambios de 2FA y de contraseña.
- **Vínculo con el Directorio.** Al verificar el correo, la cuenta se enlaza a la persona existente con ese correo. Si hay varias candidatas, no se vincula.
- **Migración.** Las cuentas existentes quedan verificadas, para que nadie pierda el acceso.

## Inscripción (documento 02)

- **Punto único.** Todas las vías crean la inscripción con `RegistrationsService`: formularios, altas manuales, ponentes, registro en sede y asistentes abiertos de Zoom.
- **Campos nuevos de la inscripción:** estado (`CONFIRMED`, `WAITLISTED`, `CANCELLED`…), origen (`FORM`, `MANUAL`, `ONSITE`, `OPEN_REGISTRATION`…) y un token propio.
- **Aforo y lista de espera.**
  - El aforo es por edición y se respeta con solicitudes simultáneas.
  - Con lista de espera, quien excede el aforo queda en `WAITLISTED`. Una cancelación o un aumento de aforo confirma por orden de llegada.
  - Las altas del organizador y el registro en sede no cuentan contra el aforo.
- **Posible duplicado (§4.2).** Ya no bloquea la inscripción pública:
  - La inscripción se hace con un perfil provisional y se abre una revisión.
  - El panel ofrece «Revisión de duplicados» para fusionar o mantener separadas a las personas.
  - Un perfil provisional no impide reconocer después a la persona real.
- **Página personal en el portal** (`/{institución}/inscripcion/{token}`):
  - estado de la inscripción;
  - enlaces únicos de Zoom y transmisión en vivo;
  - materiales visibles para inscritos;
  - certificados;
  - preferencias de recordatorio, enlace con Telegram y cancelación.

## Asistencia (documentos 03 y 04)

- **Configuración por evento:** modo virtual `MANUAL` o `AUTOMATIC` y umbral de permanencia (80 % por defecto).
- **Modo automático (Zoom).**
  - Importa el reporte de participantes, paginado, y une las reconexiones superpuestas antes de sumar minutos.
  - Quien entró sin inscribirse se registra con origen `OPEN_REGISTRATION`.
  - Una aprobación manual previa no se sobrescribe.
  - La importación se dispara cinco minutos después del webhook `meeting.ended`. Una reconciliación periódica la repite si el webhook se perdió.
- **QR presencial.**
  - Cada sesión presencial crea un evento espejo en `attendance-control` (`POST /events`).
  - Las marcas llegan por `POST /api/webhooks/attendance`, firmado con HMAC, o por reconciliación al cierre (`GET /events/:id`).
  - Cada marca se cruza con la inscripción por documento y luego por correo.
  - Asistencia pide registrar personas nuevas con `POST /api/integrations/attendance/person-registrations` (cabecera `X-Service-Key`). Eventos es el único que escribe en el Directorio.
- **Elegibilidad para certificar.**
  - Una decisión explícita sobre el evento completo (aprobar o retirar) prevalece.
  - Sin ella, en eventos multi-sesión cuenta la proporción de sesiones válidas frente al umbral.

## Certificados por rol (documento 05)

- Se emite por persona y rol. Cada rol aplica sus horas, su glosa y su requisito de asistencia. Repetir la emisión no duplica.
- **Aprobación directa por rol:** el atajo del flujo 04 queda con actor, fecha y motivo obligatorio.
- **Reemisión:** la versión anterior queda `SUPERSEDED`. La revocación guarda el motivo.
- La verificación pública ya no expone documento ni correo.
- **Sin `CERTIFICATES_API_URL`:** Eventos emite y verifica localmente.
- **Con `CERTIFICATES_API_URL`:**
  - cada certificado se envía como un trabajo independiente con clave de idempotencia;
  - se reintenta con espera creciente y el fallo de un destinatario no bloquea al resto;
  - el contrato `POST /api/v1/certificates/issue` es una **propuesta**: la API de `certificados_iiap` todavía no lo implementa.

## Zoom y Facebook Live (documento 01)

- **Zoom.**
  - Por cada sesión virtual o híbrida con horario, se crea la reunión con registro obligatorio y un registrant (enlace único) por inscrito confirmado.
  - Los cambios de horario se propagan.
  - La URL de anfitrión se guarda cifrada y se obtiene solo desde el panel.
- **Facebook.** Live programado en la Página y transmisión configurada en Zoom (`PATCH /meetings/{id}/livestream`). La clave RTMP se guarda cifrada.
- **Webhooks de Zoom** (`POST /api/webhooks/zoom`): validan la firma `x-zm-signature`, responden a `endpoint.url_validation` y descartan reenvíos.
- **Fallos.** Un `429` respeta `Retry-After`. Un fallo marca la sesión en `ERROR` con el detalle y se puede reintentar desde Integraciones.

## Notificaciones (documento 07)

- **Al inscribirse:** confirmación o aviso de lista de espera.
- **Recordatorios:** por sesión, según los minutos configurados por evento (por defecto, 60). Un cambio de horario anula los recordatorios viejos y programa los nuevos.
- **Canales:**
  - correo o Telegram; Telegram se enlaza con un deep-link al bot (`/start`) y `/stop` desactiva los recordatorios;
  - si Telegram falla, el aviso sale por correo.
- **Baja:** la persona puede darse de baja desde su página. Las preferencias son independientes del consentimiento de marketing.
- **Envío durable:** reclamación con `SKIP LOCKED`, clave de idempotencia y reintentos limitados. Las horas se muestran en `America/Lima`.
- **Correos de marketing:** también se reclaman de forma atómica y se reintentan hasta 3 veces (hallazgo del diagnóstico).

## Materiales, documentos y almacenamiento (documentos 08 y 09)

- **Almacenamiento:** `StoragePort` con adaptadores `local`, `minio`, `s3` y `r2` (`STORAGE_DRIVER`).
- **Qué se guarda:**
  - Los **materiales** pertenecen a una sesión y a un expositor.
  - Los **documentos** pertenecen al evento: acta, programa, memoria u otro.
- **Seguridad del archivo:**
  - Solo se admiten ciertas extensiones, y se comprueba que el contenido coincida con la extensión.
  - Límite de tamaño: `FILE_MAX_MB`.
  - Visibilidad pública, solo inscritos o privada.
- **Ciclo de vida:** reemplazar crea versiones; ocultar y eliminar son lógicos, y el historial se conserva.
- **Descarga:** URL firmada con HMAC que vence en 10 minutos. El binario lo sirve la API y nunca expone la clave de almacenamiento.
- **Expositor:** entra con su cuenta y gestiona solo su material, en perfil → Mis ponencias.
- **Sesiones:** ahora tienen inicio, fin y modalidad. Los ponentes por sesión tienen rol: expositor, coexpositor o moderador.

## Mejoras a lo existente

- **Permisos.** Antes no comprobaban permisos varias rutas: eventos, agenda, sesiones, ponentes, entradas, líneas temáticas, participantes y certificados. Ahora exigen membresía en la organización según la base de datos, con tres niveles: lectura, edición y administración.
- **`GET /auth/users`** ya no devuelve hashes de contraseña.
- **Secretos.**
  - Se eliminó el secreto JWT por defecto (`dev-access-secret`).
  - En producción, la API no arranca sin `JWT_*`, `ENCRYPTION_KEY` ni `FILE_URL_SECRET`.
  - `AdminGuard` consulta el rol en la base, no en el token.
- **Límite de intentos por IP** en acceso, registro, códigos y recuperación de contraseña.
- **Errores:** las respuestas incluyen un `code` estable (`CODE_EXPIRED`, `DIRECTORY_CONFLICT`…) que el panel usa.
- **Correo de confirmación:** el correo fijo de MedMind se reemplazó por la confirmación genérica de Notificaciones.

## Panel y portal

- **Panel:**
  - registro y acceso por pasos;
  - Perfil → Seguridad y Mis ponencias;
  - pestañas del evento «Inscripciones», «Materiales» e «Integraciones», esta última con horario por sesión, estado de sincronización, importación y reconciliación;
  - página «Revisión de duplicados»;
  - estado y retiro del 2FA en el panel global.
- **Portal:**
  - la página de éxito muestra la lista de espera y el enlace personal;
  - nueva página `inscripcion/{token}`;
  - la API pública incluye el horario de las sesiones y los archivos públicos con enlace firmado.

## Configuración

La configuración vive en un único `.env` en la raíz del monorepo; [.env.example](../.env.example) lista todas las variables. La API (`--env-file-if-exists`, `prisma.config.ts`), el panel y el portal (`envDir` de Vite) leen ese archivo. Una variable ya definida en el entorno tiene prioridad. Webhooks que hay que registrar en cada proveedor:

| Proveedor | URL | Firma |
| --- | --- | --- |
| Zoom | `{API}/webhooks/zoom` (eventos `meeting.ended`, `meeting.updated`) | `ZOOM_WEBHOOK_SECRET` |
| Asistencia | `{API}/webhooks/attendance` con `{ event_id, attendee }` | `X-Attendance-Signature` = HMAC-SHA256 hex del cuerpo con `ATTENDANCE_WEBHOOK_SECRET` |
| Telegram | `setWebhook` a `{API}/webhooks/telegram` con `secret_token` | `TELEGRAM_WEBHOOK_SECRET` |

`attendance-control` todavía no envía ese webhook ni llama a `person-registrations`. Hasta que lo haga, la reconciliación por consulta cubre las marcas.

## Validación

- **Migración.** `20261013120000_iiap_auth_integrations` se aplicó sobre el esquema anterior con datos heredados. La comparación posterior con `schema.prisma` no mostró diferencias.
- **Pruebas de integración.** 33 pruebas en PostgreSQL aislado (`pnpm --filter events-api test:integration`): las 12 de la fase 1 más 21 nuevas. Las nuevas cubren:
  - registro, verificación y 2FA por correo y por TOTP;
  - reutilización y bloqueo de códigos, y recuperación;
  - aforo y lista de espera concurrentes;
  - página por token, revisión y fusión de duplicados;
  - importación de Zoom con reconexiones y registro abierto;
  - marcas QR;
  - certificados por rol, aprobación directa, reemisión y emisión externa con reintento;
  - notificaciones idempotentes y baja;
  - archivos versionados con URL firmada;
  - cola de trabajos y permisos.
- **API real.** Se arrancó contra la base de prueba y se recorrieron por HTTP:
  - registro → código → verificación → TOTP → acceso con código de recuperación → límite de intentos;
  - flujo del organizador: integraciones, configuración, inscripciones, emisión, aprobación directa, carga y descarga firmada, página pública.
- **Builds.** API, panel y portal compilan. El panel mantiene la advertencia previa de tamaño de bundle.

No se probó en navegador la nueva interfaz del panel ni del portal; solo compilación y endpoints.

## Pendiente

- Credenciales y pruebas reales con Zoom (plan Pro), Meta, `attendance-control` y Telegram.
- Endpoint de emisión en `certificados_iiap` según el contrato propuesto.
- **Supervisores por evento en Asistencia.** La API de Asistencia asigna gestores por `user_id` propio; falta acordar el mapeo de cuentas.
- **Horas por sesiones asistidas** (documento 09 §6): hoy las horas son las del rol.
- **Límite de intentos en memoria.** Con varias instancias, el tope efectivo se multiplica. Los códigos tienen además un tope por código en la base.
- **Despliegue.** Revisar el historial de migraciones antes de `migrate deploy` en otra instalación (igual que en la fase 1).
