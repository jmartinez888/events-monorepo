import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export interface PersonInput {
  firstName: string;
  lastName: string;
  email?: string;
  identityDocumentType?: string | null;
  identityDocumentNumber?: string | null;
  organizationId?: string | null;
  phone?: string;
  bio?: string;
}

/** Coincidencia ambigua o contradictoria: lleva las personas candidatas para la cola de revisión. */
export class DirectoryConflictException extends ConflictException {
  constructor(readonly candidateIds: string[]) {
    super({ message: 'Los datos coinciden con un perfil existente y requieren revisión. Contacta con la organización.', code: 'DIRECTORY_CONFLICT' });
  }
}

const normalizeName = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLowerCase();

@Injectable()
export class DirectoryService {
  /**
   * Resolución sin bloquear la inscripción (flujo 02 §4.2): ante un posible
   * duplicado se usa un perfil provisional y se abre una revisión. Una misma
   * persona que repite los mismos datos reutiliza su perfil provisional abierto.
   */
  async resolveOrReview(tx: Prisma.TransactionClient, input: PersonInput, reason: string) {
    try {
      return { profile: await this.resolve(tx, input), review: null };
    } catch (error) {
      if (!(error instanceof DirectoryConflictException)) throw error;
      const email = input.email?.trim().toLowerCase() || null;
      const documentNumber = input.identityDocumentNumber?.trim().toUpperCase().replace(/\s+/g, '') || null;
      const open = await tx.directoryReview.findMany({ where: { status: 'OPEN', organizationId: input.organizationId ?? null }, orderBy: { createdAt: 'desc' }, take: 200 });
      const same = open.find((review) => {
        const submitted = review.submitted as Record<string, string | null>;
        return submitted.email === email && submitted.documentNumber === documentNumber && normalizeName(`${submitted.firstName} ${submitted.lastName}`) === normalizeName(`${input.firstName} ${input.lastName}`);
      });
      if (same) {
        const profile = await tx.profile.findUnique({ where: { id: same.provisionalProfileId } });
        if (profile) return { profile, review: same };
      }
      const profile = await tx.profile.create({ data: {
        firstName: input.firstName.trim(), lastName: input.lastName.trim(), primaryEmail: email, additionalEmails: email ? [email] : [],
        identityDocumentType: input.identityDocumentType?.trim().toUpperCase() || null, identityDocumentNumber: documentNumber,
        organizationId: input.organizationId, phone: input.phone,
      } });
      const review = await tx.directoryReview.create({ data: {
        organizationId: input.organizationId ?? null, reason, provisionalProfileId: profile.id, candidateProfileIds: error.candidateIds,
        submitted: { firstName: input.firstName.trim(), lastName: input.lastName.trim(), email, documentType: input.identityDocumentType?.trim().toUpperCase() || null, documentNumber },
      } });
      return { profile, review };
    }
  }

