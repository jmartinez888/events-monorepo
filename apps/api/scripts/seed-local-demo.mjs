// Datos de demostración para recorrer el sistema en local como superadministrador,
// administrador de la organización, editor, ponente y público.
// Uso (desde apps/api): node --env-file-if-exists=../../.env scripts/seed-local-demo.mjs
// Es idempotente: volver a ejecutarlo no duplica datos.
import { createRequire } from 'node:module';

const url = new URL(process.env.DATABASE_URL || 'postgresql://invalid/invalid');
if (!['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('La semilla de demostración solo se ejecuta contra una base local');

const require = createRequire(new URL('../package.json', import.meta.url));
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const db = new PrismaClient();
const PASSWORD = 'IIAPdemo2026!';
const passwordHash = await bcrypt.hash(PASSWORD, 10);
const at = (iso) => new Date(iso);

async function account(email, role, firstName, lastName) {
  const user = await db.authUser.upsert({ where: { email }, create: { email, passwordHash, role, emailVerifiedAt: new Date() }, update: { passwordHash, role, emailVerifiedAt: new Date(), isActive: true } });
  const profile = await db.profile.upsert({ where: { authUserId: user.id }, create: { authUserId: user.id, firstName, lastName, primaryEmail: email, additionalEmails: [email], phone: '965000000' }, update: { firstName, lastName } });
  return { user, profile };
}

const superadmin = await account('superadmin@iiap.test', 'SUPER_ADMIN', 'Super', 'Administrador');
const admin = await account('admin@iiap.test', 'USER', 'Carmen', 'Rojas');
const editor = await account('editor@iiap.test', 'USER', 'Diego', 'Huamán');
const speaker = await account('ponente@iiap.test', 'USER', 'Lucía', 'Panduro');
await db.profile.update({ where: { id: speaker.profile.id }, data: { bio: 'Investigadora en ecología de bosques inundables del IIAP.', institution: 'IIAP' } });

const org = await db.organization.upsert({
  where: { slug: 'iiap' },
  create: { slug: 'iiap', name: 'Instituto de Investigaciones de la Amazonía Peruana', description: 'Eventos científicos y de divulgación del IIAP.', organizationType: 'IIAP' },
  update: {},
});
await db.organizationPortal.upsert({ where: { organizationId: org.id }, create: { organizationId: org.id, heroTitle: 'Eventos del IIAP', heroDescription: 'Simposios, talleres y conferencias sobre la Amazonía peruana.' }, update: {} });
for (const [member, role] of [[admin, 'OWNER'], [editor, 'EDITOR']]) {
  await db.organizationMember.upsert({ where: { organizationId_profileId: { organizationId: org.id, profileId: member.profile.id } }, create: { organizationId: org.id, profileId: member.profile.id, accountId: member.user.id, role }, update: { role, accountId: member.user.id } });
  await db.profile.update({ where: { id: member.profile.id }, data: { organizationId: org.id } });
}

async function event(data, sessions, roles, form) {
  let item = await db.mainEvent.findFirst({ where: { organizationId: org.id, eventName: data.eventName } });
  if (!item) item = await db.mainEvent.create({ data: { ...data, organizationId: org.id, status: 'PUBLISHED' } });
  let edition = await db.edition.findFirst({ where: { mainEventId: item.id } });
  if (!edition) edition = await db.edition.create({ data: { mainEventId: item.id, name: 'Edición 2026', isCurrent: true, startDate: data.startDate, endDate: data.endDate, modality: data.eventMode, location: data.venueAddress } });
  let activity = await db.eventActivity.findFirst({ where: { editionId: edition.id } });
  if (!activity) activity = await db.eventActivity.create({ data: { editionId: edition.id, title: 'Programa', startsAt: data.startDate, endsAt: data.endDate } });
  const created = [];
  for (const [title, startsAt, endsAt, modality, description] of sessions) {
    created.push(await db.eventSession.findFirst({ where: { activityId: activity.id, title } }) ?? await db.eventSession.create({ data: { activityId: activity.id, title, description, startsAt: at(startsAt), endsAt: at(endsAt), modality } }));
  }
  const roleIds = {};
  for (const [name, displayName, requiresAttendance, isSpeaker, certificateHours, certificateText] of roles) {
    const role = await db.participantRole.findFirst({ where: { mainEventId: item.id, editionId: null, name } }) ?? await db.participantRole.create({ data: { mainEventId: item.id, name, displayName, requiresAttendance, isSpeaker, certificateHours, certificateText } });
    roleIds[name] = role.id;
  }
  if (!await db.registrationForm.findUnique({ where: { slug: form.slug } })) {
    await db.registrationForm.create({
      data: {
        mainEventId: item.id, editionId: edition.id, slug: form.slug, title: form.title, status: 'PUBLISHED', purpose: 'MAIN', approvalMode: 'AUTOMATIC',
        thankYouMessage: 'Tu inscripción fue registrada. Revisa tu correo: ahí está tu enlace personal.',
        fields: { create: [
          { key: 'header_title', label: form.title, type: 'header', required: false, options: { text: form.title }, position: 0 },
          { key: 'first_name', label: 'Nombres', type: 'text', required: true, position: 1 },
          { key: 'last_name', label: 'Apellidos', type: 'text', required: true, position: 2 },
          { key: 'email', label: 'Correo Electrónico', type: 'email', required: true, position: 3 },
          { key: 'document_type', label: 'Identificación', type: 'select', required: false, options: ['Ninguno', 'DNI', 'CE', 'Otros'], position: 4 },
          { key: 'document_number', label: 'Número de identificación', type: 'text', required: false, position: 5 },
        ] },
      },
    });
  }
  return { item, edition, sessions: created, roleIds };
}

const simposio = await event(
  { eventName: 'Simposio Amazónico de Investigación 2026', description: 'Encuentro científico sobre bosques inundables, pesquerías y biodiversidad amazónica.', eventMode: 'HYBRID', startDate: at('2026-11-12T14:00:00Z'), endDate: at('2026-11-12T23:00:00Z'), venueAddress: 'IIAP Sede Central, Av. José A. Quiñones km 2.5, Iquitos', contactEmail: 'eventos@iiap.test', capacity: 100, waitlistEnabled: true, reminderOffsets: [1440, 60] },
  [
    ['Conferencia inaugural: bosques inundables', '2026-11-12T14:00:00Z', '2026-11-12T15:30:00Z', 'HYBRID', 'Dinámica de los bosques de várzea e igapó.'],
    ['Mesa de trabajo: pesquerías sostenibles', '2026-11-12T16:00:00Z', '2026-11-12T17:30:00Z', 'PHYSICAL', 'Experiencias de manejo pesquero comunitario.'],
    ['Taller virtual: datos abiertos de biodiversidad', '2026-11-12T19:00:00Z', '2026-11-12T20:30:00Z', 'ONLINE', 'Uso de repositorios abiertos para investigación.'],
  ],
  [
    ['participant', 'Asistente', true, false, 8, 'Por su participación como asistente'],
    ['expositor', 'Expositor', false, true, 4, 'Por su exposición'],
    ['comite_organizador', 'Comité organizador', false, false, 10, 'Por su labor en el comité organizador'],
  ],
  { slug: 'simposio-amazonico-2026', title: 'Inscripción al Simposio Amazónico 2026' },
);

await event(
  { eventName: 'Taller de bioinformática amazónica', description: 'Taller práctico virtual con cupos limitados.', eventMode: 'ONLINE', startDate: at('2026-11-20T15:00:00Z'), endDate: at('2026-11-20T18:00:00Z'), capacity: 2, waitlistEnabled: true, reminderOffsets: [60] },
  [['Sesión práctica', '2026-11-20T15:00:00Z', '2026-11-20T18:00:00Z', 'ONLINE', 'Análisis de secuencias con herramientas abiertas.']],
  [['participant', 'Asistente', true, false, 3, 'Por su participación en el taller']],
  { slug: 'taller-bioinformatica', title: 'Inscripción al Taller de bioinformática' },
);

// La ponente: inscrita con rol de expositor y asignada a la conferencia inaugural.
const speakerParticipant = await db.eventParticipant.upsert({
  where: { editionId_profileId: { editionId: simposio.edition.id, profileId: speaker.profile.id } },
  create: { editionId: simposio.edition.id, profileId: speaker.profile.id, roleId: simposio.roleIds.expositor, origin: 'SPEAKER', confirmedAt: new Date() },
  update: {},
});
await db.participantRoleAssignment.upsert({ where: { participantId_roleId: { participantId: speakerParticipant.id, roleId: simposio.roleIds.expositor } }, create: { participantId: speakerParticipant.id, roleId: simposio.roleIds.expositor }, update: {} });
await db.sessionSpeaker.upsert({ where: { sessionId_profileId: { sessionId: simposio.sessions[0].id, profileId: speaker.profile.id } }, create: { sessionId: simposio.sessions[0].id, profileId: speaker.profile.id, role: 'SPEAKER', topic: 'Bosques inundables y cambio climático' }, update: {} });

// La administradora también integra el comité organizador (certificado sin requisito de asistencia).
const adminParticipant = await db.eventParticipant.upsert({
  where: { editionId_profileId: { editionId: simposio.edition.id, profileId: admin.profile.id } },
  create: { editionId: simposio.edition.id, profileId: admin.profile.id, roleId: simposio.roleIds.comite_organizador, origin: 'MANUAL', confirmedAt: new Date() },
  update: {},
});
await db.participantRoleAssignment.upsert({ where: { participantId_roleId: { participantId: adminParticipant.id, roleId: simposio.roleIds.comite_organizador } }, create: { participantId: adminParticipant.id, roleId: simposio.roleIds.comite_organizador }, update: {} });

console.log(`Demo lista. Contraseña de todas las cuentas: ${PASSWORD}`);
console.log(`Simposio: ${simposio.item.id}`);
await db.$disconnect();
