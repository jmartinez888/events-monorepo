import { createRequire } from 'node:module';
const url = new URL(process.env.DATABASE_URL || 'postgresql://invalid/invalid');
if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== '55432' || url.pathname !== '/events_test') throw new Error('Use only the isolated events_test database on localhost:55432');
const require = createRequire(new URL('../package.json', import.meta.url));
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const db = new PrismaClient();
const passwordHash = await bcrypt.hash('IIAPdemo2026!', 10);
const user = await db.authUser.upsert({ where: { email: 'demo.iiap@example.test' }, create: { email: 'demo.iiap@example.test', passwordHash, role: 'USER', emailVerifiedAt: new Date() }, update: { passwordHash, emailVerifiedAt: new Date() } });
const profile = await db.profile.upsert({ where: { authUserId: user.id }, create: { authUserId: user.id, firstName: 'Organizador', lastName: 'IIAP', phone: '999000001', primaryEmail: user.email }, update: {} });
const org = await db.organization.upsert({ where: { slug: 'iiap-demo' }, create: { slug: 'iiap-demo', name: 'IIAP · Demostración local' }, update: {} });
await db.organizationMember.upsert({ where: { organizationId_profileId: { organizationId: org.id, profileId: profile.id } }, create: { organizationId: org.id, profileId: profile.id, accountId: user.id, role: 'OWNER' }, update: {} });
let event = await db.mainEvent.findFirst({ where: { organizationId: org.id } });
if (!event) event = await db.mainEvent.create({ data: { eventName: 'Simposio de investigación amazónica', organizationId: org.id, startDate: new Date('2026-10-20T14:00:00Z'), status: 'PUBLISHED', eventMode: 'HYBRID' } });
let edition = await db.edition.findFirst({ where: { mainEventId: event.id } });
if (!edition) edition = await db.edition.create({ data: { mainEventId: event.id, name: 'Edición 2026', isCurrent: true } });
for (const [name, displayName, requiresAttendance, isSpeaker, hours] of [['participant','Asistente',true,false,5],['comite_cientifico','Comité científico',false,false,8],['expositor','Expositor',false,true,4]]) {
 let role = await db.participantRole.findFirst({ where: { mainEventId: event.id, name } });
 if (!role) role = await db.participantRole.create({ data: { mainEventId: event.id, name, displayName, requiresAttendance, isSpeaker, certificateHours: hours } });
}
const role = await db.participantRole.findFirstOrThrow({ where: { mainEventId: event.id, name: 'participant' } });
for (const [firstName,lastName,email,document] of [['Ana','Torres','ana.demo@example.test','10000001'],['Luis','Díaz','luis.demo@example.test','10000002'],['Rosa','Vargas','rosa.demo@example.test','10000003']]) {
 let person = await db.profile.findFirst({ where: { primaryEmail: email } });
 if (!person) person = await db.profile.create({ data: { firstName,lastName,primaryEmail:email,additionalEmails:[email],identityDocumentType:'DNI',identityDocumentNumber:document,organizationId:org.id } });
 const participant = await db.eventParticipant.upsert({ where: { editionId_profileId: { editionId: edition.id, profileId: person.id } }, create: { editionId:edition.id, profileId:person.id,roleId:role.id }, update: {} });
 await db.participantRoleAssignment.upsert({ where: { participantId_roleId: { participantId:participant.id,roleId:role.id } }, create: { participantId:participant.id,roleId:role.id }, update: {} });
}
// Agenda con horario: necesaria para Zoom, recordatorios y el espejo de Asistencia.
let activity = await db.eventActivity.findFirst({ where: { editionId: edition.id } });
if (!activity) activity = await db.eventActivity.create({ data: { editionId: edition.id, title: 'Jornada principal', startsAt: new Date('2026-10-20T14:00:00Z'), endsAt: new Date('2026-10-20T19:00:00Z') } });
for (const [title, startsAt, endsAt, modality] of [['Conferencia inaugural (virtual)', '2026-10-20T14:00:00Z', '2026-10-20T15:30:00Z', 'ONLINE'], ['Mesa de trabajo (presencial)', '2026-10-20T16:00:00Z', '2026-10-20T18:00:00Z', 'PHYSICAL']]) {
 if (!await db.eventSession.findFirst({ where: { activityId: activity.id, title } })) await db.eventSession.create({ data: { activityId: activity.id, title, startsAt: new Date(startsAt), endsAt: new Date(endsAt), modality } });
}
await db.mainEvent.update({ where: { id: event.id }, data: { capacity: 50, waitlistEnabled: true, reminderOffsets: [1440, 60] } });
console.log(`Demo: http://127.0.0.1:5175/dashboard/events/${event.id}/registrations`);
console.log('Datos de demostración local preparados');
await db.$disconnect();
