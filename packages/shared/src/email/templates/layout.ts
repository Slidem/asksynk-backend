export const styles = {
  heading: `margin:0 0 16px;font-size:22px;font-weight:600;color:#fafcff;`,
  textMuted: `margin:0 0 24px;color:#8697b5;`,
  textBody: `margin:0 0 8px;color:#fafcff;`,
  button: `display:inline-block;padding:12px 24px;background-color:#88db93;color:#0b0f14;text-decoration:none;border-radius:0.7rem;font-weight:600;font-family:'Open Sans',Arial,sans-serif;font-size:16px;`,
  hint: `margin:24px 0 0;color:#8697b5;font-size:13px;`,
  footerLink: `color:#8697b5;text-decoration:none;`,
};

function minifyHtml(html: string): string {
  return html
    .replace(/\n\s*/g, "")
    .replace(/>\s+</g, "><")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function wrapHtml(content: string, appUrl?: string): string {
  const footerLink = appUrl
    ? `<a href="${appUrl}" style="${styles.footerLink}">AskSynk</a>`
    : "AskSynk";

  return minifyHtml(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600&display=swap" rel="stylesheet" />
</head>
<body style="margin:0;padding:0;background-color:#0b0f14;font-family:'Open Sans',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0b0f14;padding:40px 0;">
    <tr>
      <td align="center">
        <div style="max-width:560px;width:100%;background-color:#222833;border-radius:0.7rem;padding:40px;color:#fafcff;font-family:'Open Sans',Arial,sans-serif;font-size:16px;line-height:1.6;">
          ${content}
        </div>
        <div style="max-width:560px;width:100%;padding:24px 0;text-align:center;color:#8697b5;font-family:'Open Sans',Arial,sans-serif;font-size:13px;">
          ${footerLink}
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`);
}
