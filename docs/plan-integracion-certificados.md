# Plan de integración: Sistema de Eventos ↔ Sistema de Certificados

Documento para decidir si se procede y para el equipo de **certificados_iiap**.
Fecha: 22 de octubre de 2026. Revisado sobre la rama `feat/user-admin-roles` de certificados_iiap.

## 1. Resumen

**Certificados no cumple hoy lo que Eventos necesita**, pero le falta poco: basta un endpoint nuevo y tres columnas opcionales. No hay que reescribir nada ni tocar su diseño.

| Necesidad de Eventos (flujo 05) | Estado en Certificados | Brecha |
| --- | --- | --- |
| Emitir un certificado por persona y rol desde otro sistema | Solo un administrador con sesión puede subir un PDF (`POST /api/admin/certificates`) | Falta un endpoint con **API key** |
| Generar el PDF con una plantilla | **No genera PDF.** Los diseños se hacen fuera y se suben ya listos, o se importan desde carpeta (`sync-disk`) | Alguien debe generar el PDF (sección 3) |
| No duplicar si la petición se repite | No hay clave de idempotencia | Falta un campo `externalRef` |
| Horas por rol (no por curso) | `Certificate.hours` existe por documento, pero la subida copia las del curso | Aceptar `hours` en el endpoint nuevo |
| Vincular el evento | `Course` (curso o evento) sin referencia externa | Falta `Course.externalRef` |
| Identificar a la persona sin confundir homónimos | `resolvePerson` busca por correo y, si no hay, **por nombre** | Para la integración: documento → correo, nunca solo nombre |
| Revocar y corregir | `revoke` y `restore` existen, pero solo para administradores | Exponerlos por API key |
| Verificación pública, portal del titular y correo | **Ya existen** (`/verificar/:token`, el portal del titular, `/api/v1/emails/certificate`) | Ninguna: se reutilizan tal cual |

Lo que ya funciona bien y **no se toca**:
- Verificación pública con enlace aleatorio y nombre enmascarado por código.
- Huella SHA-256 del PDF.
- Revocación con motivo.
- Portal donde cada persona ve sus documentos por correo verificado.
- Envío de correos desde Certificados.
- Claves de API con permisos.

## 2. Principios

1. **Certificados sigue siendo el repositorio oficial.** Los documentos de Eventos se guardan, verifican y descargan ahí, igual que los subidos a mano. Para el titular y para quien verifica no hay diferencia de origen.
2. **Solo cambios aditivos.**
   - Un endpoint nuevo.
   - Un permiso nuevo de API key.
   - Tres columnas `NULL`.
   - Ningún endpoint, campo, pantalla ni flujo existente cambia de comportamiento.
3. **El diseño no cambia.**
   - La web de Certificados (verificación, portal, administración) queda igual.
   - Los PDF de Eventos se ven como los certificados actuales del IIAP (sección 3).
4. **Se puede apagar.** Basta con no crear la API key o revocarla: Eventos vuelve a emitir de forma local, como hoy.

## 3. ¿Quién genera el PDF?

| | Opción A (recomendada): Eventos genera y Certificados guarda | Opción B: Certificados genera |
| --- | --- | --- |
| Qué se construye | En Certificados, un endpoint que recibe el PDF ya hecho, como la subida manual pero por API key. En Eventos, el render del PDF en el servidor. | En Certificados, un motor de plantillas, un editor de diseño y la generación del PDF. |
| Diseño | El editor de plantillas que **ya existe en Eventos** (fondo, textos posicionados y QR) usa como fondo el **diseño oficial del IIAP sin nombre**. Resultado idéntico al actual. | Habría que crear un editor nuevo en Certificados y replicar el diseño. |
| Impacto en Certificados | Bajo: ~1 endpoint y 1 migración. | Alto: módulo nuevo, dependencias de PDF y pantallas nuevas. |
| Riesgo de romper algo | Mínimo. | Medio. |

**Recomendación: Opción A.** Respeta «no romper nada y no cambiar el diseño» con el menor cambio en Certificados. El resto de este documento la desarrolla.

**Cómo se garantiza que el diseño sea el mismo:**

