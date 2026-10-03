import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';

@Injectable()
export class PublicCommissionService {
  constructor(private readonly prisma: PrismaService) {}

  async getTransparencyPortal(slug: string) {
    const org = await this.prisma.organization.findUnique({
      where: { slug },
      include: {
        commissionSessions: {
          where: { isClosed: true }, // Only show closed/completed sessions
          orderBy: [{ year: 'desc' }, { sessionNumber: 'desc' }],
          take: 10,
          include: {
            minute: { where: { isPublic: true } },
            documents: { where: { isPublic: true } },
            agreements: {
              include: { institution: true },
            },
          },
        },
        institutionMembers: {
          where: { isActive: true },
          orderBy: { name: 'asc' },
        },
      },
    });

    if (!org) throw new NotFoundException('Organización no encontrada');

    return {
      organization: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        logoUrl: org.logoUrl,
        coverUrl: org.coverUrl,
      },
      institutions: org.institutionMembers,
      sessions: org.commissionSessions,
    };
  }
}
