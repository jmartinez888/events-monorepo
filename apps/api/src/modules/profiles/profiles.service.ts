import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { DirectoryService } from '../directory/directory.service.js';

@Injectable()
export class ProfilesService {
  constructor(private readonly prisma: PrismaService, private readonly directory: DirectoryService) {}
  private serialize(profile: any) {
    const { authUser, ...details } = profile;
    const extraEmails = Array.isArray(details.additionalEmails) ? details.additionalEmails : [];
    const fallbackEmail = extraEmails.find((email: unknown) => typeof email === 'string' && email.trim());
    return { ...details, email: details.primaryEmail ?? authUser?.email ?? fallbackEmail ?? null, authId: authUser?.id ?? null, globalRole: authUser?.role ?? 'USER', accountType: authUser?.plan ?? 'FREE', accountActive: authUser?.isActive ?? false };
  }
  async list(organizationId?: string) { const profiles = await this.prisma.profile.findMany({ where: organizationId ? { OR: [{ organizationId }, { memberships: { some: { organizationId } } }, { participants: { some: { edition: { mainEvent: { organizationId } } } } }, { sessionSpeakers: { some: { session: { activity: { edition: { mainEvent: { organizationId } } } } } } }] } : undefined, include: { authUser: true }, orderBy: { createdAt: 'desc' } }); return profiles.map((profile) => this.serialize(profile)); }
  create(data: { firstName: string; lastName: string; email?: string; phone?: string; bio?: string; organizationId?: string; identityDocumentType?: string; identityDocumentNumber?: string }) { return this.prisma.$transaction((tx) => this.directory.resolve(tx, data)); }
  async get(id: string) { const profile = await this.prisma.profile.findUnique({ where: { id }, include: { authUser: true, education: true, employment: true, certifications: true } }); if (!profile) throw new NotFoundException('Perfil no encontrado'); return this.serialize(profile); }
  update(id: string, data: Record<string, unknown>) { const allowed = ['firstName', 'lastName', 'phone', 'avatarUrl', 'bio', 'identityDocumentType', 'identityDocumentNumber', 'birthDate', 'sex', 'location', 'institution', 'dedication', 'researchInterests', 'areasOfInterest', 'expertiseAreas', 'socialLinks', 'additionalEmails', 'isPublic', 'onboardingCompleted']; const clean = Object.fromEntries(Object.entries(data).filter(([key]) => allowed.includes(key))); return this.prisma.profile.update({ where: { id }, data: clean }); }
  async remove(id: string) {
    const [memberships, participants, sessionSpeakers] = await Promise.all([
      this.prisma.organizationMember.count({ where: { profileId: id } }),
      this.prisma.eventParticipant.count({ where: { profileId: id } }),
      this.prisma.sessionSpeaker.count({ where: { profileId: id } }),
    ]);
    if (memberships || participants || sessionSpeakers) {
      throw new ConflictException('No se puede eliminar este perfil porque está siendo utilizado por miembros, participantes o temas del evento.');
    }
    return this.prisma.profile.delete({ where: { id } });
  }
  education(userId: string) { return this.prisma.education.findMany({ where: { userId }, orderBy: { startDate: 'desc' } }); }
  addEducation(userId: string, data: { institution: string; degree?: string; startDate?: string; endDate?: string }) { return this.prisma.education.create({ data: { userId, institution: data.institution, degree: data.degree, startDate: data.startDate ? new Date(data.startDate) : undefined, endDate: data.endDate ? new Date(data.endDate) : undefined } }); }
  updateEducation(id: string, data: Record<string, unknown>) { return this.prisma.education.update({ where: { id }, data }); }
  removeEducation(id: string) { return this.prisma.education.delete({ where: { id } }); }
  employment(userId: string) { return this.prisma.employmentHistory.findMany({ where: { userId }, orderBy: { startDate: 'desc' } }); }
  addEmployment(userId: string, data: { company: string; position?: string; startDate?: string; endDate?: string }) { return this.prisma.employmentHistory.create({ data: { userId, company: data.company, position: data.position, startDate: data.startDate ? new Date(data.startDate) : undefined, endDate: data.endDate ? new Date(data.endDate) : undefined } }); }
  updateEmployment(id: string, data: Record<string, unknown>) { return this.prisma.employmentHistory.update({ where: { id }, data }); }
  removeEmployment(id: string) { return this.prisma.employmentHistory.delete({ where: { id } }); }
  certifications(userId: string) { return this.prisma.certification.findMany({ where: { userId }, orderBy: { issuedAt: 'desc' } }); }
  addCertification(userId: string, data: { name: string; issuer?: string; issuedAt?: string }) { return this.prisma.certification.create({ data: { userId, name: data.name, issuer: data.issuer, issuedAt: data.issuedAt ? new Date(data.issuedAt) : undefined } }); }
  updateCertification(id: string, data: Record<string, unknown>) { return this.prisma.certification.update({ where: { id }, data }); }
  removeCertification(id: string) { return this.prisma.certification.delete({ where: { id } }); }
}
