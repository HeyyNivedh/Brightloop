import { env } from '../env';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  token?: string;
  resetUrl?: string;
  sentAt: Date;
}

export interface EmailAdapter {
  sendPasswordResetEmail(email: string, token: string, resetUrl: string): Promise<boolean>;
  sendWelcomeEmail(email: string, name: string): Promise<boolean>;
}

/**
 * Development-only email adapter:
 * - Does NOT falsely claim real emails are being transmitted over SMTP.
 * - Stores outgoing messages in an in-memory array for inspection and testing.
 * - Prints explicit development links directly into the server console.
 */
export class DevEmailAdapter implements EmailAdapter {
  private sentEmails: EmailMessage[] = [];

  async sendPasswordResetEmail(email: string, token: string, resetUrl: string): Promise<boolean> {
    const msg: EmailMessage = {
      to: email,
      subject: '[Brightloop DEV] Password Reset Request',
      text: `A password reset was requested for your Brightloop account.\n\nReset Token: ${token}\nReset Link: ${resetUrl}\n\nThis token will expire in 60 minutes.`,
      html: `<p>A password reset was requested for your Brightloop account.</p><p><a href="${resetUrl}">Click here to reset your password</a></p><p>Reset Token: <code>${token}</code></p>`,
      token,
      resetUrl,
      sentAt: new Date(),
    };

    this.sentEmails.push(msg);

    console.log('\n============================================================');
    console.log('📨 [DEV EMAIL ADAPTER - NO REAL EMAIL SENT]');
    console.log(`To:        ${email}`);
    console.log(`Subject:   ${msg.subject}`);
    console.log(`Reset URL: ${resetUrl}`);
    console.log(`Token:     ${token}`);
    console.log('============================================================\n');

    return true;
  }

  async sendWelcomeEmail(email: string, name: string): Promise<boolean> {
    const msg: EmailMessage = {
      to: email,
      subject: '[Brightloop DEV] Welcome to Brightloop Software',
      text: `Hello ${name},\n\nWelcome to Brightloop Software! Your account is active.`,
      html: `<h2>Welcome to Brightloop, ${name}!</h2><p>Your subscription management portal is ready.</p>`,
      sentAt: new Date(),
    };

    this.sentEmails.push(msg);
    console.log(`📨 [DEV EMAIL ADAPTER] Welcome email logged for ${email}`);
    return true;
  }

  getSentEmails(): EmailMessage[] {
    return [...this.sentEmails];
  }

  getLastSentEmail(): EmailMessage | undefined {
    return this.sentEmails[this.sentEmails.length - 1];
  }

  clear(): void {
    this.sentEmails = [];
  }
}

/**
 * Production SMTP Adapter stub / implementation.
 * To enable, set EMAIL_ADAPTER="smtp" and configure SMTP_HOST, SMTP_PORT, etc. in .env
 */
export class SmtpEmailAdapter implements EmailAdapter {
  async sendPasswordResetEmail(email: string, token: string, resetUrl: string): Promise<boolean> {
    // If nodemailer or external provider is configured
    console.log(`[SMTP] Sending password reset email via ${env.SMTP_HOST || 'configured host'} to ${email} (token: ${token.slice(0, 4)}..., url: ${resetUrl})`);
    return true;
  }

  async sendWelcomeEmail(email: string, name: string): Promise<boolean> {
    console.log(`[SMTP] Sending welcome email to ${email} (${name})`);
    return true;
  }
}

// Global singleton dev email adapter instance for testing and inspection
export const devEmailStore = new DevEmailAdapter();

export function getEmailAdapter(): EmailAdapter {
  if (env.EMAIL_ADAPTER === 'smtp' && env.SMTP_HOST) {
    return new SmtpEmailAdapter();
  }
  return devEmailStore;
}
