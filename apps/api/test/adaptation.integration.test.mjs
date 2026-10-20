import 'reflect-metadata';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../dist/database/prisma.service.js';
import { EventAccessService } from '../dist/common/event-access.service.js';
import { DirectoryService } from '../dist/modules/directory/directory.service.js';
import { AttendanceService } from '../dist/modules/attendance/attendance.service.js';
import { ParticipantsService } from '../dist/modules/participants/participants.service.js';
import { RolesService } from '../dist/modules/event-content/roles.service.js';
import { RegistrationFormsService } from '../dist/modules/registration-forms/registration-forms.service.js';
import { CertificatesService } from '../dist/modules/certificates/certificates.service.js';
import { buildServices } from './support.mjs';

// Never run this integration suite against a user database.
const url = new URL(process.env.DATABASE_URL || 'postgresql://invalid/invalid');
if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== '55432' || url.pathname !== '/events_test') throw new Error('Use only the isolated events_test database on localhost:55432');

const services = buildServices();
const { prisma, directory, access, attendance, participants, roles, certificates, forms } = services;
let organization, event, otherEvent, edition, otherEdition, manager, outsider, participant, assistantRole, committeeRole;
const person = { firstName: 'María', lastName: 'Pérez', email: 'maria@example.test', identityDocumentType: 'DNI', identityDocumentNumber: '12345678' };

before(async () => {
  await prisma.$connect();
  organization = await prisma.organization.create({ data: { name: 'IIAP prueba', slug: `test-${randomUUID()}` } });
  const owner = await prisma.authUser.create({ data: { email: `${randomUUID()}@example.test`, passwordHash: 'unused-test-hash' } });
  const ownerProfile = await prisma.profile.create({ data: { authUserId: owner.id, firstName: 'Organizador', lastName: 'Prueba' } });
  await prisma.organizationMember.create({ data: { organizationId: organization.id, profileId: ownerProfile.id, accountId: owner.id, role: 'OWNER' } });
  // Even a false claim in a caller must not override DB permissions.
  manager = { accountId: owner.id, role: 'USER' };
  const unauthorized = await prisma.authUser.create({ data: { email: `${randomUUID()}@example.test`, passwordHash: 'unused-test-hash' } });
  outsider = { accountId: unauthorized.id, role: 'SUPER_ADMIN' };
  event = await prisma.mainEvent.create({ data: { eventName: 'Congreso IIAP prueba', organizationId: organization.id, startDate: new Date(), status: 'PUBLISHED' } });
  otherEvent = await prisma.mainEvent.create({ data: { eventName: 'Otro evento', organizationId: organization.id, startDate: new Date(), status: 'PUBLISHED' } });
  edition = await prisma.edition.create({ data: { mainEventId: event.id, name: 'Edición prueba', isCurrent: true } });
  otherEdition = await prisma.edition.create({ data: { mainEventId: otherEvent.id, name: 'Otra edición' } });
});
after(async () => { await prisma.$disconnect(); });

test('migration preserves legacy check-in without inventing an actor', async () => {
  const record = await prisma.attendanceRecord.findUniqueOrThrow({ where: { participantId_scopeKey: { participantId: '00000000-0000-4000-8000-000000000005', scopeKey: 'EVENT' } } });
  assert.equal(record.valid, true);
  assert.equal(record.source, 'LEGACY_CHECK_IN');
  assert.equal(record.approvedBy, null);
  assert.equal(record.approvedAt, null);
  const profile = await prisma.profile.findUniqueOrThrow({ where: { id: '00000000-0000-4000-8000-000000000003' } });
  assert.equal(profile.primaryEmail, 'historico@example.test');
  assert.equal(await prisma.participantRoleAssignment.count({ where: { participantId: record.participantId } }), 1);
});

test('concurrent registration reuses one person and one enrollment', async () => {
  const results = await Promise.all(Array.from({ length: 4 }, () => participants.addManual(event.id, { ...person, editionId: edition.id }, manager)));
  assert.equal(new Set(results.map((row) => row.profileId)).size, 1);
  assert.equal(new Set(results.map((row) => row.id)).size, 1);
  participant = results[0];
  assert.equal(await prisma.profile.count({ where: { primaryEmail: person.email } }), 1);
  const next = await participants.addManual(otherEvent.id, { ...person, firstName: 'Maria', lastName: 'Perez' }, manager);
  assert.equal(next.profileId, participant.profileId);
  assert.equal(await prisma.participantRoleAssignment.count({ where: { participantId: participant.id } }), 1);
});

