import 'reflect-metadata';
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { buildServices, fakeMail } from './support.mjs';
import { base32Decode, hotp } from '../dist/common/security/totp.js';
import { mergeIntervals } from '../dist/modules/attendance/attendance.service.js';
import { RetryableError, PermanentError } from '../dist/modules/integrations/http.js';

const mail = fakeMail();
const s = buildServices({ mail });
const { prisma } = s;
const unique = (prefix) => `${prefix}-${randomUUID().slice(0, 8)}@example.test`;
const totpNow = (secret, offsetSteps = 0) => hotp(base32Decode(secret), Math.floor(Date.now() / 30_000) + offsetSteps);

let organization, manager, outsider, event, edition;

before(async () => {
  await prisma.$connect();
  organization = await prisma.organization.create({ data: { name: 'IIAP fase 2', slug: `phase2-${randomUUID()}` } });
  const owner = await prisma.authUser.create({ data: { email: unique('owner'), passwordHash: 'unused', emailVerifiedAt: new Date() } });
  const ownerProfile = await prisma.profile.create({ data: { authUserId: owner.id, firstName: 'Org', lastName: 'Admin' } });
  await prisma.organizationMember.create({ data: { organizationId: organization.id, profileId: ownerProfile.id, accountId: owner.id, role: 'OWNER' } });
  manager = { accountId: owner.id, role: 'USER' };
  const stranger = await prisma.authUser.create({ data: { email: unique('stranger'), passwordHash: 'unused', emailVerifiedAt: new Date() } });
  outsider = { accountId: stranger.id, role: 'SUPER_ADMIN' };
  event = await prisma.mainEvent.create({ data: { eventName: 'Simposio fase 2', organizationId: organization.id, startDate: new Date(Date.now() + 7 * 86_400_000), status: 'PUBLISHED', eventMode: 'HYBRID', reminderOffsets: [60, 1440] } });
  edition = await prisma.edition.create({ data: { mainEventId: event.id, name: 'Edición 2026', isCurrent: true } });
});
after(async () => { await prisma.$disconnect(); });