1. El área de diseño entrega el certificado oficial vigente **sin el nombre ni los datos variables**, como imagen de fondo PNG a 300 ppp, en A4 horizontal o el formato que usen hoy. También entrega el archivo de la **tipografía** oficial (TTF/OTF).
2. En el editor de plantillas de Eventos se colocan, sobre ese fondo, los campos: nombre, glosa del rol («por su participación como…»), horas, fecha, código y QR de verificación.
3. **Prueba de paridad** antes de producción: se genera un PDF de muestra y se compara lado a lado con un certificado real ya emitido. No se aprueba hasta que el área de diseño dé el visto bueno.
4. Puede haber una plantilla por rol (asistente, ponente, comité…), cada una con su fondo y su glosa.

## 4. Cambios en Certificados (equipo de certificados_iiap)

### 4.1 Migración (aditiva)

```prisma
model Course {
  // …campos actuales sin cambios…
  /// Identificador del evento o edición en el sistema de origen (p. ej. "eventos:<editionId>").
  externalRef String? @unique
}

model Certificate {
  // …campos actuales sin cambios…
  /// Clave de idempotencia del sistema de origen: una petición repetida devuelve el mismo documento.
  externalRef String? @unique
  /// Sistema que lo emitió ("eventos"); nulo en los subidos a mano.
  source      String?
}
```

Todas son `NULL`. Los registros existentes no cambian. `pnpm db:migrate` crea la migración y `db:deploy` la aplica.

### 4.2 Permiso nuevo de API key

- **`apps/api/src/lib/api-keys.ts`:** agregar `'certificates:write'` a `API_SCOPES`.
- **`apps/web/src/api/client.ts`:** agregarlo también a `API_SCOPES`.
- **`apps/web/src/pages/admin/Integrations.tsx`:** agregar la etiqueta `'certificates:write': { title: 'Emitir documentos', hint: 'Crea y revoca documentos desde otro sistema.' }`.

Las claves existentes no lo tienen y siguen igual.

### 4.3 Endpoint: emitir

`POST /api/v1/certificates`, con `requireApiKey('certificates:write')`, tipo `multipart/form-data`.

| Campo | Obligatorio | Descripción |
| --- | --- | --- |
| `file` | Sí | PDF, máx. el mismo límite que la subida manual. Validar la firma `%PDF-`. |
| `externalRef` | Sí | Clave de idempotencia, p. ej. `eventos:<inscripción>:<rol>:v1`. |
| `course` | Sí | JSON con `externalRef`, `title`, `slug`, `codePrefix`, `issueDate`, `hours`, `organizer` y `description`. |
| `participantName` | Sí | Nombre completo tal como va impreso. |
| `email` | No | Vincula el documento con el portal del titular. |
| `documentId` | No | DNI/CE; se guarda en `Person.documentId`. |
| `documentType` | No | `CERTIFICADO` (por defecto), `CONSTANCIA` o `FELICITACION`. |
| `hours` | No | Horas de **este** documento (por rol); si falta, las del curso. |
| `code` | No | Código impreso en el PDF. Si falta, se genera correlativo con `nextCode`. |
| `verifyToken` | No | 24 caracteres hex. Si viene, se usa; si no, se genera con `newVerifyToken`. |

**Por qué `code` y `verifyToken` pueden venir de Eventos:** el QR y el código van **impresos dentro del PDF**, así que Eventos debe conocerlos antes de generarlo. Si ya están en uso, el endpoint responde 409 y Eventos genera otros y reintenta.

**Comportamiento:**

1. Si ya existe un `Certificate` con ese `externalRef`, responde **200** con el mismo documento, sin volver a guardar el archivo. Esto es la idempotencia.
2. **Curso:** se busca por `course.externalRef`. Si no existe se crea con los datos enviados; si existe se reutiliza **sin modificarlo**, para no pisar ediciones hechas a mano.
3. **Persona.** Se usa una función nueva, `resolvePersonForIntegration`, sin tocar `resolvePerson`:
   1. Si viene `documentId`, buscar por `documentId`.
   2. Si no, buscar por `email`.
   3. Si no hay coincidencia, crear la persona.
   4. **Nunca** solo por nombre, para no unir homónimos.
4. **Archivo:** se guarda igual que la subida manual (`course.slug/<nombre>.pdf`, con sufijo ` (n)` si existe), con `fileSha256`, `isCustom: true`, `source: 'eventos'` y `enroll(person, course)`.
5. **Respuesta 201:**
   ```json
   { "id": "…", "code": "…", "verifyToken": "…", "verificationUrl": "https://certificados…/verificar/…", "documentType": "CERTIFICADO", "status": "VALID" }
   ```