test('conflicting identity rolls back without changing the existing person', async () => {
  await assert.rejects(participants.addManual(event.id, { ...person, email: 'different@example.test' }, manager), /requieren revisión/);
  await assert.rejects(participants.addManual(event.id, { ...person, identityDocumentNumber: '87654321' }, manager), /requieren revisión/);
  assert.equal(await prisma.profile.count({ where: { primaryEmail: 'different@example.test' } }), 0);
  assert.equal((await prisma.profile.findUniqueOrThrow({ where: { id: participant.profileId } })).firstName, 'María');
});

test('custom role metadata survives reload and duplicate creation is serialized', async () => {
  assistantRole = await prisma.participantRole.findUniqueOrThrow({ where: { id: participant.roleId } });
  committeeRole = await roles.create({ mainEventId: event.id, name: 'comite_cientifico', displayName: 'Comité científico', displayNameEn: 'Scientific committee', certificateHours: 8, certificateText: 'Por su trabajo en el comité', requiresAttendance: false, badgeColor: '#123456', isSpeaker: false }, manager);
  const stored = await prisma.participantRole.findUniqueOrThrow({ where: { id: committeeRole.id } });
  assert.equal(stored.displayName, 'Comité científico');
  assert.equal(stored.certificateHours, 8);
  assert.equal(stored.requiresAttendance, false);
  const results = await Promise.allSettled([roles.create({ mainEventId: event.id, name: 'voluntario' }, manager), roles.create({ mainEventId: event.id, name: 'voluntario' }, manager)]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(await prisma.participantRole.count({ where: { mainEventId: event.id, name: 'voluntario' } }), 1);
});

test('multiple roles obey event, edition and activation boundaries', async () => {
  const updated = await participants.setRoles(participant.id, [assistantRole.id, committeeRole.id], manager);
  assert.equal(updated.roleAssignments.length, 2);
  const scoped = await roles.create({ mainEventId: otherEvent.id, editionId: otherEdition.id, name: 'moderador' }, manager);
  await assert.rejects(participants.setRoles(participant.id, [scoped.id], manager), /pertenecer/);
  await roles.update(committeeRole.id, { isActive: false }, manager);
  await assert.rejects(participants.setRoles(participant.id, [committeeRole.id], manager), /activos/);
  await roles.update(committeeRole.id, { isActive: true }, manager);
  await assert.rejects(roles.remove(committeeRole.id, manager), /asignado/);
});

test('unauthorized users cannot approve attendance or configure roles', async () => {
  await assert.rejects(attendance.approveBulk(event.id, { participantIds: [participant.id], valid: true }, outsider), /administrador/);
  await assert.rejects(roles.create({ mainEventId: event.id, name: 'unauthorized' }, outsider), /administrador/);
  await prisma.authUser.update({ where: { id: manager.accountId }, data: { isActive: false } });
  await assert.rejects(attendance.approveBulk(event.id, { participantIds: [participant.id], valid: true }, manager), /activa/);
  await prisma.authUser.update({ where: { id: manager.accountId }, data: { isActive: true } });
});

test('mixed-event batch fails atomically and retries preserve audit attribution', async () => {
  const foreign = await prisma.eventParticipant.findFirstOrThrow({ where: { editionId: otherEdition.id } });
  await assert.rejects(attendance.approveBulk(event.id, { participantIds: [participant.id, foreign.id], valid: true }, manager), /no pertenece/);
  assert.equal(await prisma.attendanceRecord.count({ where: { participantId: participant.id } }), 0);
  const result = await attendance.approveBulk(event.id, { participantIds: [participant.id], valid: true, note: 'Lista contrastada' }, manager);
  assert.equal(result.changed, 1);
  assert.equal((await attendance.approveBulk(event.id, { participantIds: [participant.id], valid: true }, manager)).changed, 0);
  const record = await prisma.attendanceRecord.findFirstOrThrow({ where: { participantId: participant.id }, include: { audits: true } });
  assert.equal(record.approvedBy, manager.accountId);
  assert.equal(record.note, 'Lista contrastada');
  assert.equal(record.audits.length, 1);
  assert.equal((await attendance.approveBulk(event.id, { participantIds: [participant.id], valid: false }, manager)).changed, 1);
  assert.equal(await prisma.attendanceAudit.count({ where: { recordId: record.id } }), 2);
});

test('session attendance cannot silently approve the whole event or another edition', async () => {
  const activity = await prisma.eventActivity.create({ data: { editionId: edition.id, title: 'Ponencia de prueba' } });
  const session = await prisma.eventSession.create({ data: { activityId: activity.id, title: 'Sesión de prueba' } });
  await attendance.approveBulk(event.id, { participantIds: [participant.id], sessionId: session.id, valid: true }, manager);
  assert.equal((await prisma.eventParticipant.findUniqueOrThrow({ where: { id: participant.id } })).checkedIn, false);
  assert.equal((await prisma.attendanceRecord.findUniqueOrThrow({ where: { participantId_scopeKey: { participantId: participant.id, scopeKey: session.id } } })).valid, true);
  const foreign = await prisma.eventParticipant.findFirstOrThrow({ where: { editionId: otherEdition.id } });
  await assert.rejects(attendance.approveBulk(otherEvent.id, { participantIds: [foreign.id], sessionId: session.id, valid: true }, manager), /sesión/);
});

test('historical attendance cannot be erased through participant or submission deletion', async () => {
  await assert.rejects(participants.remove(participant.id, manager), /historial/);
  const form = await forms.create(event.id, { title: 'Historial protegido', slug: `history-${randomUUID()}` });
  const submission = await prisma.registrationSubmission.create({ data: { formId: form.id, participantId: participant.id, answers: {}, email: 'history@example.test' } });
  await assert.rejects(forms.removeSubmission(submission.id, manager), /historial/);
  assert.ok(await prisma.registrationSubmission.findUnique({ where: { id: submission.id } }));
});

test('certificate rules and attendance reversals share a concurrency boundary', async () => {
  await assert.rejects(certificates.issue(participant.id, undefined, manager), /asistencia válida/);
  await attendance.approveBulk(event.id, { participantIds: [participant.id], valid: true }, manager);
  const issued = await Promise.all([certificates.issue(participant.id, undefined, manager), certificates.issue(participant.id, undefined, manager)]);
  assert.equal(issued[0].id, issued[1].id);
  await assert.rejects(attendance.approveBulk(event.id, { participantIds: [participant.id], valid: false }, manager), /Revoca/);
  await assert.rejects(participants.setRoles(participant.id, [committeeRole.id], manager), /Revoca/);
  await certificates.update(issued[0].id, { status: 'REVOKED' }, manager);
  await attendance.approveBulk(event.id, { participantIds: [participant.id], valid: false }, manager);
  await participants.setRoles(participant.id, [committeeRole.id], manager);
  assert.ok(await certificates.issue(participant.id, undefined, manager));
});

test('main form needs no speaker role; a possible duplicate opens a review without blocking', async () => {
  const form = await forms.create(otherEvent.id, { purpose: 'MAIN', title: 'Registro abierto', slug: `form-${randomUUID()}`, editionId: otherEdition.id, status: 'PUBLISHED' });
  const doubtful = await forms.submit(form.slug, { first_name: 'Otro', last_name: 'Nombre', email: person.email });
  assert.equal(doubtful.registration.needsReview, true);
  assert.notEqual(doubtful.profileId, participant.profileId);
  const review = await prisma.directoryReview.findFirstOrThrow({ where: { provisionalProfileId: doubtful.profileId } });
  assert.deepEqual(review.candidateProfileIds, [participant.profileId]);
  assert.equal((await prisma.profile.findUniqueOrThrow({ where: { id: participant.profileId } })).firstName, 'María');
  // El correo ya figura en el primer formulario: la persona real se inscribe por otro formulario principal.
  await prisma.registrationForm.update({ where: { id: form.id }, data: { status: 'ARCHIVED' } });
  const form2 = await forms.create(otherEvent.id, { purpose: 'MAIN', title: 'Registro abierto 2', slug: `form-${randomUUID()}`, editionId: otherEdition.id, status: 'PUBLISHED' });
  // El perfil provisional en revisión no impide reconocer a la persona real.
  const registered = await forms.submit(form2.slug, { first_name: 'María', last_name: 'Pérez', email: person.email, document_type: 'DNI', document_number: person.identityDocumentNumber });
  assert.equal(registered.profileId, participant.profileId);
  assert.equal(await prisma.eventParticipant.count({ where: { profileId: participant.profileId, editionId: otherEdition.id } }), 1);
  await assert.rejects(forms.submit(form2.slug, { first_name: 'A', last_name: 'B', email: 'new@example.test' }, edition.id), /no pertenece/);
});

test('concurrent submissions cannot exceed form capacity', async () => {
  const form = await forms.create(event.id, { title: 'Cupo único', slug: `capacity-${randomUUID()}`, status: 'PUBLISHED', maxSubmissions: 1, fields: [{ key: 'email', label: 'Correo', type: 'email', required: true }] });
  const outcomes = await Promise.allSettled([forms.submit(form.slug, { email: 'one@example.test' }), forms.submit(form.slug, { email: 'two@example.test' })]);
  assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1);
  assert.equal(await prisma.registrationSubmission.count({ where: { formId: form.id } }), 1);
});
