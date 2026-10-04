import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PrismaService } from "../../database/prisma.service.js";
import { isUUID } from "class-validator";

type Resource = "institutions" | "sessions" | "agreements";
const RESOURCE = "commission:resource";
export const CommissionResource = (resource: Resource) =>
  SetMetadata(RESOURCE, resource);

@Injectable()
export class CommissionAccessGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{
      method: string;
      params: Record<string, string>;
      query: Record<string, unknown>;
      body?: Record<string, unknown>;
      user?: { accountId: string; role: string };
    }>();
    if (!request.user) throw new ForbiddenException();
    const resource = this.reflector.get<Resource>(RESOURCE, context.getClass());
    const body = request.body ?? {};
    const params = request.params;
    for (const [key, value] of Object.entries(params)) {
      if (!isUUID(value))
        throw new BadRequestException(`${key} debe ser un UUID válido`);
    }
    let organizationId: string | undefined;

    if (params.itemId) {
      const item = await this.prisma.sessionAgendaItem.findUnique({
        where: { id: params.itemId },
        select: { session: { select: { organizationId: true } } },
      });
      organizationId = item?.session.organizationId;
    } else if (params.docId) {
      const item = await this.prisma.sessionDocument.findUnique({
        where: { id: params.docId },
        select: { session: { select: { organizationId: true } } },
      });
      organizationId = item?.session.organizationId;
    } else if (params.evidenceId) {
      const item = await this.prisma.agreementEvidence.findUnique({
        where: { id: params.evidenceId },
        select: {
          agreement: {
            select: { session: { select: { organizationId: true } } },
          },
        },
      });
      organizationId = item?.agreement.session.organizationId;
    } else if (params.id) {
      if (resource === "institutions") {
        const item = await this.prisma.institutionMember.findUnique({
          where: { id: params.id },
          select: { organizationId: true },
        });
        organizationId = item?.organizationId;
      } else if (resource === "sessions") {
        const item = await this.prisma.commissionSession.findUnique({
          where: { id: params.id },
          select: { organizationId: true },
        });
        organizationId = item?.organizationId;
      } else if (resource === "agreements") {
        const item = await this.prisma.commissionAgreement.findUnique({
          where: { id: params.id },
          select: { session: { select: { organizationId: true } } },
        });
        organizationId = item?.session.organizationId;
      }
    } else if (resource === "agreements" && request.method === "POST") {
      if (typeof body.sessionId !== "string" || !isUUID(body.sessionId))
        throw new BadRequestException("sessionId debe ser un UUID válido");
      const session = await this.prisma.commissionSession.findUnique({
        where: { id: body.sessionId },
        select: { organizationId: true },
      });
      organizationId = session?.organizationId;
    } else {
      const value =
        ["GET", "HEAD"].includes(request.method)
          ? request.query.organizationId
          : body.organizationId;
      if (typeof value !== "string" || !isUUID(value))
        throw new BadRequestException("organizationId debe ser un UUID válido");
      organizationId = value;
    }
    if (!organizationId)
      throw new NotFoundException("Recurso de comisión no encontrado");

    if (request.user.role !== "SUPER_ADMIN") {
      const membership = await this.prisma.organizationMember.findUnique({
        where: {
          organizationId_accountId: {
            organizationId,
            accountId: request.user.accountId,
          },
        },
        select: { role: true },
      });
      const writing = !["GET", "HEAD", "OPTIONS"].includes(request.method);
      if (
        !membership ||
        (writing && !["OWNER", "ADMIN", "EDITOR"].includes(membership.role))
      ) {
        throw new ForbiddenException("No tienes permisos para esta comisión");
      }
    }

    const institutionId = params.institutionId ?? body.institutionId;
    if (institutionId !== undefined) {
      if (typeof institutionId !== "string" || !isUUID(institutionId))
        throw new BadRequestException("institutionId no es válido");
      const institution = await this.prisma.institutionMember.findFirst({
        where: { id: institutionId, organizationId },
        select: { id: true },
      });
      if (!institution)
        throw new BadRequestException(
          "La institución no pertenece a esta comisión",
        );
    }
    return true;
  }
}
