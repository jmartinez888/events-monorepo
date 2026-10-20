# Adaptación del Sistema de Eventos IIAP

Fecha de revisión: 6 de octubre de 2026.

## Alcance y fuentes

Diagnóstico estático del monorepo de Eventos y del repositorio `C:/Users/2006p/Desktop/a/Repos/certificados/certificados_iiap`. Requisitos extraídos de los once DOCX actuales, numerados 00–10, en `C:/Users/2006p/Desktop/eventos`. Las versiones de `_Versiones anteriores` no se usaron. Los flujos 03 v3, 04 v2, 05 v2, 09 y 10 precisan o amplían la propuesta inicial 00.

No se comprobó infraestructura desplegada, datos de producción, credenciales ni API de Asistencia. Este documento no afirma cumplimiento operativo ni representa una implementación.

## Decisión del 13 de octubre de 2026: identidad sin Authelia

No se integra Authelia ni OIDC. Eventos mantiene su autenticación propia y adopta de los documentos 06 y 10 solo la lógica de registro y seguridad:

- Autoregistro con verificación del correo por código de 6 dígitos.
- Segundo factor opcional para todas las cuentas, incluido SUPER_ADMIN: app autenticadora (TOTP) o código por correo, con códigos de recuperación.
- Autenticar no autoriza: una cuenta nueva es `USER` sin membresías; los roles los asigna un administrador.
- El vínculo persona ↔ cuenta es `Profile.authUserId`. Se resuelve por correo verificado y, ante ambigüedad, no se vincula automáticamente.

Las filas 06 y 10 de la matriz y la etapa 2 del orden de implementación se leen con esta decisión. La implementación está descrita en [adaptacion-iiap-fase-2.md](adaptacion-iiap-fase-2.md).

## Conclusión

La base es reutilizable: API NestJS con PostgreSQL/Prisma, panel React/Vite y portal Astro. Ya existen organizaciones, perfiles sin cuenta, eventos, ediciones, actividades, sesiones, ponentes, formularios y automatizaciones de correo.

Las brechas principales son Directorio sin duplicados, identidad Authelia, asistencia consolidada, roles múltiples y certificables, integraciones externas y documentos privados/versionados. La API existente de Certificados no ofrece todavía el contrato de emisión descrito por el flujo 05.

## Matriz de requisitos

| Documento | Evidencia actual | Brecha y adaptación requerida |
| --- | --- | --- |
| 00 — Arquitectura | `Profile.authUserId` es opcional; existen organizaciones, eventos y sesiones. | Consolidar Directorio como fuente única. Eventos será su único escritor. Mantener Certificados y Asistencia externos; empezar con módulos internos para Directorio y Notificaciones. |
| 01 — Zoom/Facebook | No se encontró integración operativa en `apps/api/src`. | Adaptadores por proveedor, reuniones por sesión, registro requerido, Live/RTMP, secretos cifrados, sincronización de cambios, webhooks, reconciliación y reintentos. |
| 02 — Inscripción | Formularios públicos, ventanas de registro, máximo de envíos y correo de confirmación. | Resolver/reutilizar persona por documento y correo, revisar conflictos, inscripción por edición, token interno, registrant Zoom y enlace único, origen de registro y lista de espera. Validar aforo bajo concurrencia. |
| 03 v3 — QR presencial | `EventParticipant.checkedIn` permite una marca booleana. | Adaptador a la API externa de Asistencia, evento espejo, supervisores, alta manual solicitada a Eventos, marcas QR/manual, webhook y reconciliación al cierre. |
| 04 v2 — Virtual | La marca `checkedIn` no registra permanencia ni aprobación. | Tabla común de asistencia, modo manual/automático, umbral configurable, intervalos Zoom, aprobación/reversión en bloque con actor y fecha, aprobación directa de certificado con motivo. |
| 05 v2 — Certificados | Eventos registra códigos propios; Certificados tiene consulta, carga de PDF y envío. | Roles libres y múltiples; plantilla, horas, glosa y requisito de asistencia por rol. Orquestar emisión externa idempotente, estados de entrega, errores y reemisión versionada. Ampliar primero la API externa. |
| 06 — Vínculo identidad | Relación opcional y única entre perfil y cuenta local. | Vínculo OIDC estable por `issuer + sub`, estado activo/pendiente/revocado, resolución segura y revisión de coincidencias ambiguas. |
| 07 — Notificaciones | Plantillas, automatizaciones, entregas persistidas, ejecución cada 60 segundos y consentimiento de marketing. | Preferencias de recordatorios separadas del marketing, Telegram con token de enlace, baja, fallback, reintentos limitados, reclamación atómica de trabajos e idempotencia. |
| 08 — Materiales | `SessionResource` guarda nombre, URL y tipo; biblioteca R2 existente. | Material por sesión/expositor, PDF/PPT/PPTX, permisos de propietario/organizador, visibilidad pública/inscritos/privada, versiones, borrado lógico y descarga temporal firmada. |
| 09 — Sesiones/documentos/storage | Jerarquía `MainEvent → Edition → EventActivity → EventSession`; varios ponentes por sesión. | Conservar jerarquía; definir horarios/duración por sesión, roles de ponente/coexpositor/moderador, documentos del evento, cómputo de horas y `StoragePort` configurable. |
| 10 — Authelia | Login local bcrypt/JWT, gestión de cuentas y recuperación de contraseña. | Migrar a OIDC y permisos por grupos globales más roles contextuales. Definir aprovisionamiento compatible con el backend real de Authelia; no suponer autoregistro ni federación disponibles. |

