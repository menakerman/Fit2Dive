// Lightweight SendGrid email sender.
//
// Credentials come from the environment — never hard-code them:
//   SENDGRID_API_KEY    - the SendGrid API key
//   SENDGRID_FROM_EMAIL - a sender address verified in the SendGrid account
//   SENDGRID_FROM_NAME  - (optional) sender display name, defaults to org name
//
// If the API key or sender is not configured, sending is skipped and the
// caller can fall back to another delivery method.

const SENDGRID_API_URL = 'https://api.sendgrid.com/v3/mail/send';

export function isEmailConfigured(): boolean {
  return !!(process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM_EMAIL);
}

interface SendResult {
  ok: boolean;
  error?: string;
}

async function sendEmail(to: string, subject: string, text: string, html: string): Promise<SendResult> {
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;
  if (!apiKey || !fromEmail) {
    return { ok: false, error: 'SendGrid not configured' };
  }
  const fromName = process.env.SENDGRID_FROM_NAME || 'Fit2Dive';

  try {
    const res = await fetch(SENDGRID_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: fromEmail, name: fromName },
        subject,
        content: [
          { type: 'text/plain', value: text },
          { type: 'text/html', value: html },
        ],
      }),
    });

    if (res.status >= 200 && res.status < 300) {
      return { ok: true };
    }
    const detail = await res.text().catch(() => '');
    return { ok: false, error: `SendGrid ${res.status}: ${detail}` };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'SendGrid request failed' };
  }
}

// Sends a one-time login code to a diver. `orgName` is used in the branding.
export async function sendOtpEmail(to: string, code: string, orgName: string): Promise<SendResult> {
  const subject = `${orgName} - קוד אימות`;
  const text = `קוד האימות שלך הוא ${code}. הקוד תקף לזמן מוגבל. אם לא ביקשת קוד זה, אפשר להתעלם מהודעה זו.`;
  const html = `
    <div dir="rtl" style="font-family: Arial, sans-serif; text-align: right; color: #1f2937;">
      <h2 style="color:#1e40af; margin-bottom: 8px;">${orgName}</h2>
      <p style="margin: 0 0 16px;">קוד האימות שלך:</p>
      <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color:#1e40af;">${code}</div>
      <p style="color:#6b7280; font-size: 13px; margin-top: 16px;">
        הקוד תקף לזמן מוגבל. אם לא ביקשת קוד זה, אפשר להתעלם מהודעה זו.
      </p>
    </div>`;
  return sendEmail(to, subject, text, html);
}
