import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface BrevoRecipient {
  email: string;
  name?: string;
}

export interface SendEmailPayload {
  to: BrevoRecipient[];
  subject: string;
  htmlContent: string;
  textContent?: string;
}

@Injectable()
export class BrevoService {
  private readonly logger = new Logger(BrevoService.name);
  private readonly apiKey: string;
  private readonly senderEmail: string;
  private readonly senderName: string;
  private readonly appUrl: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('brevo.apiKey', '');
    this.senderEmail = this.config.get<string>('brevo.senderEmail', 'notifications@workforce.co.uk');
    this.senderName = this.config.get<string>('brevo.senderName', 'Workforce Platform');
    this.appUrl = this.config.get<string>('brevo.appUrl', 'http://localhost:3000');
  }

  /**
   * Generic asynchronous email dispatcher through Brevo v3 REST API.
   * Runs detached in background to ensure zero latency on HTTP requests.
   */
  async sendEmailAsync(payload: SendEmailPayload): Promise<void> {
    setImmediate(async () => {
      try {
        const recipientsStr = payload.to.map((r) => r.email).join(', ');
        this.logger.log(`[BREVO DISPATCH START] Subject: "${payload.subject}" | To: ${recipientsStr}`);

        if (!this.apiKey || this.apiKey.includes('placeholder')) {
          this.logger.log(
            `[BREVO SIMULATED SUCCESS] ApiKey not set. Email logged locally for recipient: ${recipientsStr}`
          );
          return;
        }

        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'api-key': this.apiKey,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            sender: {
              email: this.senderEmail,
              name: this.senderName,
            },
            to: payload.to,
            subject: payload.subject,
            htmlContent: payload.htmlContent,
            textContent: payload.textContent,
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Brevo HTTP error ${response.status}: ${errText}`);
        }

        const data = await response.json();
        this.logger.log(`[BREVO API SUCCESS] MessageId: ${data?.messageId || 'OK'} -> ${recipientsStr}`);
      } catch (err: any) {
        this.logger.error(`[BREVO DISPATCH ERROR] Failed to send email: ${err.message}`);
      }
    });
  }

  /**
   * Transactional Template: User / Employee Activation Invitation
   */
  async sendInvitationEmail(options: {
    to: string;
    recipientName?: string;
    companyName: string;
    role: string;
    activationToken: string;
    expiresHours?: number;
  }): Promise<void> {
    const expiresHours = options.expiresHours || 72;
    const activationUrl = `${this.appUrl}/activate-invite?token=${encodeURIComponent(options.activationToken)}`;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F5F3FF; margin: 0; padding: 40px 20px; }
          .container { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #E5E3F2; overflow: hidden; box-shadow: 0 4px 12px rgba(108, 92, 231, 0.08); }
          .header { background: #6C5CE7; padding: 28px 24px; text-align: center; color: #ffffff; }
          .header h1 { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }
          .content { padding: 32px 28px; color: #2D3748; line-height: 1.6; }
          .badge { display: inline-block; padding: 4px 10px; background-color: #EDE9FE; color: #6C5CE7; font-weight: 600; font-size: 12px; border-radius: 6px; margin: 8px 0 16px 0; }
          .btn-container { text-align: center; margin: 28px 0; }
          .btn { display: inline-block; background-color: #6C5CE7; color: #ffffff !important; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.3), 0 2px 4px rgba(108, 92, 231, 0.2); }
          .footer { padding: 20px 28px; background-color: #FAFAFA; border-top: 1px solid #E5E3F2; font-size: 12px; color: #718096; text-align: center; }
          .url-fallback { word-break: break-all; color: #6C5CE7; font-size: 12px; margin-top: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Workforce Management Portal</h1>
          </div>
          <div class="content">
            <p>Hello${options.recipientName ? ` <strong>${options.recipientName}</strong>` : ''},</p>
            <p>You have been invited to join <strong>${options.companyName}</strong> on the Workforce Management Platform.</p>
            <div>Your assigned role is:</div>
            <div class="badge">${options.role}</div>
            <p>To accept your invitation and create your account password, click the button below:</p>
            <div class="btn-container">
              <a href="${activationUrl}" class="btn" target="_blank">Activate Account</a>
            </div>
            <p style="font-size: 13px; color: #718096;">This activation link is single-use and expires in <strong>${expiresHours} hours</strong>.</p>
            <div class="url-fallback">
              Or copy this URL into your browser:<br>
              ${activationUrl}
            </div>
          </div>
          <div class="footer">
            &copy; ${new Date().getFullYear()} ${options.companyName} &bull; Powered by Workforce SaaS
          </div>
        </div>
      </body>
      </html>
    `;

    await this.sendEmailAsync({
      to: [{ email: options.to, name: options.recipientName }],
      subject: `Invitation to join ${options.companyName} (${options.role})`,
      htmlContent,
      textContent: `You have been invited to join ${options.companyName} as ${options.role}. Activate your account here: ${activationUrl} (expires in ${expiresHours} hours).`,
    });
  }

  /**
   * Transactional Template: Shift Assigned
   */
  async sendShiftAssignedEmail(options: {
    to: string;
    employeeName: string;
    companyName: string;
    siteName: string;
    shiftDate: string;
    startTime: string;
    endTime: string;
  }): Promise<void> {
    const htmlContent = `
      <div style="font-family: sans-serif; max-width: 500px; margin: auto; padding: 20px; border: 1px solid #E5E3F2; border-radius: 8px;">
        <h2 style="color: #6C5CE7; margin-top: 0;">New Shift Assigned</h2>
        <p>Hi ${options.employeeName},</p>
        <p>A new shift has been scheduled for you at <strong>${options.companyName}</strong>:</p>
        <ul>
          <li><strong>Site:</strong> ${options.siteName}</li>
          <li><strong>Date:</strong> ${options.shiftDate}</li>
          <li><strong>Time:</strong> ${options.startTime} &ndash; ${options.endTime}</li>
        </ul>
        <p>Please check your Employee Portal for full details and site directions.</p>
      </div>
    `;

    await this.sendEmailAsync({
      to: [{ email: options.to, name: options.employeeName }],
      subject: `New Shift Assigned: ${options.siteName} (${options.shiftDate})`,
      htmlContent,
    });
  }
}
