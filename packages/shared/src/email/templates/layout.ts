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
    .replace(/\n\s*/g, "") // Remove newlines and leading/trailing whitespace
    .replace(/>\s+</g, "><") // Remove whitespace between tags
    .replace(/\s{2,}/g, " ") // Replace multiple spaces with a single space
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
<body style="margin:0;padding:0;background-color:#ffffff;font-family:'Open Sans',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#ffffff;">
    <tr>
      <td align="center" style="padding:40px 0;">
        <table role="presentation" align="center" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;margin:0 auto;">
          <tr>
            <td align="center" style="background-color:#222833;border-radius:0.7rem;padding:40px;color:#fafcff;font-family:'Open Sans',Arial,sans-serif;font-size:16px;line-height:1.6;text-align:center;">
              ${content}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 0;text-align:center;color:#8697b5;font-family:'Open Sans',Arial,sans-serif;font-size:13px;">
              ${footerLink}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`);
}
