// Lightweight 019 SMS sender (https://docs.019sms.co.il/sms/).
//
// Credentials come from the environment — never hard-code them:
//   SMS_019_TOKEN     - the API token (sent as an Authorization: Bearer header)
//   SMS_019_USERNAME  - the 019 account username
//   SMS_019_SOURCE    - the approved sender ID (max 11 chars, letters/digits)
//   SMS_019_API_URL   - (optional) override the endpoint; defaults to production.
//                       Set to https://019sms.co.il/api/test to validate without
//                       actually sending.
//
// If any credential is missing, sending is skipped and the caller can fall back
// to another delivery method.

const DEFAULT_API_URL = 'https://019sms.co.il/api';

export function isSmsConfigured(): boolean {
  return !!(
    process.env.SMS_019_TOKEN &&
    process.env.SMS_019_USERNAME &&
    process.env.SMS_019_SOURCE
  );
}

interface SendResult {
  ok: boolean;
  error?: string;
}

// Normalizes a phone number to the local Israeli format 019 expects
// (05xxxxxxxx): strips spaces/dashes and converts a +972/972 prefix to a
// leading 0.
function normalizePhone(phone: string): string {
  let p = (phone || '').replace(/[\s-()]/g, '').replace(/^\+/, '');
  if (p.startsWith('972')) p = '0' + p.slice(3);
  return p;
}

async function sendSms(to: string, message: string): Promise<SendResult> {
  const token = process.env.SMS_019_TOKEN;
  const username = process.env.SMS_019_USERNAME;
  const source = process.env.SMS_019_SOURCE;
  if (!token || !username || !source) {
    return { ok: false, error: '019 SMS not configured' };
  }

  const apiUrl = process.env.SMS_019_API_URL || DEFAULT_API_URL;
  const number = normalizePhone(to);

  // 019 expects the payload wrapped in an `sms` object with the account
  // username under `user`. The token goes in the Authorization header.
  const body = {
    sms: {
      user: { username },
      source,
      destinations: { phone: [{ number }] },
      message,
    },
  };

  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => null) as { status?: number | string; message?: string } | null;

    // 019 signals success with status 0 in the response body.
    if (res.ok && data && String(data.status) === '0') {
      return { ok: true };
    }
    const detail = data ? `${data.status}: ${data.message ?? ''}` : `HTTP ${res.status}`;
    return { ok: false, error: `019 SMS ${detail}` };
  } catch (err: any) {
    return { ok: false, error: err?.message || '019 SMS request failed' };
  }
}

// Sends a one-time login code to a diver by SMS. `orgName` is used for branding.
export async function sendOtpSms(to: string, code: string, orgName: string): Promise<SendResult> {
  const message = `${orgName} - קוד האימות שלך הוא ${code}. הקוד תקף לזמן מוגבל.`;
  return sendSms(to, message);
}
