import { RenderedEmail } from "../email.types";
import { styles } from "./layout";

export function magicLinkTemplate(vars: { url: string }): RenderedEmail {
  return {
    subject: "Sign in to AskSynk",
    text: `Sign in to AskSynk: ${vars.url}`,
    html: `<h2 style="${styles.heading}">Sign in to AskSynk</h2>
<p style="${styles.textMuted}">Click the button below to sign in to your account.</p>
<a href="${vars.url}" style="${styles.button}">Sign In</a>
<p style="${styles.hint}">If you didn't request this, you can safely ignore this email.</p>`,
  };
}
