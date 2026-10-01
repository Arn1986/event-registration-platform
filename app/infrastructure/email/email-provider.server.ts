import { env } from "cloudflare:workers";

type EmailSecrets = { RESEND_API_KEY?: string; EMAIL_FROM?: string };
type EmailMessage = { to: string; subject: string; html: string; idempotencyKey: string };

export interface EmailProvider {
  send(message: EmailMessage): Promise<{ id: string }>;
}

function configuration() { return env as Env & EmailSecrets; }

class ResendEmailProvider implements EmailProvider {
  async send(message: EmailMessage) {
    const config = configuration();
    if (!config.RESEND_API_KEY || !config.EMAIL_FROM) throw new Error("Email delivery is not configured");
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": message.idempotencyKey,
      },
      body: JSON.stringify({ from: config.EMAIL_FROM, to: [message.to], subject: message.subject, html: message.html }),
    });
    const payload = await response.json<{ id?: string; message?: string }>();
    if (!response.ok || !payload.id) throw new Error(payload.message ?? "Email delivery failed");
    return { id: payload.id };
  }
}

export function emailDeliveryConfigured() {
  const config = configuration();
  return Boolean(config.RESEND_API_KEY && config.EMAIL_FROM);
}

export const emailProvider: EmailProvider = new ResendEmailProvider();

export async function sendOtpEmail(to: string, code: string, idempotencyKey: string) {
  const appName = configuration().APP_NAME ?? "3F Striders Events";
  return emailProvider.send({
    to,
    subject: `${code} is your ${appName} verification code`,
    idempotencyKey,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:32px"><p style="color:#6336df;font-weight:700">${escapeHtml(appName)}</p><h1 style="font-size:32px">Your verification code</h1><p>Enter this code to continue. It expires in 10 minutes.</p><p style="font-size:36px;font-weight:800;letter-spacing:8px">${code}</p><p style="color:#626979">If you did not request this code, you can ignore this email.</p></div>`,
  });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}
