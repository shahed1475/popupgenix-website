import type { EmailMessage, EmailSender } from './EmailSender.js';

export class ConsoleEmailSender implements EmailSender {
  async send(message: EmailMessage): Promise<void> {
    console.log(`[ConsoleEmailSender] To: ${message.to} | Subject: ${message.subject}\n${message.text}`);
  }
}