describe('cuenta: registro, verificación por código y 2FA opcional', () => {
  const email = unique('cuenta');
  const password = 'ClaveSegura2026';
  let profileId;

  test('el registro exige verificar el correo y vincula a la persona del Directorio', async () => {
    // La persona ya existía en el Directorio por una inscripción sin cuenta.
    const existing = await prisma.$transaction((tx) => s.directory.resolve(tx, { firstName: 'Ana', lastName: 'Ríos', email }));
    profileId = existing.id;
    const registered = await s.auth.register({ email, password, firstName: 'Ana', lastName: 'Ríos' });
    assert.equal(registered.status, 'VERIFY_EMAIL');
    assert.ok(!('accessToken' in registered));
    await assert.rejects(s.auth.verifyEmail(registered.pendingToken, '000000'), /incorrecto|expiró/);
    const verified = await s.auth.verifyEmail(registered.pendingToken, mail.lastCode(email));
    assert.equal(verified.status, 'OK');
    assert.ok(verified.accessToken);
    const account = await prisma.authUser.findUniqueOrThrow({ where: { email }, include: { profile: true } });
    assert.ok(account.emailVerifiedAt);
    assert.equal(account.profile.id, profileId, 'reutiliza la persona, no la duplica');
    assert.equal(account.role, 'USER', 'autenticar no autoriza');
  });

  test('un código se invalida tras 5 intentos fallidos', async () => {
    const other = unique('bloqueo');
    const registered = await s.auth.register({ email: other, password, firstName: 'Luis', lastName: 'Vela' });
    for (let attempt = 0; attempt < 5; attempt++) await assert.rejects(s.auth.verifyEmail(registered.pendingToken, '111111'));
    await assert.rejects(s.auth.verifyEmail(registered.pendingToken, mail.lastCode(other)), /Demasiados intentos/);
  });

  test('2FA por correo: el acceso pide el código y un código de recuperación sirve una sola vez', async () => {
    const account = await prisma.authUser.findUniqueOrThrow({ where: { email } });
    await prisma.verificationCode.updateMany({ where: { accountId: account.id }, data: { createdAt: new Date(Date.now() - 60_000) } });
    await s.auth.beginEmailTwoFactorSetup(account.id);
    const enabled = await s.auth.enableEmailTwoFactor(account.id, mail.lastCode(email));
    assert.equal(enabled.recoveryCodes.length, 8);
    const login = await s.auth.login(email, password);
    assert.equal(login.status, 'MFA_REQUIRED');
    assert.equal(login.method, 'EMAIL');
    const done = await s.auth.completeTwoFactor(login.pendingToken, mail.lastCode(email));
    assert.equal(done.status, 'OK');
    await prisma.verificationCode.updateMany({ where: { accountId: account.id }, data: { createdAt: new Date(Date.now() - 60_000) } });
    const again = await s.auth.login(email, password);
    assert.equal((await s.auth.completeTwoFactor(again.pendingToken, enabled.recoveryCodes[0])).status, 'OK');
    const third = await s.auth.login(email, password);
    await assert.rejects(s.auth.completeTwoFactor(third.pendingToken, enabled.recoveryCodes[0]), /incorrecto/);
    await s.auth.disableTwoFactor(account.id, password);
    assert.equal((await s.auth.login(email, password)).status, 'OK');
  });

  test('2FA con app autenticadora: el mismo código no se reutiliza y cambiar el 2FA cierra sesiones anteriores', async () => {
    const account = await prisma.authUser.findUniqueOrThrow({ where: { email } });
    const before = await s.auth.login(email, password);
    const setup = await s.auth.beginTotpSetup(account.id);
    assert.match(setup.otpauthUri, /^otpauth:\/\/totp\//);
    await assert.rejects(s.auth.enableTotp(account.id, '000000'), /incorrecto/);
    await s.auth.enableTotp(account.id, totpNow(setup.secret, -1));
    await assert.rejects(s.auth.refreshSession(before.refreshToken), /cerrada/);
    const login = await s.auth.login(email, password);
    assert.equal(login.method, 'TOTP');
    const code = totpNow(setup.secret);
    assert.equal((await s.auth.completeTwoFactor(login.pendingToken, code)).status, 'OK');
    const replay = await s.auth.login(email, password);
    await assert.rejects(s.auth.completeTwoFactor(replay.pendingToken, code), /incorrecto/);
    const stored = await prisma.authUser.findUniqueOrThrow({ where: { id: account.id } });
    assert.ok(!stored.totpSecretEnc.includes(setup.secret), 'el secreto se guarda cifrado');
  });

  test('el token de paso pendiente no abre la API ni sirve para otro paso', async () => {
    const other = unique('pendiente');
    const registered = await s.auth.register({ email: other, password, firstName: 'Eva', lastName: 'Soto' });
    await assert.rejects(s.auth.completeTwoFactor(registered.pendingToken, '123456'), /no corresponde/);
  });
});

describe('inscripción: aforo, lista de espera, token y revisión de duplicados', () => {
  test('el aforo lleno envía a lista de espera y una cancelación promueve por orden de llegada', async () => {
    const small = await prisma.mainEvent.create({ data: { eventName: 'Taller con aforo', organizationId: organization.id, startDate: new Date(Date.now() + 86_400_000), capacity: 1, waitlistEnabled: true, status: 'PUBLISHED' } });
    await prisma.edition.create({ data: { mainEventId: small.id, name: 'Única', isCurrent: true } });
    const register = (name) => prisma.$transaction((tx) => s.registrations.register(tx, { eventId: small.id, origin: 'FORM', reviewConflicts: true, person: { firstName: name, lastName: 'Prueba', email: unique(name.toLowerCase()) } }));
    const [first, second, third] = await Promise.all([register('Uno'), register('Dos'), register('Tres')]);
    const statuses = [first, second, third].map((item) => item.participant.status).sort();
    assert.deepEqual(statuses, ['CONFIRMED', 'WAITLISTED', 'WAITLISTED']);
    const confirmed = [first, second, third].find((item) => item.participant.status === 'CONFIRMED');
    const waiting = [first, second, third].filter((item) => item.participant.status === 'WAITLISTED').sort((a, b) => a.participant.registeredAt - b.participant.registeredAt);
    await s.registrations.cancel(confirmed.participant.id);
    assert.equal((await prisma.eventParticipant.findUniqueOrThrow({ where: { id: waiting[0].participant.id } })).status, 'CONFIRMED');
    assert.equal((await prisma.eventParticipant.findUniqueOrThrow({ where: { id: waiting[1].participant.id } })).status, 'WAITLISTED');
    assert.equal(await prisma.notification.count({ where: { participantId: waiting[0].participant.id, type: 'WAITLIST_PROMOTED' } }), 1);
  });

  test('sin lista de espera, el aforo lleno rechaza; el alta del organizador no cuenta contra el aforo', async () => {
    const closed = await prisma.mainEvent.create({ data: { eventName: 'Cupo cerrado', organizationId: organization.id, startDate: new Date(), capacity: 1, status: 'PUBLISHED' } });
    await prisma.edition.create({ data: { mainEventId: closed.id, name: 'Única', isCurrent: true } });
    await prisma.$transaction((tx) => s.registrations.register(tx, { eventId: closed.id, origin: 'FORM', person: { firstName: 'A', lastName: 'B', email: unique('a') } }));
    await assert.rejects(prisma.$transaction((tx) => s.registrations.register(tx, { eventId: closed.id, origin: 'FORM', person: { firstName: 'C', lastName: 'D', email: unique('c') } })), /aforo/);
    const manual = await s.participants.addManual(closed.id, { firstName: 'E', lastName: 'F', email: unique('e') }, manager);
    assert.equal(manual.status, 'CONFIRMED');
    assert.equal(manual.origin, 'MANUAL');
  });

  test('la página personal por token muestra solo datos propios y permite darse de baja', async () => {
    const { participant } = await prisma.$transaction((tx) => s.registrations.register(tx, { eventId: event.id, origin: 'FORM', person: { firstName: 'Rosa', lastName: 'Mena', email: unique('rosa'), identityDocumentType: 'DNI', identityDocumentNumber: '44556677' } }));
    const view = await s.registrations.publicView(participant.accessToken);
    assert.equal(view.registration.status, 'CONFIRMED');
    assert.match(view.person.email, /•/);
    assert.ok(!JSON.stringify(view).includes('44556677'), 'no expone el documento');
    const prefs = await s.registrations.updatePreferences(participant.accessToken, { remindersEnabled: false, channel: 'TELEGRAM' });
    assert.equal(prefs.remindersEnabled, false);
    assert.equal(prefs.channel, 'EMAIL', 'Telegram solo tras enlazar el bot');
    await assert.rejects(s.registrations.publicView('no-es-un-token'), /no encontrada/);
  });

  test('una revisión de duplicado se fusiona moviendo la inscripción a la persona real', async () => {
    const email = unique('dup');
    const real = await prisma.$transaction((tx) => s.directory.resolve(tx, { firstName: 'Julia', lastName: 'Paz', email, identityDocumentType: 'DNI', identityDocumentNumber: '11112222', organizationId: organization.id }));
    const same = await prisma.$transaction((tx) => s.registrations.register(tx, { eventId: event.id, origin: 'FORM', reviewConflicts: true, person: { firstName: 'Julia', lastName: 'Paz', email, identityDocumentType: 'DNI', identityDocumentNumber: '11112222' } }));
    assert.equal(same.profile.id, real.id);
    assert.equal(same.review, null);
    const conflict = await prisma.$transaction((tx) => s.registrations.register(tx, { eventId: event.id, origin: 'FORM', reviewConflicts: true, person: { firstName: 'Juliana', lastName: 'Paz', email: unique('otro'), identityDocumentType: 'DNI', identityDocumentNumber: '11112222' } }));
    assert.ok(conflict.review, 'documento igual con otro nombre abre revisión');
    await assert.rejects(s.reviews.list(organization.id, 'OPEN', outsider), /No tienes|administrador/);
    const open = await s.reviews.list(organization.id, 'OPEN', manager);
    assert.ok(open.some((item) => item.id === conflict.review.id));
    const blocked = await s.reviews.resolve(conflict.review.id, { action: 'MERGE', targetProfileId: conflict.review.candidateProfileIds[0] }, manager).catch((error) => error);
    // Ambas personas están inscritas en la misma edición: la fusión se detiene para decidir a mano.
    assert.match(String(blocked?.message ?? ''), /misma edición/);
    await s.reviews.resolve(conflict.review.id, { action: 'KEEP_SEPARATE' }, manager);
    assert.equal((await prisma.directoryReview.findUniqueOrThrow({ where: { id: conflict.review.id } })).resolution, 'KEEP_SEPARATE');
  });
});

describe('asistencia virtual automática (Zoom) y presencial', () => {
  let session, participantA, participantB, manualParticipant;

  before(async () => {
    const activity = await prisma.eventActivity.create({ data: { editionId: edition.id, title: 'Bloque virtual' } });
    const start = new Date('2026-10-20T14:00:00Z');
    session = await prisma.eventSession.create({ data: { activityId: activity.id, title: 'Ponencia Zoom', startsAt: start, endsAt: new Date(start.getTime() + 100 * 60_000), modality: 'ONLINE' } });
    await prisma.sessionIntegration.create({ data: { sessionId: session.id, zoomMeetingId: '987654321', zoomStatus: 'SYNCED' } });
    await prisma.mainEvent.update({ where: { id: event.id }, data: { virtualAttendanceMode: 'AUTOMATIC', attendanceThreshold: 0.8 } });
    const reg = (name) => prisma.$transaction((tx) => s.registrations.register(tx, { eventId: event.id, origin: 'FORM', person: { firstName: name, lastName: 'Zoom', email: `${name.toLowerCase()}-${session.id.slice(0, 6)}@example.test` } }));
    participantA = (await reg('Alfa')).participant;
    participantB = (await reg('Beta')).participant;
    manualParticipant = (await reg('Gama')).participant;
    await prisma.sessionRegistration.create({ data: { participantId: participantA.id, sessionId: session.id, registrantId: 'reg-alfa', joinUrl: 'https://zoom.example/alfa', status: 'SYNCED' } });
    await s.attendance.approveBulk(event.id, { participantIds: [manualParticipant.id], sessionId: session.id, valid: true, note: 'Visto en pantalla' }, manager);
  });

  test('los tramos superpuestos no suman doble', () => {
    const t = (minute) => new Date(Date.UTC(2026, 0, 1, 0, minute));
    const { minutes, merged } = mergeIntervals([{ joinedAt: t(0), leftAt: t(30) }, { joinedAt: t(20), leftAt: t(50) }, { joinedAt: t(60), leftAt: t(70) }]);
    assert.equal(minutes, 60);
    assert.equal(merged.length, 2);
  });

  test('el reporte aplica el umbral, respeta decisiones manuales y crea el registro abierto', async () => {
    const at = (minute) => new Date(session.startsAt.getTime() + minute * 60_000).toISOString();
    const report = [
      // Alfa: reconexión con solapamiento → 85 min de 100 → válida.
      { registrant_id: 'reg-alfa', user_email: '', name: 'Alfa', join_time: at(0), leave_time: at(50) },
      { registrant_id: 'reg-alfa', user_email: '', name: 'Alfa', join_time: at(40), leave_time: at(85) },
      // Beta por correo: 30 min → no válida.
      { user_email: `beta-${session.id.slice(0, 6)}@example.test`, name: 'Beta', join_time: at(0), leave_time: at(30) },
      // Gama: el reporte dice 5 min, pero el organizador ya la aprobó.
      { user_email: `gama-${session.id.slice(0, 6)}@example.test`, name: 'Gama', join_time: at(0), leave_time: at(5) },
      // Persona sin inscripción.
      { user_email: `abierto-${session.id.slice(0, 6)}@example.test`, name: 'Delia Abierta', join_time: at(0), leave_time: at(95) },
    ];
    const loaded = await s.sync.load(session.id);
    const result = await s.sync.applyZoomReport(loaded, report, 100);
    assert.equal(result.createdFromOpenRegistration, 1);
    assert.equal(result.keptManualDecisions, 1);
    const record = (participantId) => prisma.attendanceRecord.findUniqueOrThrow({ where: { participantId_scopeKey: { participantId, scopeKey: session.id } } });
    const alfa = await record(participantA.id);
    assert.equal(alfa.minutes, 85);
    assert.equal(alfa.valid, true);
    assert.equal(alfa.method, 'ZOOM');
    assert.equal((await record(participantB.id)).valid, false);
    const gama = await record(manualParticipant.id);
    assert.equal(gama.valid, true);
    assert.equal(gama.method, 'MANUAL');
    const open = await prisma.eventParticipant.findFirstOrThrow({ where: { editionId: edition.id, origin: 'OPEN_REGISTRATION' } });
    assert.equal((await record(open.id)).valid, true);
    // Repetir la importación no duplica marcas ni tramos.
    await s.sync.applyZoomReport(loaded, report, 100);
    assert.equal(await prisma.attendanceInterval.count({ where: { record: { participantId: participantA.id } } }), 1);
    assert.equal(await prisma.eventParticipant.count({ where: { editionId: edition.id, origin: 'OPEN_REGISTRATION' } }), 1);
  });

  test('una marca QR de una persona nueva la crea Eventos con origen presencial y cruza por documento', async () => {
    const loaded = await s.sync.load(session.id);
    const id1 = await s.sync.recordAttendee(loaded, { id: 'att-1', user_name: 'Pedro Sede', user_email: 'pedro-sede@example.test', document_number: '99887766' });
    const id2 = await s.sync.recordAttendee(loaded, { id: 'att-1', user_name: 'Pedro Sede', user_email: 'otro@example.test', document_number: '99887766' });
    assert.equal(id1, id2);
    assert.equal((await prisma.eventParticipant.findUniqueOrThrow({ where: { id: id1 } })).origin, 'ONSITE');
  });
});

describe('certificados por rol', () => {
  let attendee, organizer, assistantRole, organizerRole;

  before(async () => {
    assistantRole = await prisma.participantRole.create({ data: { mainEventId: event.id, name: `asistente_${randomUUID().slice(0, 4)}`, displayName: 'Asistente', certificateHours: 4, requiresAttendance: true } });
    organizerRole = await prisma.participantRole.create({ data: { mainEventId: event.id, name: `organizador_${randomUUID().slice(0, 4)}`, displayName: 'Organizador', certificateHours: 10, requiresAttendance: false } });
    attendee = (await prisma.$transaction((tx) => s.registrations.register(tx, { eventId: event.id, origin: 'MANUAL', roleId: assistantRole.id, person: { firstName: 'Carla', lastName: 'Cert', email: unique('carla'), identityDocumentType: 'DNI', identityDocumentNumber: '12121212' } }))).participant;
    organizer = (await prisma.$transaction((tx) => s.registrations.register(tx, { eventId: event.id, origin: 'MANUAL', roleId: organizerRole.id, person: { firstName: 'Oscar', lastName: 'Org', email: unique('oscar') } }))).participant;
    await prisma.participantRoleAssignment.create({ data: { participantId: organizer.id, roleId: assistantRole.id } });
  });

  test('cada rol aplica su condición y repetir la emisión no duplica', async () => {
    const first = await s.certificates.issueBulk(event.id, { participantIds: [attendee.id, organizer.id], roleIds: [assistantRole.id, organizerRole.id] }, manager);
    assert.equal(first.issued, 1, 'solo el rol de organizador, sin requisito de asistencia');
    assert.equal(first.certificates[0].hours, 10);
    assert.ok(first.skipped.some((item) => item.participantId === attendee.id && /asistencia/.test(item.reason)));
    const again = await s.certificates.issueBulk(event.id, { participantIds: [organizer.id], roleIds: [organizerRole.id] }, manager);
    assert.equal(again.issued, 0);
    assert.match(again.skipped[0].reason, /vigente/);
    await assert.rejects(s.certificates.issueBulk(event.id, {}, outsider), /administrador/);
  });

  test('la aprobación directa exige motivo y habilita el certificado sin asistencia', async () => {
    await assert.rejects(s.certificates.directApproval(event.id, { participantIds: [attendee.id], roleId: assistantRole.id, approved: true }, manager), /motivo/);
    await s.certificates.directApproval(event.id, { participantIds: [attendee.id], roleId: assistantRole.id, approved: true, reason: 'Moderó una mesa sin control de permanencia' }, manager);
    const result = await s.certificates.issueBulk(event.id, { participantIds: [attendee.id], roleIds: [assistantRole.id] }, manager);
    assert.equal(result.issued, 1);
    const verified = await s.certificates.verify(result.certificates[0].code);
    assert.ok(!JSON.stringify(verified).includes('12121212'), 'la verificación pública no expone el documento');
    assert.equal(await prisma.notification.count({ where: { participantId: attendee.id, type: 'CERTIFICATE' } }), 1);
  });

  test('la reemisión conserva la versión anterior y la revocación guarda motivo', async () => {
    const current = await prisma.participantCertificate.findFirstOrThrow({ where: { participantId: attendee.id, status: 'ISSUED' } });
    const next = await s.certificates.reissue(current.id, 'Nombre corregido', manager);
    assert.equal(next.version, current.version + 1);
    assert.equal((await prisma.participantCertificate.findUniqueOrThrow({ where: { id: current.id } })).status, 'SUPERSEDED');
    const revoked = await s.certificates.revoke(next.id, 'Emitido por error', manager);
    assert.equal(revoked.revokedReason, 'Emitido por error');
    await assert.rejects(s.certificates.verify(`CERT-NO-EXISTE-${randomUUID()}`), /no encontrado/);
  });

  test('con el sistema de Certificados configurado, un fallo transitorio se reintenta y luego emite una sola vez', async () => {
    let calls = 0;
    const flaky = { configured: true, issue: async (request) => { calls++; if (calls === 1) throw new RetryableError('Certificados respondió 503'); return { id: `ext-${request.idempotencyKey}`, code: `EXT-${randomUUID().slice(0, 8)}`, status: 'ISSUED', verifyUrl: 'https://certificados.example/v/1' }; } };
    const local = buildServices({ certificatesClient: flaky, mail });
    const role = await prisma.participantRole.create({ data: { mainEventId: event.id, name: `ponente_${randomUUID().slice(0, 4)}`, requiresAttendance: false, certificateHours: 2 } });
    await prisma.participantRoleAssignment.create({ data: { participantId: organizer.id, roleId: role.id } });
    const issued = await local.certificates.issueBulk(event.id, { participantIds: [organizer.id], roleIds: [role.id] }, manager);
    assert.equal(issued.pending, 1);
    const id = issued.certificates[0].id;
    await local.jobs.processDue();
    assert.equal((await prisma.participantCertificate.findUniqueOrThrow({ where: { id } })).status, 'PENDING');
    await prisma.integrationJob.updateMany({ where: { dedupeKey: `certificate-issue:${id}` }, data: { runAt: new Date() } });
    await local.jobs.processDue();
    const done = await prisma.participantCertificate.findUniqueOrThrow({ where: { id } });
    assert.equal(done.status, 'ISSUED');
    assert.equal(done.externalId, `ext-${done.idempotencyKey}`);
    assert.equal(calls, 2);
    await local.prisma.$disconnect();
  });
});

describe('notificaciones', () => {
  test('confirmación y recordatorios son idempotentes y la baja omite recordatorios', async () => {
    const { participant } = await prisma.$transaction((tx) => s.registrations.register(tx, { eventId: event.id, origin: 'FORM', person: { firstName: 'Nora', lastName: 'Aviso', email: unique('nora') } }));
    const first = await s.notifications.scheduleForParticipant(participant.id);
    const second = await s.notifications.scheduleForParticipant(participant.id);
    assert.ok(first.scheduled >= 1);
    assert.equal(second.scheduled, 0);
    await prisma.notification.updateMany({ where: { participantId: participant.id }, data: { scheduledFor: new Date(Date.now() - 1000) } });
    await s.notifications.updatePreference(participant.profileId, { remindersEnabled: false });
    await s.notifications.dispatchDue(500);
    const rows = await prisma.notification.findMany({ where: { participantId: participant.id } });
    assert.equal(rows.find((row) => row.type === 'CONFIRMATION').status, 'SENT');
    assert.ok(rows.filter((row) => row.type === 'REMINDER').every((row) => row.status === 'SKIPPED'));
  });
});

describe('materiales y documentos', () => {
  const pdf = Buffer.from('%PDF-1.4\n% prueba\n');
  const file = (buffer, name) => ({ buffer, originalname: name, size: buffer.length, mimetype: 'application/pdf' });
  let session, speakerAccount;

  before(async () => {
    const activity = await prisma.eventActivity.create({ data: { editionId: edition.id, title: 'Bloque materiales' } });
    session = await prisma.eventSession.create({ data: { activityId: activity.id, title: 'Ponencia con material' } });
    const account = await prisma.authUser.create({ data: { email: unique('ponente'), passwordHash: 'unused', emailVerifiedAt: new Date() } });
    const profile = await prisma.profile.create({ data: { authUserId: account.id, firstName: 'Paula', lastName: 'Ponente' } });
    await prisma.sessionSpeaker.create({ data: { sessionId: session.id, profileId: profile.id } });
    speakerAccount = { accountId: account.id, role: 'USER' };
  });

  test('el expositor sube su material, reemplazarlo versiona y la descarga es firmada y temporal', async () => {
    const created = await s.files.upload(event.id, file(pdf, 'presentacion.pdf'), { scope: 'MATERIAL', title: 'Diapositivas', sessionId: session.id, visibility: 'REGISTERED' }, speakerAccount);
    assert.ok(created.sessionSpeakerId, 'queda vinculado al expositor dueño');
    const replaced = await s.files.replace(created.id, file(Buffer.from('%PDF-1.7\nv2'), 'presentacion-v2.pdf'), speakerAccount);
    assert.equal(replaced.currentVersion, 2);
    assert.equal(replaced.versions.length, 2);
    await assert.rejects(s.files.upload(event.id, file(Buffer.from('MZ ejecutable'), 'virus.pdf'), { scope: 'MATERIAL', title: 'x', sessionId: session.id }, speakerAccount), /no coincide/);
    await assert.rejects(s.files.update(created.id, { visibility: 'PUBLIC' }, outsider), /expositor|administrador|edición/);
    const link = await s.files.downloadForActor(created.id, speakerAccount);
    const token = link.url.split('/files/')[1];
    const served = await s.files.resolveDownload(token);
    assert.equal(served.fileName, 'presentacion-v2.pdf');
    assert.equal(s.signer.verify(token.replace(/.$/, (c) => (c === 'a' ? 'b' : 'a'))), null, 'firma manipulada');
    assert.equal((await s.files.visibleFiles(event.id, 'PUBLIC')).some((item) => item.id === created.id), false);
    assert.equal((await s.files.visibleFiles(event.id, 'REGISTERED')).some((item) => item.id === created.id), true);
  });

  test('un documento del evento lo sube solo el equipo organizador', async () => {
    await assert.rejects(s.files.upload(event.id, file(pdf, 'acta.pdf'), { scope: 'DOCUMENT', title: 'Acta', documentType: 'ACTA' }, speakerAccount), /edición|administrador/);
    const acta = await s.files.upload(event.id, file(pdf, 'acta.pdf'), { scope: 'DOCUMENT', title: 'Acta de acuerdos', documentType: 'ACTA', visibility: 'PRIVATE' }, manager);
    await s.files.update(acta.id, { status: 'DELETED' }, manager);
    assert.equal((await prisma.eventFileVersion.count({ where: { fileId: acta.id } })), 1, 'el borrado es lógico');
  });
});

describe('cola de integraciones', () => {
  test('deduplica, reintenta con espera y marca fallos permanentes', async () => {
    let calls = 0;
    s.jobs.register('TEST_FLAKY', async () => { calls++; throw new RetryableError('temporal', 120_000); });
    s.jobs.register('TEST_BROKEN', async () => { throw new PermanentError('credenciales inválidas'); });
    const key = `test-${randomUUID()}`;
    const a = await s.jobs.enqueue('TEST_FLAKY', { n: 1 }, { dedupeKey: key });
    const b = await s.jobs.enqueue('TEST_FLAKY', { n: 2 }, { dedupeKey: key });
    assert.equal(a.id, b.id);
    const broken = await s.jobs.enqueue('TEST_BROKEN', {});
    await s.jobs.processDue(100);
    const flaky = await prisma.integrationJob.findUniqueOrThrow({ where: { id: a.id } });
    assert.equal(flaky.status, 'QUEUED');
    assert.ok(flaky.runAt.getTime() - Date.now() > 100_000, 'respeta Retry-After');
    assert.equal((await prisma.integrationJob.findUniqueOrThrow({ where: { id: broken.id } })).status, 'FAILED');
    assert.equal(calls, 1);
  });
});

describe('permisos', () => {
  test('quien no pertenece a la organización no ve inscripciones ni integraciones', async () => {
    await assert.rejects(s.participants.list(edition.id, outsider), /acceso|administrador/);
    await assert.rejects(s.registrations.listForEvent(event.id, outsider), /acceso/);
    const list = await s.registrations.listForEvent(event.id, manager);
    assert.ok(list.length > 0);
  });
});
