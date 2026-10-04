import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ExecutionContext,
  ForbiddenException,
  BadRequestException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Reflector } from "@nestjs/core";
import { JwtAuthGuard } from "../src/modules/auth/jwt-auth.guard.js";
import {
  CommissionAccessGuard,
  CommissionResource,
} from "../src/modules/commission/commission-access.guard.js";
import { PrismaService } from "../src/database/prisma.service.js";
import { AuthService } from "../src/modules/auth/auth.service.js";
import { MailService } from "../src/modules/mail/mail.service.js";
import { publicAccountSelect } from "../src/modules/auth/public-account.js";
import { ValidationPipe } from "@nestjs/common";
import {
  SessionDto,
  UpdateSessionDto,
  MinuteDto,
} from "../src/modules/commission/commission.dto.js";

const sessionId = "11111111-1111-4111-8111-111111111111";
const institutionId = "22222222-2222-4222-8222-222222222222";

test("commission guard resolves ownership for agreements and nested resources", async () => {
  const session = { organizationId: "owner-org" };
  const prisma = {
    institutionMember: { findUnique: async () => session },
    commissionSession: { findUnique: async () => session },
    commissionAgreement: { findUnique: async () => ({ session }) },
    sessionAgendaItem: { findUnique: async () => ({ session }) },
    sessionDocument: { findUnique: async () => ({ session }) },
    agreementEvidence: { findUnique: async () => ({ agreement: { session } }) },
    organizationMember: {
      findUnique: async (query: { where: { organizationId_accountId: { organizationId: string } } }) => {
        assert.equal(query.where.organizationId_accountId.organizationId, "owner-org");
        return null;
      },
    },
  } as unknown as PrismaService;
  const guard = new CommissionAccessGuard(prisma, new Reflector());
  const cases = [
    { resource: "institutions", params: { id: institutionId } },
    { resource: "agreements", params: { id: sessionId } },
    { resource: "sessions", params: { itemId: sessionId } },
    { resource: "sessions", params: { docId: sessionId } },
    { resource: "agreements", params: { evidenceId: sessionId } },
  ] as const;
  for (const item of cases) {
    class Controller {}
    CommissionResource(item.resource)(Controller);
    const request = { method: "DELETE", params: item.params, query: {}, user: { accountId: "outsider", role: "USER" } };
    await assert.rejects(guard.canActivate(context(request, Controller)), ForbiddenException);
    assert.equal(await guard.canActivate(context({ ...request, user: { accountId: "admin", role: "SUPER_ADMIN" } }, Controller)), true);
  }
  class Agreements {}
  CommissionResource("agreements")(Agreements);
  await assert.rejects(guard.canActivate(context({ method: "POST", params: {}, query: {}, body: { sessionId }, user: { accountId: "outsider", role: "USER" } }, Agreements)), ForbiddenException);
});

function context(request: object, controller: Function = class {}) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => function handler() {},
    getClass: () => controller,
  } as unknown as ExecutionContext;
}

test("JWT guard accepts access tokens and rejects invalid, expired and refresh tokens", async () => {
  const previous = process.env.JWT_ACCESS_SECRET;
  process.env.JWT_ACCESS_SECRET = "test-secret-only";
  try {
    const jwt = new JwtService();
    const guard = new JwtAuthGuard(jwt, new Reflector());
    const valid = await jwt.signAsync(
      { sub: "account", role: "USER" },
      { secret: "test-secret-only" },
    );
    const request = {
      headers: { authorization: `Bearer ${valid}` },
      user: undefined as unknown,
    };
    assert.equal(await guard.canActivate(context(request)), true);
    assert.deepEqual(request.user, { accountId: "account", role: "USER" });
    for (const payload of [
      { sub: "account", role: "USER", type: "refresh" },
      { role: "USER" },
      { sub: "account", role: "INVALID" },
      { sub: "account", role: "USER", exp: 1 },
    ]) {
      const token = await jwt.signAsync(payload, {
        secret: "test-secret-only",
      });
      await assert.rejects(
        guard.canActivate(
          context({ headers: { authorization: `Bearer ${token}` } }),
        ),
        UnauthorizedException,
      );
    }
    await assert.rejects(
      guard.canActivate(context({ headers: {} })),
      UnauthorizedException,
    );
    await assert.rejects(
      guard.canActivate(
        context({ headers: { authorization: "Bearer invalid" } }),
      ),
      UnauthorizedException,
    );
    delete process.env.JWT_ACCESS_SECRET;
    const fallbackToken = await jwt.signAsync(
      { sub: "account", role: "USER" },
      { secret: "dev-access-secret" },
    );
    await assert.rejects(
      guard.canActivate(
        context({ headers: { authorization: `Bearer ${fallbackToken}` } }),
      ),
      UnauthorizedException,
    );
  } finally {
    if (previous === undefined) delete process.env.JWT_ACCESS_SECRET;
    else process.env.JWT_ACCESS_SECRET = previous;
  }
});

