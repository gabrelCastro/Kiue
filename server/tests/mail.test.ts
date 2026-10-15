import { describe, expect, it, vi } from 'vitest';
import { ConsoleMailer } from '../src/mail';

describe('ConsoleMailer', () => {
  const mail = { to: 'a@example.com', subject: 'Kiuê', text: 'Abra: http://localhost:5173/?reset=AbC_123-xyz' };

  it('em desenvolvimento mostra o link no terminal', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await new ConsoleMailer().send(mail);
    expect(log.mock.calls[0]![0]).toContain('reset=AbC_123-xyz');
    log.mockRestore();
  });

  it('em produção esconde o token: quem lê o log não toma a conta', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await new ConsoleMailer({ redactLinks: true }).send(mail);
    expect(log.mock.calls[0]![0]).not.toContain('AbC_123-xyz');
    expect(log.mock.calls[0]![0]).toContain('reset=[oculto]');
    expect(warn).toHaveBeenCalled();
    log.mockRestore();
    warn.mockRestore();
  });
});