## Hallazgos concretos en Eventos

- `apps/api/src/modules/registration-forms/registration-forms.service.ts`: `registerMainParticipant` crea siempre un perfil. La misma persona inscrita en dos eventos puede duplicarse. Además exige un rol de ponente para crear el formulario principal, requisito ajeno al registro de asistentes.
- `apps/api/src/modules/participants/participants.service.ts`: `addManual` también crea siempre un perfil. El control de duplicados por edición/perfil no evita duplicados humanos.
- `apps/api/prisma/schema.prisma`: el documento de identidad no tiene restricción de unicidad; el correo de una persona sin cuenta se guarda en `additionalEmails`. Falta un correo principal normalizado para el Directorio.
- `apps/api/src/modules/event-content/event-content.service.ts`: la API restringe roles a `participant`, `coordinator`, `speaker` y `speaker_mg`. La interfaz permite aparentar mayor flexibilidad que la API.
- `EventParticipant.roleId` permite un único rol. `ParticipantRole` no tiene plantilla, horas, glosa ni condición de emisión.
- `apps/api/src/modules/certificates/certificates.service.ts`: `issue` crea un registro local y código aleatorio. No invoca Certificados, no genera PDF, no comprueba asistencia y no tiene idempotencia por persona/rol.
- `apps/api/src/modules/media/r2-storage.service.ts`: proveedor R2 acoplado y URLs públicas permanentes. No hay operaciones de firma temporal/existencia ni protección suficiente para materiales privados.
- `apps/api/src/modules/marketing/automation.service.ts`: `dispatchDue` toma trabajos `QUEUED` sin reclamación atómica y deja fallos en `FAILED`. Requiere control de concurrencia y una política explícita de reintentos antes de operar con varias instancias.

## Contrato real de Certificados

Evidencia: `apps/api/src/routes/integrations.ts`, `routes/admin.certificates.ts`, `services/people.ts` y `prisma/schema.prisma` del repositorio externo.

La superficie `/api/v1` autentica por `X-API-Key` y permite consultar certificados, asociar nombre/correo y enviar correos individuales, masivos o libres. Los scopes actuales son `certificates:read`, `people:write`, `email:send` y `email:custom`.

`POST /api/admin/certificates` recibe un PDF ya elaborado mediante multipart y requiere sesión administrativa. No es un servicio de generación por plantilla. No se encontró un endpoint de emisión por API key ni un motor de plantillas PDF en la API revisada.

Además, `Person.normalizedName` es único y `upsertPersonByName` identifica personas por nombre. Esto puede unir homónimos; no sirve como clave del Directorio compartido.

Cambios requeridos en el repositorio externo:

1. Agregar referencia estable `directoryPersonId`; conservar nombre/documento como instantánea histórica del certificado. Retirar el nombre como identidad única después de conciliar datos.
2. Definir el mecanismo de generación PDF/plantillas dentro del sistema de Certificados y su API de servicio. Mantener los PDFs históricos y el portal existente.
3. Añadir un permiso de emisión y contrato versionado, con idempotencia, consulta de estado y resultado verificable. No reutilizar credenciales de administrador desde Eventos.
4. Recibir persona, evento/edición, asignación de rol, plantilla, horas, glosa y clave de idempotencia. Devolver ID externo, código, estado y enlace de consulta; evitar guardar tokens temporales como URL permanente.
5. Versionar correcciones/reemisiones y definir revocación. Estos estados no existen en el modelo externo actual.

La ruta y payload definitivos deben acordarse con ese servicio; `POST /certificados` en el DOCX es un contrato propuesto, no una ruta disponible.

## Modelo objetivo propuesto

Reutilizar `Profile` como persona canónica mediante migración incremental. No crear un segundo padrón paralelo. Conservar organizaciones/ediciones y separar afiliación personal de membresía con permisos.

