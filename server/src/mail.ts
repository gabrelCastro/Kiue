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
  async send(mail: Mail): Promise<void> {
    console.log(`\n✉  Para: ${mail.to}\n   Assunto: ${mail.subject}\n\n${mail.text.replace(/^/gm, '   ')}\n`);
  }
}

/** Testes: guarda as mensagens para conferir. */
export class MemoryMailer implements Mailer {
  readonly sent: Mail[] = [];
  async send(mail: Mail): Promise<void> {
    this.sent.push(mail);
  }
}
