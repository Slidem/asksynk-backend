export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
};
export type MagicLinkTemplate = {
  type: "magic-link";
  url: string;
};

export type VerifyEmailTemplate = {
  type: "verify-email";
  url: string;
  userName?: string;
};

export type EmailTemplate = MagicLinkTemplate | VerifyEmailTemplate;

export type EmailMessage =
  | { to: string; subject: string; text?: string; html?: string }
  | { to: string; template: EmailTemplate };
