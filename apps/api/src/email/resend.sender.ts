import { Resend } from 'resend';
import { env } from '../config/env.js';
import type { EmailMessage, EmailSender } from './email.types.js';

/**
 * Resend adapter. Constructed once and reused (in the API and the worker). To
 * move to SES later: add an ses.sender.ts implementing EmailSender and swap
 * which one is wired — nothing that calls send() changes.
 */
export class ResendSender implements EmailSender {
  private readonly resend = new Resend(env.RESEND_API_KEY);

  async send(message: EmailMessage): Promise<void> {
    const { error } = await this.resend.emails.send({
      from: env.EMAIL_FROM,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    // Throw on provider error so the BullMQ job retries with backoff rather
    // than silently dropping a signing invite.
    if (error) throw new Error(`Resend: ${error.message}`);
  }
}
