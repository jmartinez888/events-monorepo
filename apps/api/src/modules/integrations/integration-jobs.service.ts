import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { PermanentError, RetryableError } from './http.js';

export type JobHandler = (payload: any, job: { id: string; attempts: number }) => Promise<void>;

interface ClaimedJob { id: string; kind: string; payload: unknown; attempts: number; max_attempts: number }

const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 60 * 60_000;
/** Un trabajo RUNNING sin terminar tras este tiempo se considera abandonado (proceso caído). */
const STALE_LOCK_MINUTES = 10;

/**
 * Cola durable de operaciones contra sistemas externos. Varias instancias pueden
 * procesarla a la vez: cada trabajo se reclama con FOR UPDATE SKIP LOCKED.
 */
@Injectable()
export class IntegrationJobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IntegrationJobsService.name);
  private readonly handlers = new Map<string, JobHandler>();
  private timer?: NodeJS.Timeout;
  private current?: Promise<{ processed: number }>;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    if (process.env.INTEGRATION_WORKER === 'false') return;
    this.timer = setInterval(() => void this.processDue().catch((error) => this.logger.error('Fallo procesando la cola de integraciones', error)), Number(process.env.INTEGRATION_WORKER_INTERVAL_MS || 10_000));
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  register(kind: string, handler: JobHandler) {
    this.handlers.set(kind, handler);
  }

  /**
   * Encola una operación. Con dedupeKey, una operación igual que aún espera no se
   * duplica; si ya terminó (bien o mal), se vuelve a programar.
   */
  async enqueue(kind: string, payload: Prisma.InputJsonValue, options: { dedupeKey?: string; runAt?: Date; maxAttempts?: number } = {}) {
    const runAt = options.runAt ?? new Date();
    if (options.dedupeKey) {
      const existing = await this.prisma.integrationJob.findUnique({ where: { dedupeKey: options.dedupeKey } });
      if (existing && (existing.status === 'QUEUED' || existing.status === 'RUNNING')) return existing;
      if (existing) return this.prisma.integrationJob.update({ where: { id: existing.id }, data: { kind, payload, status: 'QUEUED', attempts: 0, runAt, lastError: null, lockedAt: null, maxAttempts: options.maxAttempts } });
    }
    try {
      return await this.prisma.integrationJob.create({ data: { kind, payload, dedupeKey: options.dedupeKey, runAt, maxAttempts: options.maxAttempts } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && options.dedupeKey) {
        return this.prisma.integrationJob.findUniqueOrThrow({ where: { dedupeKey: options.dedupeKey } });
      }
      throw error;
    }
  }

  /**
   * Procesa los trabajos vencidos. Público para ejecución manual y pruebas. Si
   * ya hay una pasada en curso en este proceso, la espera y luego procesa lo
   * que quede: quien llama ve el resultado de su petición.
   */
  async processDue(limit = 20): Promise<{ processed: number }> {
    while (this.current) await this.current.catch(() => undefined);
    this.current = this.claimAndRun(limit);
    try {
      return await this.current;
    } finally {
      this.current = undefined;
    }
  }

  private async claimAndRun(limit: number) {
    const jobs = await this.prisma.$queryRaw<ClaimedJob[]>`
      UPDATE integration_jobs SET status = 'RUNNING', locked_at = now(), attempts = attempts + 1, updated_at = now()
      WHERE id IN (
        SELECT id FROM integration_jobs
        WHERE (status = 'QUEUED' AND run_at <= now())
           OR (status = 'RUNNING' AND locked_at < now() - make_interval(mins => ${STALE_LOCK_MINUTES}::int))
        ORDER BY run_at
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, kind, payload, attempts, max_attempts`;
    for (const job of jobs) await this.run(job);
    return { processed: jobs.length };
  }

  private async run(job: ClaimedJob) {
    const handler = this.handlers.get(job.kind);
    if (!handler) {
      await this.prisma.integrationJob.update({ where: { id: job.id }, data: { status: 'FAILED', lastError: `Sin manejador para ${job.kind}`, lockedAt: null } });
      return;
    }
    try {
      await handler(job.payload, { id: job.id, attempts: job.attempts });
      await this.prisma.integrationJob.update({ where: { id: job.id }, data: { status: 'DONE', lastError: null, lockedAt: null } });
    } catch (error: any) {
      const message = String(error?.message ?? error).slice(0, 1000);
      const permanent = error instanceof PermanentError;
      const exhausted = job.attempts >= job.max_attempts;
      if (permanent || exhausted) {
        this.logger.warn(`Trabajo ${job.kind} ${job.id} falló definitivamente: ${message}`);
        await this.prisma.integrationJob.update({ where: { id: job.id }, data: { status: 'FAILED', lastError: message, lockedAt: null } });
        return;
      }
      const backoff = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** (job.attempts - 1));
      const wait = error instanceof RetryableError && error.retryAfterMs ? Math.max(error.retryAfterMs, 1000) : backoff;
      await this.prisma.integrationJob.update({ where: { id: job.id }, data: { status: 'QUEUED', lastError: message, lockedAt: null, runAt: new Date(Date.now() + wait) } });
    }
  }
}
