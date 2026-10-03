import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';

@Injectable()
export class InstitutionsService {
  constructor(private readonly prisma: PrismaService) {}

  list(organizationId: string) {
    return this.prisma.institutionMember.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
    });
  }

  async get(id: string) {
    const inst = await this.prisma.institutionMember.findUnique({ where: { id } });
    if (!inst) throw new NotFoundException('Institución no encontrada');
    return inst;
  }

  create(organizationId: string, data: Record<string, any>) {
    return this.prisma.institutionMember.create({
      data: {
        organizationId,
        name: data.name,
        acronym: data.acronym,
        logoUrl: data.logoUrl,
        websiteUrl: data.websiteUrl,
        address: data.address,
        principalName: data.principalName,
        principalEmail: data.principalEmail,
        principalRole: data.principalRole,
        alternateName: data.alternateName,
        alternateEmail: data.alternateEmail,
        alternateRole: data.alternateRole,
        designationResolution: data.designationResolution,
      },
    });
  }

  async update(id: string, data: Record<string, unknown>) {
    const allowed = [
      'name', 'acronym', 'logoUrl', 'websiteUrl', 'address',
      'principalName', 'principalEmail', 'principalRole',
      'alternateName', 'alternateEmail', 'alternateRole',
      'designationResolution', 'isActive',
    ] as const;
    const input: Record<string, unknown> = {};
    for (const key of allowed) if (data[key] !== undefined) input[key] = data[key];
    return this.prisma.institutionMember.update({ where: { id }, data: input });
  }

  remove(id: string) {
    return this.prisma.institutionMember.delete({ where: { id } });
  }
}
