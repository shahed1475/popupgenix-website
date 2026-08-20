import { describe, expect, it, vi } from 'vitest';
import { ConsoleEmailSender } from './ConsoleEmailSender.js';

describe('ConsoleEmailSender', () => {
  it('logs the message to console.log and resolves', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const sender = new ConsoleEmailSender();

    await sender.send({ to: 'a@drickly.test', subject: 'Verify your email', text: 'Click here: ...' });

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('a@drickly.test')
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Verify your email')
    );
    logSpy.mockRestore();
  });
});
