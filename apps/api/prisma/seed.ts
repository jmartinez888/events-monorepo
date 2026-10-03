import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'

const prisma = new PrismaClient()

async function upsertUser(email: string, password: string, role: 'SUPER_ADMIN' | 'ADMIN' | 'USER', firstName: string) {
  const passwordHash = await bcrypt.hash(password, 10)
  const existing = await prisma.authUser.findUnique({ where: { email } })
  const id = existing?.id ?? randomUUID()
  const user = await prisma.authUser.upsert({
    where: { email },
    update: { passwordHash, role },
    create: { id, email, passwordHash, role },
  })
  await prisma.profile.upsert({ where: { authUserId: user.id }, update: { firstName }, create: { authUserId: user.id, firstName } })
  return user.email
}

async function main() {
  const superAdminEmail = process.env.SEED_SUPERADMIN_EMAIL ?? 'superadmin@events.local'
  const superAdminPassword = process.env.SEED_SUPERADMIN_PASSWORD ?? 'ChangeMe123!'
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@events.local'
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!'
  await upsertUser(superAdminEmail, superAdminPassword, 'SUPER_ADMIN', 'Super Admin')
  await upsertUser(adminEmail, adminPassword, 'ADMIN', 'Administrador')
  const superAdmin = await prisma.authUser.findUnique({ where: { email: superAdminEmail } })
  const admin = await prisma.authUser.findUnique({ where: { email: adminEmail } })

  // Seed Organization: CNPP OTCA Perú
  const orgSlug = 'cnpp-otca'
  const org = await prisma.organization.upsert({
    where: { slug: orgSlug },
    update: {
      name: 'Comisión Nacional Permanente Peruana de la OTCA',
      description: 'Órgano multisectorial encargado de coordinar y ejecutar las acciones del Tratado de Cooperación Amazónica en el Perú.',
    },
    create: {
      name: 'Comisión Nacional Permanente Peruana de la OTCA',
      slug: orgSlug,
      description: 'Órgano multisectorial encargado de coordinar y ejecutar las acciones del Tratado de Cooperación Amazónica en el Perú.',
      organizationType: 'GOVERNMENT',
      isActive: true,
    },
  })

  // Seed Portal configuration
  await prisma.organizationPortal.upsert({
    where: { organizationId: org.id },
    update: {
      heroTitle: 'Comisión Nacional Permanente Peruana de la OTCA',
      heroDescription: 'Coordinación multisectorial del Tratado de Cooperación Amazónica en el Perú.',
      isPublished: true,
    },
    create: {
      organizationId: org.id,
      heroTitle: 'Comisión Nacional Permanente Peruana de la OTCA',
      heroDescription: 'Coordinación multisectorial del Tratado de Cooperación Amazónica en el Perú.',
      isPublished: true,
    },
  })

  // Associate admin to organization
  if (admin) {
    const adminProfile = await prisma.profile.findFirst({ where: { authUserId: admin.id } })
    if (adminProfile) {
      await prisma.organizationMember.upsert({
        where: { organizationId_accountId: { organizationId: org.id, accountId: admin.id } },
        update: { role: 'ADMIN' },
        create: { organizationId: org.id, accountId: admin.id, profileId: adminProfile.id, role: 'ADMIN' },
      })
    }
  }

  // Seed Institutional Members of CNPP
  const institutions = [
    {
      name: 'Ministerio de Relaciones Exteriores',
      acronym: 'MRE',
      websiteUrl: 'https://www.gob.pe/rree',
      principalName: 'Embajador(a) Director(a) de Medio Ambiente',
      principalEmail: 'dma@rree.gob.pe',
      principalRole: 'Presidencia de la CNPP',
    },
    {
      name: 'Ministerio del Ambiente',
      acronym: 'MINAM',
      websiteUrl: 'https://www.gob.pe/minam',
      principalName: 'Viceministro(a) de Desarrollo Estratégico',
      principalEmail: 'contacto@minam.gob.pe',
      principalRole: 'Miembro Titular',
    },
    {
      name: 'Servicio Nacional Forestal y de Fauna Silvestre',
      acronym: 'SERFOR',
      websiteUrl: 'https://www.gob.pe/serfor',
      principalName: 'Director(a) Ejecutivo(a)',
      principalEmail: 'informes@serfor.gob.pe',
      principalRole: 'Miembro Titular',
    },
    {
      name: 'Instituto de Investigaciones de la Amazonía Peruana',
      acronym: 'IIAP',
      websiteUrl: 'https://www.gob.pe/iiap',
      principalName: 'Presidente(a) Ejecutivo(a)',
      principalEmail: 'presidencia@iiap.gob.pe',
      principalRole: 'Miembro Titular',
    },
  ]

  for (const inst of institutions) {
    const existing = await prisma.institutionMember.findFirst({
      where: { organizationId: org.id, acronym: inst.acronym },
    })
    if (!existing) {
      await prisma.institutionMember.create({
        data: {
          organizationId: org.id,
          ...inst,
          isActive: true,
        },
      })
    }
  }

  console.log(`Organización ${org.name} (${org.slug}) e instituciones miembros listas.`)
}

main().finally(() => prisma.$disconnect())
