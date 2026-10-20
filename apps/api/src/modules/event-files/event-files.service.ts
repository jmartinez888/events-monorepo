import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { FileScope, FileStatus, FileVisibility, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { PrismaService } from '../../database/prisma.service.js';
import { Actor, EventAccessService } from '../../common/event-access.service.js';
import { sha256 } from '../../common/security/crypto.js';
import { STORAGE, StoragePort } from '../storage/storage.port.js';
import { FileUrlSigner } from '../storage/file-url.signer.js';

export const MAX_FILE_BYTES = Number(process.env.FILE_MAX_MB || 50) * 1024 * 1024;

/** Lista blanca por extensión, con la firma binaria esperada para evitar archivos disfrazados. */
const ALLOWED: Record<string, { mime: string[]; magic: 'pdf' | 'zip' | 'ole' | 'png' | 'jpg' }> = {
  '.pdf': { mime: ['application/pdf'], magic: 'pdf' },
  '.pptx': { mime: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'], magic: 'zip' },
  '.ppt': { mime: ['application/vnd.ms-powerpoint'], magic: 'ole' },
  '.docx': { mime: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'], magic: 'zip' },
  '.doc': { mime: ['application/msword'], magic: 'ole' },
  '.odp': { mime: ['application/vnd.oasis.opendocument.presentation'], magic: 'zip' },
  '.odt': { mime: ['application/vnd.oasis.opendocument.text'], magic: 'zip' },
  '.png': { mime: ['image/png'], magic: 'png' },
  '.jpg': { mime: ['image/jpeg'], magic: 'jpg' },
  '.jpeg': { mime: ['image/jpeg'], magic: 'jpg' },
};
const MATERIAL_EXTENSIONS = new Set(['.pdf', '.ppt', '.pptx', '.doc', '.docx', '.odp', '.odt']);
const DOCUMENT_TYPES = new Set(['ACTA', 'PROGRAMA', 'MEMORIA', 'OTRO']);

const MAGIC: Record<string, (buffer: Buffer) => boolean> = {
  pdf: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-',
  zip: (b) => b[0] === 0x50 && b[1] === 0x4b,
  ole: (b) => b.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0])),
  png: (b) => b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])),
  jpg: (b) => b[0] === 0xff && b[1] === 0xd8,
};

export interface UploadInput {
  scope: FileScope;
  title: string;
  visibility?: FileVisibility;
  sessionId?: string;
  sessionSpeakerId?: string;
  documentType?: string;
}

const fileInclude = {
  versions: { orderBy: { version: 'desc' as const }, select: { id: true, version: true, fileName: true, mimeType: true, size: true, createdAt: true, uploadedBy: true } },
  session: { select: { id: true, title: true } },
  speaker: { select: { id: true, role: true, profile: { select: { id: true, firstName: true, lastName: true } } } },
} satisfies Prisma.EventFileInclude;