  /** All registration writers resolve the person within their own transaction. */
  async resolve(tx: Prisma.TransactionClient, input: PersonInput) {
    const firstName = input.firstName?.trim();
    const lastName = input.lastName?.trim();
    const email = input.email?.trim().toLowerCase() || null;
    let documentType = input.identityDocumentType?.trim().toUpperCase() || null;
    const documentNumber = input.identityDocumentNumber?.trim().toUpperCase().replace(/\s+/g, '') || null;
    if (documentType === 'NINGUNO') documentType = null;
    if (!firstName || !lastName) throw new BadRequestException('Nombres y apellidos son obligatorios');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('Correo electrónico inválido');
    if (!!documentType !== !!documentNumber) throw new BadRequestException('Indica tipo y número de documento juntos');
    if (documentType === 'DNI' && !/^\d{8}$/.test(documentNumber!)) throw new BadRequestException('El DNI debe tener 8 dígitos');
    if (documentNumber && !/^[A-Z0-9.-]{3,30}$/.test(documentNumber)) throw new BadRequestException('Número de documento inválido');

    // Locks are sorted to prevent deadlocks between concurrent registrations.
    const keys = [email && `directory:email:${email}`, documentNumber && `directory:document:${documentType}:${documentNumber}`].filter((key): key is string => Boolean(key)).sort();
    for (const key of keys) await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
    const conditions: Prisma.ProfileWhereInput[] = [];
    if (email) conditions.push({ primaryEmail: { equals: email, mode: 'insensitive' } }, { authUser: { email: { equals: email, mode: 'insensitive' } } }, { additionalEmails: { array_contains: [email] } });
    if (documentNumber) conditions.push({ identityDocumentType: { equals: documentType!, mode: 'insensitive' }, identityDocumentNumber: { equals: documentNumber, mode: 'insensitive' } });
    const found = conditions.length ? await tx.profile.findMany({ where: { OR: conditions }, include: { authUser: { select: { email: true } } } }) : [];
    // Un perfil provisional en revisión no es una identidad confirmada: no compite con la persona real.
    const provisional = found.length ? new Set((await tx.directoryReview.findMany({ where: { status: 'OPEN', provisionalProfileId: { in: found.map((item) => item.id) } }, select: { provisionalProfileId: true } })).map((item) => item.provisionalProfileId)) : new Set<string>();
    const confirmed = found.filter((item) => !provisional.has(item.id));
    const candidates = confirmed.length ? confirmed : found;
    const conflict = () => new DirectoryConflictException(candidates.map((candidate) => candidate.id));
    if (candidates.length > 1) throw conflict();
    if (candidates.length === 1) {
      const person = candidates[0]!;
      const knownEmails = [person.primaryEmail, person.authUser?.email, ...(Array.isArray(person.additionalEmails) ? person.additionalEmails.filter((value): value is string => typeof value === 'string') : [])].filter(Boolean).map((value) => value!.trim().toLowerCase());
      if (email && knownEmails.length && !knownEmails.includes(email)) throw conflict();
      if (documentNumber && person.identityDocumentNumber && (person.identityDocumentNumber.trim().toUpperCase().replace(/\s+/g, '') !== documentNumber || person.identityDocumentType?.trim().toUpperCase() !== documentType)) throw conflict();
      if (normalizeName(`${person.firstName || ''} ${person.lastName || ''}`) !== normalizeName(`${firstName} ${lastName}`)) throw conflict();
      // Public registration must never overwrite an existing person's identity.
      return person;
    }
    return tx.profile.create({ data: {
      firstName, lastName, primaryEmail: email, additionalEmails: email ? [email] : [],
      identityDocumentType: documentType, identityDocumentNumber: documentNumber,
      organizationId: input.organizationId, phone: input.phone, bio: input.bio,
    } });
  }

  /**
   * Vincula una cuenta con correo ya verificado a su persona del Directorio
   * (flujo 06 sin Authelia). Coincidencia única por correo: se enlaza. Sin
   * coincidencia: se crea la persona. Varias candidatas: no se adivina y queda
   * para revisión; la cuenta funciona sin perfil vinculado.
   */
  async linkAccount(tx: Prisma.TransactionClient, account: { id: string; email: string }, names: { firstName?: string | null; lastName?: string | null } = {}) {
    const linked = await tx.profile.findUnique({ where: { authUserId: account.id } });
    if (linked) return { status: 'ALREADY_LINKED' as const, profile: linked };
    const email = account.email.trim().toLowerCase();
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`directory:email:${email}`}, 0))::text`;
    const candidates = await tx.profile.findMany({
      where: { OR: [{ primaryEmail: { equals: email, mode: 'insensitive' } }, { additionalEmails: { array_contains: [email] } }] },
    });
    const free = candidates.filter((candidate) => !candidate.authUserId);
    if (candidates.length > 1 || (candidates.length === 1 && !free.length)) return { status: 'REVIEW' as const, profile: null };
    if (free.length === 1) {
      const profile = await tx.profile.update({ where: { id: free[0]!.id }, data: { authUserId: account.id, primaryEmail: free[0]!.primaryEmail || email } });
      return { status: 'LINKED' as const, profile };
    }
    const profile = await tx.profile.create({ data: { authUserId: account.id, firstName: names.firstName?.trim() || null, lastName: names.lastName?.trim() || null, primaryEmail: email, additionalEmails: [email] } });
    return { status: 'CREATED' as const, profile };
  }
}
