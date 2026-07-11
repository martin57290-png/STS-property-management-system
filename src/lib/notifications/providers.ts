/**
 * Email and SMS transport providers. Real transports (Resend, Twilio) are
 * called through their REST APIs; mock transports log to the console so the
 * app runs end-to-end with no credentials.
 */

export interface EmailProvider {
  send(to: string, subject: string, body: string): Promise<void>;
}

export interface SmsProvider {
  send(to: string, body: string): Promise<void>;
}

export class MockEmailProvider implements EmailProvider {
  async send(to: string, subject: string, body: string): Promise<void> {
    console.log(`[mock email] to=${to} subject="${subject}"\n${body}\n`);
  }
}

export class MockSmsProvider implements SmsProvider {
  async send(to: string, body: string): Promise<void> {
    console.log(`[mock sms] to=${to}\n${body}\n`);
  }
}

export class ResendEmailProvider implements EmailProvider {
  async send(to: string, subject: string, body: string): Promise<void> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'no-reply@example.com',
        to: [to],
        subject,
        text: body,
      }),
    });
    if (!res.ok) {
      throw new Error(`Resend API error ${res.status}: ${await res.text()}`);
    }
  }
}

export class TwilioSmsProvider implements SmsProvider {
  async send(to: string, body: string): Promise<void> {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM_NUMBER;
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: from || '', Body: body }),
    });
    if (!res.ok) {
      throw new Error(`Twilio API error ${res.status}: ${await res.text()}`);
    }
  }
}

export function getEmailProvider(): EmailProvider {
  return process.env.EMAIL_DRIVER === 'resend' && process.env.RESEND_API_KEY
    ? new ResendEmailProvider()
    : new MockEmailProvider();
}

export function getSmsProvider(): SmsProvider {
  return process.env.SMS_DRIVER === 'twilio' && process.env.TWILIO_ACCOUNT_SID
    ? new TwilioSmsProvider()
    : new MockSmsProvider();
}