@Injectable()
export class EventFilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: EventAccessService,
    private readonly signer: FileUrlSigner,
    @Inject(STORAGE) private readonly storage: StoragePort,
  ) {}

  async list(eventId: string, actor: Actor) {
    await this.access.assertEvent(eventId, actor, 'READ');
    return this.prisma.eventFile.findMany({ where: { mainEventId: eventId, status: { not: 'DELETED' } }, include: fileInclude, orderBy: [{ scope: 'asc' }, { createdAt: 'desc' }] });
  }

  async upload(eventId: string, file: Express.Multer.File | undefined, input: UploadInput, actor: Actor) {
    const checked = this.validateFile(file);
    const scope = input.scope;
    if (scope !== 'MATERIAL' && scope !== 'DOCUMENT') throw new BadRequestException('Indica si es material de exposición o documento del evento');
    const title = input.title?.trim();
    if (!title) throw new BadRequestException('El archivo necesita un título');
    const visibility = this.visibility(input.visibility ?? 'PRIVATE');
    let sessionId: string | null = null;
    let sessionSpeakerId: string | null = null;
    let documentType: string | null = null;

    if (scope === 'MATERIAL') {
      if (!MATERIAL_EXTENSIONS.has(checked.extension)) throw new BadRequestException('Los materiales admiten PDF, PPT, PPTX, DOC, DOCX, ODP u ODT');
      if (!input.sessionId) throw new BadRequestException('El material pertenece a una sesión');
      const session = await this.prisma.eventSession.findFirst({ where: { id: input.sessionId, activity: { edition: { mainEventId: eventId } } }, select: { id: true } });
      if (!session) throw new BadRequestException('La sesión no pertenece a este evento');
      sessionId = session.id;
      if (input.sessionSpeakerId) {
        const speaker = await this.prisma.sessionSpeaker.findFirst({ where: { id: input.sessionSpeakerId, sessionId }, select: { id: true } });
        if (!speaker) throw new BadRequestException('El expositor no pertenece a esa sesión');
        sessionSpeakerId = speaker.id;
      }
      await this.assertCanWriteMaterial(eventId, sessionId, sessionSpeakerId, actor);
      // Un expositor que sube su propio material queda como dueño aunque no lo indique.
      if (!sessionSpeakerId) sessionSpeakerId = await this.ownSpeakerId(sessionId, actor);
    } else {
      await this.access.assertEvent(eventId, actor, 'EDIT');
      documentType = (input.documentType || 'OTRO').trim().toUpperCase();
      if (!DOCUMENT_TYPES.has(documentType)) throw new BadRequestException('Tipo de documento inválido: ACTA, PROGRAMA, MEMORIA u OTRO');
    }

    const id = randomUUID();
    const storageKey = this.key(eventId, id, 1, checked.extension);
    await this.storage.put(storageKey, checked.buffer, checked.mime);
    try {
      return await this.prisma.eventFile.create({
        data: {
          id, mainEventId: eventId, scope, sessionId, sessionSpeakerId, documentType, title, visibility, createdBy: actor.accountId,
          versions: { create: { version: 1, storageKey, fileName: checked.fileName, mimeType: checked.mime, size: checked.buffer.length, sha256: sha256(checked.buffer), uploadedBy: actor.accountId } },
        },
        include: fileInclude,
      });
    } catch (error) {
      await this.storage.remove(storageKey).catch(() => undefined);
      throw error;
    }
  }

  /** Reemplazar crea una versión nueva; las anteriores se conservan para el historial. */
  async replace(fileId: string, file: Express.Multer.File | undefined, actor: Actor) {
    const current = await this.requireWritable(fileId, actor);
    const checked = this.validateFile(file);
    if (current.scope === 'MATERIAL' && !MATERIAL_EXTENSIONS.has(checked.extension)) throw new BadRequestException('Los materiales admiten PDF, PPT, PPTX, DOC, DOCX, ODP u ODT');
    return this.prisma.$transaction(async (tx) => {
      // Bloquea la fila para que dos reemplazos simultáneos no tomen el mismo número de versión.
      await tx.$queryRaw`SELECT id FROM event_files WHERE id = ${fileId}::uuid FOR UPDATE`;
      const fresh = await tx.eventFile.findUniqueOrThrow({ where: { id: fileId } });
      const version = fresh.currentVersion + 1;
      const storageKey = this.key(fresh.mainEventId, fresh.id, version, checked.extension);
      await this.storage.put(storageKey, checked.buffer, checked.mime);
      await tx.eventFileVersion.create({ data: { fileId, version, storageKey, fileName: checked.fileName, mimeType: checked.mime, size: checked.buffer.length, sha256: sha256(checked.buffer), uploadedBy: actor.accountId } });
      return tx.eventFile.update({ where: { id: fileId }, data: { currentVersion: version, status: fresh.status === 'DELETED' ? 'ACTIVE' : fresh.status }, include: fileInclude });
    });
  }

  async update(fileId: string, data: { title?: string; visibility?: FileVisibility; status?: FileStatus }, actor: Actor) {
    await this.requireWritable(fileId, actor);
    const status = data.status;
    if (status && !['ACTIVE', 'HIDDEN', 'DELETED'].includes(status)) throw new BadRequestException('Estado inválido');
    // Borrado lógico: el binario y sus versiones se conservan para auditoría.
    return this.prisma.eventFile.update({
      where: { id: fileId },
      data: { title: data.title?.trim() || undefined, visibility: data.visibility ? this.visibility(data.visibility) : undefined, status },
      include: fileInclude,
    });
  }

  /** Enlace temporal para el equipo organizador o el expositor dueño. */
  async downloadForActor(fileId: string, actor: Actor, version?: number) {
    const file = await this.prisma.eventFile.findUnique({ where: { id: fileId }, include: { versions: true } });
    if (!file || file.status === 'DELETED') throw new NotFoundException('Archivo no encontrado');
    const isOwner = file.sessionSpeakerId ? await this.isSpeakerOwner(file.sessionSpeakerId, actor) : false;
    if (!isOwner) await this.access.assertEvent(file.mainEventId, actor, 'READ');
    const selected = file.versions.find((item) => item.version === (version ?? file.currentVersion));
    if (!selected) throw new NotFoundException('Versión no encontrada');
    return this.signer.sign(selected.id);
  }

  /** Archivos visibles para una audiencia, con URL firmada de la versión vigente. */
  async visibleFiles(eventId: string, audience: 'PUBLIC' | 'REGISTERED') {
    const visibilities: FileVisibility[] = audience === 'PUBLIC' ? ['PUBLIC'] : ['PUBLIC', 'REGISTERED'];
    const files = await this.prisma.eventFile.findMany({
      where: { mainEventId: eventId, status: 'ACTIVE', visibility: { in: visibilities } },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 }, session: { select: { id: true, title: true, startsAt: true } }, speaker: { select: { profile: { select: { firstName: true, lastName: true } } } } },
      orderBy: [{ scope: 'asc' }, { createdAt: 'asc' }],
    });
    return files.filter((file) => file.versions[0]).map((file) => {
      const version = file.versions[0]!;
      return {
        id: file.id, scope: file.scope, title: file.title, documentType: file.documentType, visibility: file.visibility,
        session: file.session, speaker: file.speaker?.profile ?? null,
        fileName: version.fileName, mimeType: version.mimeType, size: version.size, version: version.version,
        download: this.signer.sign(version.id),
      };
    });
  }

  /** Sirve el binario de un enlace firmado vigente. */
  async resolveDownload(token: string) {
    const grant = this.signer.verify(token);
    if (!grant) throw new ForbiddenException('El enlace de descarga venció o no es válido');
    const version = await this.prisma.eventFileVersion.findUnique({ where: { id: grant.versionId }, include: { file: { select: { status: true } } } });
    if (!version || version.file.status === 'DELETED') throw new NotFoundException('Archivo no encontrado');
    const object = await this.storage.get(version.storageKey);
    return { ...object, fileName: version.fileName, contentType: version.mimeType };
  }

  /** Sesiones donde la cuenta actual figura como expositor, con sus materiales (flujo 08). */
  async mySpeakerSessions(actor: Actor) {
    const profile = await this.prisma.profile.findUnique({ where: { authUserId: actor.accountId }, select: { id: true } });
    if (!profile) return [];
    return this.prisma.sessionSpeaker.findMany({
      where: { profileId: profile.id },
      include: {
        session: { select: { id: true, title: true, startsAt: true, endsAt: true, activity: { select: { edition: { select: { id: true, name: true, mainEvent: { select: { id: true, eventName: true } } } } } } } },
        files: { where: { status: { not: 'DELETED' } }, include: fileInclude },
      },
      orderBy: { session: { startsAt: 'asc' } },
    });
  }

  private async requireWritable(fileId: string, actor: Actor) {
    const file = await this.prisma.eventFile.findUnique({ where: { id: fileId } });
    if (!file) throw new NotFoundException('Archivo no encontrado');
    if (file.scope === 'MATERIAL' && file.sessionId) await this.assertCanWriteMaterial(file.mainEventId, file.sessionId, file.sessionSpeakerId, actor);
    else await this.access.assertEvent(file.mainEventId, actor, 'EDIT');
    return file;
  }

  /** El organizador modera todo; el expositor solo su propio material. */
  private async assertCanWriteMaterial(eventId: string, sessionId: string, sessionSpeakerId: string | null, actor: Actor) {
    try {
      await this.access.assertEvent(eventId, actor, 'EDIT');
      return;
    } catch (error) {
      if (!(error instanceof ForbiddenException)) throw error;
    }
    const own = await this.ownSpeakerId(sessionId, actor);
    if (!own || (sessionSpeakerId && sessionSpeakerId !== own)) throw new ForbiddenException('Solo el expositor de la sesión o el equipo organizador pueden gestionar este material');
  }

  private async ownSpeakerId(sessionId: string, actor: Actor) {
    if (!actor.accountId) return null;
    const speaker = await this.prisma.sessionSpeaker.findFirst({ where: { sessionId, profile: { authUserId: actor.accountId } }, select: { id: true } });
    return speaker?.id ?? null;
  }

  private async isSpeakerOwner(sessionSpeakerId: string, actor: Actor) {
    if (!actor.accountId) return false;
    return !!(await this.prisma.sessionSpeaker.findFirst({ where: { id: sessionSpeakerId, profile: { authUserId: actor.accountId } }, select: { id: true } }));
  }

  private visibility(value: string): FileVisibility {
    const normalized = value.toUpperCase() as FileVisibility;
    if (!['PUBLIC', 'REGISTERED', 'PRIVATE'].includes(normalized)) throw new BadRequestException('Visibilidad inválida: PUBLIC, REGISTERED o PRIVATE');
    return normalized;
  }

  private validateFile(file: Express.Multer.File | undefined) {
    if (!file?.buffer?.length) throw new BadRequestException('Adjunta un archivo');
    if (file.size > MAX_FILE_BYTES) throw new BadRequestException(`El archivo supera ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB`);
    const fileName = path.basename(file.originalname || 'archivo').replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 180) || 'archivo';
    const extension = path.extname(fileName).toLowerCase();
    const rule = ALLOWED[extension];
    if (!rule) throw new BadRequestException('Tipo de archivo no permitido');
    if (!MAGIC[rule.magic]!(file.buffer)) throw new BadRequestException('El contenido del archivo no coincide con su extensión');
    return { buffer: file.buffer, fileName, extension, mime: rule.mime[0]! };
  }

  private key(eventId: string, fileId: string, version: number, extension: string) {
    return `events/${eventId}/files/${fileId}/v${version}-${randomUUID()}${extension}`;
  }
}
