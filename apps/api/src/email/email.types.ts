export interface EmailAttachment {
  filename: string;
  content: Buffer;
}

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Optional files (the signed PDF + certificate on completion). */
  attachments?: EmailAttachment[];
}

/**
 * The provider boundary. Resend today, SES later — swapping is one new adapter
 * and one wiring line, nothing else in the app changes. Send throws on failure
 * so the worker's retry/backoff can do its job.
 */
export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}