| Entidad o ampliación | Responsabilidad |
| --- | --- |
| `Profile` / Directorio | Documento tipado/normalizado, correo principal, datos de contacto, detección de conflictos y fusión auditada. |
| `IdentityLink` | Persona única, issuer/sub únicos, estado y fecha; independencia de contraseñas y correo cambiante. |
| `EventParticipant` / inscripción | Persona y edición únicas, estado, origen, token propio y estado de inscripción por proveedor/sesión. |
| `ParticipantRole` + `ParticipantRoleAssignment` | Catálogo/rol de evento, múltiples asignaciones, plantilla externa, horas, glosa y política de asistencia. |
| `AttendanceRecord` + intervalos | Inscripción/sesión, método/fuente, entradas/salidas, minutos, porcentaje, validez y aprobación auditada. |
| `SessionIntegration` | IDs Zoom/Asistencia/Facebook, estado de sincronización y referencias a secretos protegidos. |
| `CertificateRequest` | Asignación de rol, elegibilidad, aprobación directa, idempotencia, ID externo, estados, intentos e historial de versiones. |
| `NotificationPreference` + entregas | Preferencias por persona, chat Telegram, horarios, canal, estado e intentos. |
| Materiales y documentos | Sesión/expositor o evento, storage key, MIME/tamaño, visibilidad, versiones, estado y actor. |
| Outbox, recepción de webhooks y auditoría | Persistencia de acciones externas, deduplicación, reintentos y trazabilidad por actor/organización. |

Son nombres propuestos, no modelos implementados. Delimitar operaciones y permisos por organización, evento y asignación contextual. Inscripción pública no otorga roles sensibles. Cuentas técnicas deben tener permisos propios; un token de usuario no sustituye autenticación entre servicios.

## Orden de implementación y aceptación

1. **Directorio y migración.** Inventariar duplicados, conservar IDs/referencias y centralizar resolución en un servicio. Aceptación: dos inscripciones de la misma persona reutilizan perfil; documento/correo contradictorios abren revisión sin sobrescribir otra persona. Aforo se respeta con solicitudes concurrentes.
2. **Identidad y permisos.** Integrar OIDC, vínculo por issuer/sub, revisión y grupos. Aceptación: una persona sin cuenta se inscribe; cambio de correo conserva vínculo; usuario nuevo no recibe permisos administrativos; revocar identidad conserva historial.
3. **Roles y asistencia manual.** Roles libres/múltiples, políticas por rol, registros comunes y aprobación en bloque. Aceptación: aprobación y reversión tienen actor/fecha; asistente sin asistencia no es elegible; organizador puede cumplir una política sin asistencia.
4. **Contrato externo y certificados.** Implementar emisión en Certificados y adaptador en Eventos. Aceptación: repetir petición o perder una respuesta no genera certificados duplicados; fallos de un destinatario no bloquean al resto; correcciones crean versiones y se consultan en el portal existente.
5. **Asistencia presencial.** Obtener contrato real de Asistencia e integrar espejo, supervisores, QR/manual y reconciliación. Aceptación: replay no duplica marcas; persona nueva se crea solo mediante Eventos; cierre recupera marcas cuyo webhook se perdió.
6. **Zoom y asistencia automática.** Crear reunión/registrant por sesión e importar reportes con paginación y reconexiones. Aceptación: umbral configurable, intervalos superpuestos no suman doble, sesión cancelada se trata explícitamente, 429 respeta reintento y modo manual sigue disponible.
7. **Facebook.** Configurar Live/RTMP y sincronización por proveedor. Aceptación: fallo de transmisión no elimina evento ni inscripción; secretos/start URLs no salen en respuestas públicas.
8. **Notificaciones.** Reutilizar correo y agregar preferencias, Telegram y despacho durable. Aceptación: baja impide recordatorios; reintentos son limitados; varias instancias no despachan el mismo trabajo simultáneamente; programación usa `America/Lima`.
9. **Storage y documentos.** Introducir puerto/adaptadores, materiales, actas y descargas autorizadas. Aceptación: inscrito/ponente/organizador ven solo archivos permitidos; URLs caducan; reemplazo conserva versiones; cambiar proveedor no requiere reescribir módulos de documentos.

## Dependencias pendientes de infraestructura

- Contrato y acceso de prueba del sistema externo de Asistencia: no se proporcionó su repositorio ni su API.
- Cuenta y capacidades reales de Zoom; verificar plan, endpoints y scopes contra documentación oficial antes de implementar.
- Página/app/permisos de Meta, procedimiento de renovación de tokens y configuración RTMP; verificar requisitos actuales. Las cifras y permisos del DOCX no se trataron como garantías vigentes.
- Acuerdo del motor de emisión/plantillas y contrato ampliado de Certificados.
- Storage por entorno, buckets privados, límites de archivos, bot Telegram y política de envíos.

## Verificación de esta revisión

Se leyeron los once documentos actuales y se contrastaron modelos, servicios y rutas locales de ambos repositorios. No se ejecutaron migraciones, no se modificó código funcional y no se probó contra servicios externos. Único archivo añadido por esta revisión: este diagnóstico. El cambio preexistente de `.gitignore` pertenece al usuario y se conserva.
