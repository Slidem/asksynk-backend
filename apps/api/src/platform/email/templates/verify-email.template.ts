import { RenderedEmail } from "../email.types";
import { styles } from "./layout";

export function verifyEmailTemplate(vars: {
  url: string;
  userName?: string;
}): RenderedEmail {
  const greeting = vars.userName ? `Hi ${vars.userName},` : "Hi,";

  return {
    subject: "Verify your email",
    text: `${greeting} Verify your email to use AskSynk: ${vars.url}`,
    html: `<h2 style="${styles.heading}">Verify Your Email</h2>
<p style="${styles.textBody}">${greeting}</p>
<p style="${styles.textMuted}">To start using AskSynk, verify your email address by clicking the button below.</p>
<a href="${vars.url}" style="${styles.button}">Verify Email</a>
<p style="${styles.hint}">If you didn't create an account, you can safely ignore this email.</p>`,
  };
}