La lógica de guardado puede extraerse a una función compartida con `POST /api/admin/certificates`, **sin cambiar** lo que esa ruta hace hoy.

### 4.4 Endpoints: revocar y consultar

| Ruta | Permiso | Uso |
| --- | --- | --- |
| `POST /api/v1/certificates/{id}/revoke` con `{ "reason": "…" }` | `certificates:write` | Misma lógica que la revocación de administración. Solo documentos con `source = 'eventos'`. |
| `GET /api/v1/certificates/by-ref/{externalRef}` | `certificates:read` | Eventos confirma el estado si perdió una respuesta. |

Un documento **corregido** no se edita: Eventos revoca el anterior («Reemisión») y emite uno nuevo con otro `externalRef` (`…:v2`). Así el historial queda trazable, como en el modelo actual.

### 4.5 Correo (sin cambios)

Para que el titular reciba el correo **con el diseño actual de Certificados**, Eventos llama al endpoint existente `POST /api/v1/emails/certificate` (permiso `email:send`) con el `id` devuelto. No se construye nada nuevo.

### 4.6 Pruebas en Certificados

- [ ] La subida manual, la importación `sync-disk`, la verificación pública, el portal y los correos funcionan igual que antes, con datos existentes.
- [ ] Repetir `POST /api/v1/certificates` con el mismo `externalRef` devuelve el mismo `id`, sin un segundo archivo ni un segundo registro.
- [ ] Dos personas homónimas con distinto DNI quedan como dos personas.
- [ ] Una clave **sin** `certificates:write` recibe 403.
- [ ] El documento emitido por API aparece en el portal del titular del titular cuyo correo coincide, y se verifica por QR.
- [ ] Revocar por API se refleja en la verificación pública con el motivo.

## 5. Cambios en Eventos (equipo de Eventos, después de Certificados)

1. **Render del PDF en el servidor** con la plantilla del rol: fondo, textos, tipografía embebida y QR. Usa `pdf-lib`, que es una dependencia nueva en la API de Eventos, y `qrcode`, que ya usa el panel. Hoy la plantilla solo se dibuja en el navegador.
2. **Plantilla por rol:** el campo `externalTemplateId` del rol pasa a apuntar a una plantilla del editor. Se agrega `documentType` al rol.
3. **Cliente de Certificados:** cambia del contrato JSON propuesto a este `multipart`. Se mantienen la cola con reintentos y la idempotencia ya implementadas: `idempotencyKey` pasa a ser el `externalRef`.
4. **Código y QR:**
   - Eventos genera un `code` legible (p. ej. `IIAP-SIM26-7F3A2C`) y un `verifyToken` aleatorio.
   - Imprime en el PDF el QR hacia `https://<certificados>/verificar/<verifyToken>`.
   - Si recibe 409, genera otros y reintenta.
5. **Variables:**
   - `CERTIFICATES_API_URL`.
   - `CERTIFICATES_API_KEY`, con `certificates:write`, `certificates:read` y `email:send`.
   - `CERTIFICATES_WEB_URL`, base pública para el QR.

Mientras `CERTIFICATES_API_URL` esté vacío, Eventos sigue emitiendo y verificando de forma local, como hoy.

## 6. Orden de trabajo

1. **Decisión:** aprobar la Opción A (o pedir la B).
2. **Diseño:** el área de diseño entrega el fondo oficial sin datos y la tipografía.
3. **Certificados:** implementar la sección 4 en una rama, probar y desplegar en staging.
4. **Certificados:** crear la API key con los permisos de la sección 5.5 y entregarla por un canal privado.
5. **Eventos:** implementar la sección 5 y apuntar a Certificados en staging.
6. **Prueba de paridad del diseño** y prueba conjunta de punta a punta: emitir, verificar por QR, ver en el portal, recibir el correo y revocar.
7. Producción.

## 7. Decisiones pendientes

1. ¿Opción A (recomendada) u Opción B?
2. ¿Qué `documentType` lleva cada rol? Por ejemplo: asistentes → CONSTANCIA, ponentes y comité → CERTIFICADO.
3. ¿Cómo se forma el código impreso: lo genera Eventos (sección 5.4) o se usa el correlativo de Certificados (`PREFIJO-001`)? El correlativo exige un paso previo de reserva y complica el flujo.
4. ¿Quién del área de diseño valida la paridad?
