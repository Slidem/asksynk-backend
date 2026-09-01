import { RenderedEmail } from "../email.types";
import { styles } from "./layout";

export function networkInviteTemplate(vars: {
  inviterName: string;
  acceptUrl: string;
}): RenderedEmail {
  return {
    subject: `${vars.inviterName} invited you to connect on AskSynk`,
    text: `${vars.inviterName} invited you to connect on AskSynk: ${vars.acceptUrl}`,
    html: `<h2 style="${styles.heading}">${vars.inviterName} invited you to connect</h2>
<p style="${styles.textMuted}">Join their network on AskSynk to share calendars and message each other.</p>
<a href="${vars.acceptUrl}" style="${styles.button}">View Invite</a>
<p style="${styles.hint}">If you don't know this person, you can safely ignore this email.</p>`,
  };
}
