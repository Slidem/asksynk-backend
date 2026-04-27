import { EmailTemplate, RenderedEmail } from "./email.types";
import { wrapHtml } from "./templates/layout";
import { magicLinkTemplate } from "./templates/magic-link.template";
import { networkInviteTemplate } from "./templates/network-invite.template";
import { verifyEmailTemplate } from "./templates/verify-email.template";

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
