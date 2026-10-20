import { Module } from '@nestjs/common';
import { RegistrationFormsController } from './registration-forms.controller.js';
import { RegistrationFormsService } from './registration-forms.service.js';
import { MarketingModule } from '../marketing/marketing.module.js';
import { MailModule } from '../mail/mail.module.js';
import { RegistrationsModule } from '../registrations/registrations.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
@Module({ imports: [MarketingModule, MailModule, RegistrationsModule, NotificationsModule], controllers: [RegistrationFormsController], providers: [RegistrationFormsService] })
export class RegistrationFormsModule {}
