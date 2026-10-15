/** Envio de e-mail atrás de uma interface: console em desenvolvimento, SES (ou outro) em produção. */
export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/** Desenvolvimento: o "e-mail" aparece no terminal do servidor, com o link clicável. */
export class ConsoleMailer implements Mailer {
  /**
   * `redactLinks`: em produção sem provedor de e-mail, o link de redefinição não pode ir para o
   * log (quem lê o log tomaria a conta). O e-mail não chega a ninguém; o aviso na subida explica.
   */
  constructor(private opts: { redactLinks?: boolean } = {}) {
    if (opts.redactLinks) console.warn('⚠  Sem provedor de e-mail: os links de redefinição de senha não serão enviados (e não vão para o log).');
  }

  async send(mail: Mail): Promise<void> {
    const text = this.opts.redactLinks ? mail.text.replace(/([?&](?:reset|token)=)[\w-]+/g, '$1[oculto]') : mail.text;
    console.log(`\n✉  Para: ${mail.to}\n   Assunto: ${mail.subject}\n\n${text.replace(/^/gm, '   ')}\n`);
  }
}

/** Testes: guarda as mensagens para conferir. */
export class MemoryMailer implements Mailer {
  readonly sent: Mail[] = [];
  async send(mail: Mail): Promise<void> {
    this.sent.push(mail);
  }
}
