declare module 'imapflow' {
  export interface ImapAuth {
    user: string;
    pass: string;
  }
  export interface ImapTlsOptions {
    rejectUnauthorized?: boolean;
  }
  export interface ImapMailboxLock {
    release(): void;
  }
  export interface ImapMailboxInfo {
    exists?: number;
  }
  export interface ImapEnvelopeAddress {
    address?: string;
  }
  export interface ImapEnvelope {
    subject?: string[];
    from?: ImapEnvelopeAddress[];
    to?: ImapEnvelopeAddress[];
    date?: Date | number | string;
  }
  export interface ImapFetchEnvelope {
    envelope?: ImapEnvelope;
  }
  export interface ImapFetchSource {
    source?: string | Buffer;
  }
  export interface ImapFlowOptions {
    host: string;
    port: number;
    secure: boolean;
    auth: ImapAuth;
    logger?: boolean | unknown;
    tls?: ImapTlsOptions;
  }
  export class ImapFlow {
    constructor(options: ImapFlowOptions);
    connect(): Promise<void>;
    logout(): Promise<void>;
    authenticated?: boolean;
    mailbox?: ImapMailboxInfo;
    getMailboxLock(box: string): Promise<ImapMailboxLock>;
    search(query: Record<string, unknown>, options?: { uid?: boolean }): Promise<number[]>;
    fetchOne(
      uid: string,
      query: { envelope?: boolean; source?: boolean },
      options?: { uid?: boolean },
    ): Promise<ImapFetchEnvelope | ImapFetchSource | null>;
  }
}
