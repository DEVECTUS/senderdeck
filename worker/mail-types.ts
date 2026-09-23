export interface Address {
  email: string;
  name?: string;
}

export interface AttachmentInput {
  filename: string;
  contentType: string;
  contentBase64: string;
  /** Bare CID referenced by an HTML img src="cid:..."; implies inline disposition. */
  contentId?: string;
}

export interface AttachmentInfo {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  contentId?: string;
  isInline?: boolean;
}

export interface MessageSummary {
  accountId: string;
  provider: "google" | "microsoft";
  messageId: string;
  threadId?: string;
  subject: string;
  from: string;
  to: string[];
  receivedAt?: string;
  snippet: string;
  hasAttachments: boolean;
}

export interface MessageDetail extends MessageSummary {
  cc: string[];
  bodyText: string;
  bodyHtml?: string;
  attachments: AttachmentInfo[];
}

export interface DraftDetail {
  accountId: string;
  provider: "google" | "microsoft";
  draftId: string;
  sender: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  attachments: AttachmentInfo[];
}

export interface DraftInput {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyText: string;
  /** Complete formatted body, including the sender's signature when desired. */
  bodyHtml?: string;
  attachments?: AttachmentInput[];
}
