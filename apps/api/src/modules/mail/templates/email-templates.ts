import {
  escapeHtml,
  renderAlert,
  renderBadge,
  renderButton,
  renderEmailLayout,
  renderInfoCard,
} from './template-components.js';
import {
  GeneralNotificationEmailData,
  OrgInvitationEmailData,
  PasswordChangedEmailData,
  ResetPasswordEmailData,
  WelcomeEmailData,
} from '../mail.types.js';

export const emailTemplates = {
  /**
   * Account Creation / Credentials Template
   */
  welcome(data: WelcomeEmailData): { subject: string; html: string; text: string } {
    const subject = 'Tus credenciales de acceso a la plataforma';
    const name = data.recipientName || 'Hola';
    const loginUrl = data.loginUrl || `${process.env.FRONTEND_URL?.split(',')[0] || 'http://localhost:5173'}/login`;

    const credentialItems: Array<{ label: string; value: string; isCode?: boolean }> = [
      { label: 'Correo electrónico', value: data.email },
    ];

    if (data.temporaryPassword) {
      credentialItems.push({
        label: 'Contraseña temporal',
        value: data.temporaryPassword,
        isCode: true,
      });
    }

    if (data.organizationName) {
      credentialItems.push({ label: 'Institución / Organización', value: data.organizationName });
    }

    if (data.role) {
      credentialItems.push({ label: 'Rol asignado', value: data.role });
    }

    const credentialRows = credentialItems.map((item) => `<tr><td style="padding:10px 0;color:#64748b;font-size:13px;font-family:Arial,sans-serif;">${escapeHtml(item.label)}</td><td align="right" style="padding:10px 0;color:#0f172a;font-size:14px;font-weight:700;font-family:Arial,sans-serif;">${item.isCode ? `<span style="display:inline-block;background-color:#eef2ff;border:1px solid #c7d2fe;border-radius:6px;padding:6px 8px;font-family:monospace;color:#3730a3;">${escapeHtml(item.value)}</span>` : escapeHtml(item.value)}</td></tr>`).join('');
    const content = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:0 0 20px 0;font-family:Arial,sans-serif;"><div style="display:inline-block;background-color:#eef2ff;color:#4338ca;border-radius:999px;padding:6px 12px;font-size:12px;font-weight:700;letter-spacing:.4px;">CUENTA CREADA</div><h1 style="margin:18px 0 10px;color:#0f172a;font-size:26px;line-height:32px;font-family:Arial,sans-serif;">Tu acceso está listo</h1><p style="margin:0;color:#475569;font-size:15px;line-height:24px;font-family:Arial,sans-serif;">Hola <strong>${escapeHtml(name)}</strong>, creamos tu cuenta correctamente. Guarda estas credenciales en un lugar seguro.</p></td></tr></table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #dbeafe;border-radius:12px;background-color:#f8fafc;"><tr><td style="padding:20px 22px;"><p style="margin:0 0 8px;color:#334155;font-size:12px;font-weight:700;letter-spacing:.8px;font-family:Arial,sans-serif;">CREDENCIALES DE ACCESO</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${credentialRows}</table></td></tr></table>

      ${
        data.temporaryPassword
          ? renderAlert(
              'Por motivos de seguridad, te recomendamos cambiar esta contraseña temporal inmediatamente después de iniciar sesión por primera vez.',
              'security'
            )
          : ''
      }

      ${renderButton('Iniciar sesión', loginUrl)}

      <p style="margin: 20px 0 0 0; color: #64748b; font-size: 13px; line-height: 1.5;">
        Si no solicitaste esta cuenta, comunícate con el administrador de la institución.
      </p>
    `;

    const html = renderEmailLayout({
      title: subject,
      previewText: `Tus credenciales para ingresar a la plataforma. Correo: ${data.email}`,
      content,
    });

    const text = `Hola ${name},\n\nTu cuenta fue creada con éxito.\n\nCorreo: ${data.email}\n${
      data.temporaryPassword ? `Contraseña temporal: ${data.temporaryPassword}\n` : ''
    }\nInicia sesión aquí: ${loginUrl}\n\nPor seguridad, cambia tu contraseña al iniciar sesión.`;

    return { subject, html, text };
  },

  /**
   * Reset Password Request Template
   */
  resetPassword(data: ResetPasswordEmailData): { subject: string; html: string; text: string } {
    const subject = 'Restablecimiento de contraseña';
    const name = data.recipientName || 'Usuario';
    const minutes = data.expiresInMinutes || 15;

    const content = `
      <h1 class="heading-title" style="margin: 0 0 16px 0; color: #0f172a; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">
        Recuperación de contraseña
      </h1>
      <p style="margin: 0 0 16px 0; color: #334155; font-size: 15px; line-height: 1.6;">
        Hola <strong>${escapeHtml(name)}</strong>, recibimos una solicitud para restablecer la contraseña de tu cuenta.
      </p>
      <p style="margin: 0 0 20px 0; color: #334155; font-size: 15px; line-height: 1.6;">
        Haz clic en el siguiente botón para definir una nueva contraseña:
      </p>

      ${renderButton('Restablecer mi Contraseña', data.resetUrl, '#4f46e5')}

      ${renderAlert(
        `Este enlace es de un solo uso y expirará en ${minutes} minutos por razones de seguridad.`,
        'warning'
      )}

      <p style="margin: 20px 0 8px 0; color: #64748b; font-size: 13px; line-height: 1.5;">
        Si el botón no funciona, copia y pega este enlace en tu navegador web:
      </p>
      <p style="margin: 0 0 20px 0; word-break: break-all; font-size: 12px; color: #4f46e5;">
        <a href="${escapeHtml(data.resetUrl)}" style="color: #4f46e5;">${escapeHtml(data.resetUrl)}</a>
      </p>

      <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; margin-top: 24px;">
        <p style="margin: 0; color: #94a3b8; font-size: 12px; line-height: 1.5;">
          🛡️ <strong>¿No fuiste tú?</strong> Si no solicitaste este cambio, puedes ignorar este mensaje de forma segura. Tu contraseña actual no cambiará.
        </p>
      </div>
    `;

    const html = renderEmailLayout({
      title: subject,
      previewText: `Solicitud para restablecer tu contraseña. El enlace vence en ${minutes} minutos.`,
      content,
    });

    const text = `Hola ${name},\n\nRecibimos una solicitud para restablecer tu contraseña.\n\nRestablece tu contraseña accediendo al siguiente enlace:\n${data.resetUrl}\n\nEste enlace expira en ${minutes} minutos.\nSi no solicitaste este cambio, ignora este mensaje.`;

    return { subject, html, text };
  },

  /**
   * Organization / Workspace Invitation Template
   */
  invitation(data: OrgInvitationEmailData): { subject: string; html: string; text: string } {
    const subject = `Invitación para unirte a ${data.organizationName}`;
    const name = data.recipientName || 'Hola';
    const acceptUrl = data.acceptUrl || `${process.env.FRONTEND_URL?.split(',')[0] || 'http://localhost:5173'}/login`;

    const roleBadges: Record<string, { label: string; variant: 'primary' | 'success' | 'warning' | 'purple' }> = {
      OWNER: { label: 'Propietario', variant: 'purple' },
      ADMIN: { label: 'Administrador', variant: 'primary' },
      EDITOR: { label: 'Editor', variant: 'success' },
      MEMBER: { label: 'Miembro', variant: 'warning' },
    };

    const roleInfo = roleBadges[data.role] || { label: data.role, variant: 'primary' };

    const content = `
      <h1 class="heading-title" style="margin: 0 0 16px 0; color: #0f172a; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">
        ¡Has sido invitado!
      </h1>
      <p style="margin: 0 0 16px 0; color: #334155; font-size: 15px; line-height: 1.6;">
        Hola <strong>${escapeHtml(name)}</strong>, Zyncro te invita a integrarte a la organización <strong>${escapeHtml(data.organizationName)}</strong>.
      </p>

      ${renderInfoCard('Detalles de la invitación', [
        { label: 'Institución', value: data.organizationName },
        { label: 'Rol asignado', value: roleInfo.label },
        ...(data.inviterName ? [{ label: 'Invitado por', value: data.inviterName }] : []),
      ])}

      <div style="text-align: center; margin: 16px 0;">
        ${renderBadge(roleInfo.label, roleInfo.variant)}
      </div>

      ${renderButton('Acceder a la Organización', acceptUrl, '#059669')}

      <p style="margin: 20px 0 0 0; color: #64748b; font-size: 13px; line-height: 1.5;">
        Si ya cuentas con usuario en la plataforma, ingresa con tus credenciales habituales para acceder a la organización.
      </p>
    `;

    const html = renderEmailLayout({
      title: subject,
      previewText: `Invitación a colaborar en ${data.organizationName} con rol de ${roleInfo.label}.`,
      content,
      accentColor: '#059669',
    });

    const text = `Hola ${name},\n\nHas sido invitado a unirte a ${data.organizationName} con el rol de ${roleInfo.label}.\n\nAccede a la plataforma aquí: ${acceptUrl}`;

    return { subject, html, text };
  },

  /**
   * Password Changed Confirmation Template
   */
  passwordChanged(data: PasswordChangedEmailData): { subject: string; html: string; text: string } {
    const subject = 'Tu contraseña ha sido actualizada';
    const name = data.recipientName || 'Usuario';
    const changedAt = data.changedAt || new Date().toLocaleString('es-ES', { timeZone: 'UTC' });

    const content = `
      <h1 class="heading-title" style="margin: 0 0 16px 0; color: #0f172a; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">
        Contraseña actualizada
      </h1>
      <p style="margin: 0 0 16px 0; color: #334155; font-size: 15px; line-height: 1.6;">
        Hola <strong>${escapeHtml(name)}</strong>, te confirmamos que la contraseña para tu cuenta (<strong>${escapeHtml(data.email)}</strong>) ha sido modificada satisfactoriamente.
      </p>

      ${renderAlert('Tu cuenta ahora está protegida con tu nueva contraseña.', 'info')}

      ${renderAlert(
        'Si no reconoces esta actividad o no realizaste este cambio, comunícate de inmediato con el equipo de soporte técnico para proteger tu cuenta.',
        'security'
      )}
    `;

    const html = renderEmailLayout({
      title: subject,
      previewText: 'Confirmación de actualización de contraseña.',
      content,
    });

    const text = `Hola ${name},\n\nTe confirmamos que la contraseña para ${data.email} fue cambiada exitosamente el ${changedAt}.\n\nSi tú no hiciste este cambio, contacta a soporte de inmediato.`;

    return { subject, html, text };
  },

  /**
   * General / Custom Notification Template
   */
  notification(data: GeneralNotificationEmailData): { subject: string; html: string; text: string } {
    const subject = data.title;
    const name = data.recipientName || 'Hola';

    const content = `
      <h1 class="heading-title" style="margin: 0 0 12px 0; color: #0f172a; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">
        ${escapeHtml(data.title)}
      </h1>
      ${
        data.subtitle
          ? `<p style="margin: 0 0 16px 0; color: #64748b; font-size: 16px;">${escapeHtml(data.subtitle)}</p>`
          : ''
      }
      <p style="margin: 0 0 16px 0; color: #334155; font-size: 15px; line-height: 1.6;">
        ${escapeHtml(data.message)}
      </p>

      ${data.details && data.details.length > 0 ? renderInfoCard('Información Adicional', data.details) : ''}

      ${data.actionText && data.actionUrl ? renderButton(data.actionText, data.actionUrl) : ''}
    `;

    const html = renderEmailLayout({
      title: subject,
      previewText: data.subtitle || data.message.slice(0, 80),
      content,
    });

    // El texto plano incluye los detalles: algunos clientes solo muestran esta versión (p. ej. el código).
    const details = (data.details ?? []).map((item) => `${item.label}: ${item.value}`).join('\n');
    const text = `${data.recipientName ? `Hola ${name}` : 'Hola'},\n\n${data.title}\n\n${data.message}\n${details ? `\n${details}\n` : ''}${
      data.actionUrl ? `\nAcción: ${data.actionUrl}` : ''
    }`;

    return { subject, html, text };
  },
};
