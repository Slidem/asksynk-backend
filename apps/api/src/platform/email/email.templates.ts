import { EmailTemplate, RenderedEmail } from "@/api/platform/email/email.types";
import { wrapHtml } from "@/api/platform/email/templates/layout";
import { magicLinkTemplate } from "@/api/platform/email/templates/magic-link.template";
import { networkInviteTemplate } from "@/api/platform/email/templates/network-invite.template";
import { verifyEmailTemplate } from "@/api/platform/email/templates/verify-email.template";

export function renderTemplate(
  template: EmailTemplate,
  appUrl?: string,
): RenderedEmail {
  switch (template.type) {
    case "magic-link": {
      const rendered = magicLinkTemplate({ url: template.url });
      return {
        ...rendered,
        html: wrapHtml(rendered.html, appUrl),
      };
    }

    case "verify-email": {
      const rendered = verifyEmailTemplate({
        url: template.url,
        userName: template.userName,
      });
      return {
        ...rendered,
        html: wrapHtml(rendered.html, appUrl),
      };
    }

    case "network-invite": {
      const rendered = networkInviteTemplate({
        inviterName: template.inviterName,
        acceptUrl: template.acceptUrl,
      });
      return {
        ...rendered,
        html: wrapHtml(rendered.html, appUrl),
      };
    }
  }
}