test("commission guard enforces tenant membership and read/write roles", async () => {
  class Sessions {}
  CommissionResource("sessions")(Sessions);
  let role: string | undefined = "MEMBER";
  const prisma = {
    commissionSession: {
      findUnique: async () => ({ organizationId: "owner-org" }),
    },
    organizationMember: {
      findUnique: async (query: {
        where: { organizationId_accountId: { organizationId: string } };
      }) => {
        assert.equal(
          query.where.organizationId_accountId.organizationId,
          "owner-org",
        );
        return role ? { role } : null;
      },
    },
  } as unknown as PrismaService;
  const guard = new CommissionAccessGuard(prisma, new Reflector());
  const request = {
    method: "GET",
    params: { id: sessionId },
    query: { organizationId: "attacker-org" },
    user: { accountId: "account", role: "USER" },
  };
  assert.equal(await guard.canActivate(context(request, Sessions)), true);
  await assert.rejects(
    guard.canActivate(context({ ...request, method: "DELETE" }, Sessions)),
    ForbiddenException,
  );
  role = undefined;
  await assert.rejects(
    guard.canActivate(context(request, Sessions)),
    ForbiddenException,
  );
  role = "EDITOR";
  assert.equal(
    await guard.canActivate(context({ ...request, method: "PATCH" }, Sessions)),
    true,
  );
  await assert.rejects(
    guard.canActivate(context({ ...request, params: {}, query: {} }, Sessions)),
    BadRequestException,
  );
});

test("commission guard rejects cross-tenant attendance institutions", async () => {
  class Sessions {}
  CommissionResource("sessions")(Sessions);
  const prisma = {
    commissionSession: { findUnique: async () => ({ organizationId: "org" }) },
    institutionMember: { findFirst: async () => null },
  } as unknown as PrismaService;
  const guard = new CommissionAccessGuard(prisma, new Reflector());
  await assert.rejects(
    guard.canActivate(
      context(
        {
          method: "PUT",
          params: { id: sessionId, institutionId },
          query: {},
          user: { accountId: "admin", role: "SUPER_ADMIN" },
        },
        Sessions,
      ),
    ),
    BadRequestException,
  );
});

test("account creation uses UUID and atomic profile creation; response queries exclude secrets", async () => {
  const safeAccount = {
    id: "account",
    email: "person@example.com",
    role: "USER",
    isActive: true,
    profile: { id: "profile" },
  };
  const prisma = {
    authUser: {
      create: async (query: {
        data: { id: string; email: string; profile: { create: object } };
        select: object;
      }) => {
        assert.match(
          query.data.id,
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        );
        assert.equal(query.data.email, "person@example.com");
        assert.deepEqual(query.data.profile.create, {
          firstName: "Name",
          lastName: undefined,
        });
        assert.deepEqual(query.select, {
          ...publicAccountSelect,
          profile: true,
        });
        return safeAccount;
      },
      findMany: async (query: { select: object }) => {
        assert.deepEqual(query.select, {
          ...publicAccountSelect,
          profile: true,
        });
        assert.equal("passwordHash" in query.select, false);
        assert.equal("passwordResetTokenHash" in query.select, false);
        return [safeAccount];
      },
    },
  } as unknown as PrismaService;
  const mail = {
    sendWelcome: async () => ({ sent: true }),
  } as unknown as MailService;
  const service = new AuthService(prisma, new JwtService(), mail);
  const result = await service.createAccount({
    email: " Person@Example.com ",
    firstName: "Name",
    password: "password123",
  });
  assert.ok(result.profile);
  assert.equal(result.profile.id, "profile");
  assert.equal("passwordHash" in result, false);
  assert.equal((await service.listAccounts()).length, 1);
});

test("commission DTOs reject bad dates, enums and string booleans; partial updates remain valid", async () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true });
  const data = {
    organizationId: sessionId,
    title: "Session",
    sessionNumber: "1",
    year: "2026",
    scheduledDate: "2026-10-03",
    startTime: "09:00",
    extra: "discard",
  };
  const result = await pipe.transform(data, {
    type: "body",
    metatype: SessionDto,
  });
  assert.equal(result.sessionNumber, 1);
  assert.equal("extra" in result, false);
  for (const overrides of [
    { scheduledDate: "bad-date" },
    { type: "INVALID" },
    { quorumRequired: 0 },
    { isClosed: "false" },
  ]) {
    await assert.rejects(
      pipe.transform(
        { ...data, ...overrides },
        { type: "body", metatype: SessionDto },
      ),
      BadRequestException,
    );
  }
  const update = await pipe.transform(
    { title: "Updated" },
    { type: "body", metatype: UpdateSessionDto },
  );
  assert.equal(update.title, "Updated");
  await assert.rejects(
    pipe.transform(
      { minuteCode: "A-1", isPublic: "false" },
      { type: "body", metatype: MinuteDto },
    ),
    BadRequestException,
  );
});
