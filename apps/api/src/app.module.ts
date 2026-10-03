import { Module } from '@nestjs/common';
import { PrismaModule } from './database/prisma.module.js';
import { HealthController } from './health.controller.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { ProfilesModule } from './modules/profiles/profiles.module.js';
import { OrganizationsModule } from './modules/organizations/organizations.module.js';
import { EventsModule } from './modules/events/events.module.js';
import { EditionsModule } from './modules/editions/editions.module.js';
import { ParticipantsModule } from './modules/participants/participants.module.js';
import { CertificatesModule } from './modules/certificates/certificates.module.js';
import { EventContentModule } from './modules/event-content/event-content.module.js';
import { MailModule } from './modules/mail/mail.module.js';
import { RegistrationFormsModule } from './modules/registration-forms/registration-forms.module.js';
import { EmailTemplatesModule } from './modules/email-templates/email-templates.module.js';
import { EmailSettingsModule } from './modules/email-settings/email-settings.module.js';
import { MarketingModule } from './modules/marketing/marketing.module.js';
import { PublicEventsModule } from './modules/public-events/public-events.module.js';
import { MediaModule } from './modules/media/media.module.js';
import { CommissionModule } from './modules/commission/commission.module.js';

@Module({
  imports: [
    PrismaModule,
    MailModule,
    AuthModule,
    ProfilesModule,
    OrganizationsModule,
    EventsModule,
    EditionsModule,
    ParticipantsModule,
    CertificatesModule,
    EventContentModule,
    RegistrationFormsModule,
    EmailTemplatesModule,
    EmailSettingsModule,
    MarketingModule,
    PublicEventsModule,
    MediaModule,
    CommissionModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
