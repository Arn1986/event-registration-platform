import { env } from "cloudflare:workers";
import { escapeHtml, sendTransactionalEmail } from "../email/email-provider.server";
import { sha256 } from "../security/crypto.server";
import { buildWalletDeliveryUrl, issueWalletPass, revokeWalletPass, syncWalletPass, walletDeliveryConfigured } from "../wallet/wallet-service.server";

type MessageType = "confirmation" | "waitlist" | "cancellation" | "event_update" | "wallet_delivery";
type RegistrationMessage = {
  id: string; email: string; firstName: string; registrationReference: string; status: string;
  confirmedAt: string | null; updatedAt: string; eventName: string; eventStartsAt: string; venueName: string;
  raceName: string; categoryName: string | null; waveName: string | null; bibNumber: string | null;
};

const database = () => env.DB;
const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

async function loadRegistration(registrationId: string) {
  return database().prepare(`SELECT r.id, r.registration_reference AS registrationReference, r.status, r.confirmed_at AS confirmedAt,
    r.updated_at AS updatedAt, r.bib_number AS bibNumber, u.email, p.first_name AS firstName,
    e.name AS eventName, e.starts_at AS eventStartsAt, e.venue_name AS venueName, race.name AS raceName,
    c.name AS categoryName, w.name AS waveName
    FROM registrations r
    JOIN athlete_profiles p ON p.id = r.athlete_profile_id
    JOIN users u ON u.id = p.user_id
    JOIN events e ON e.id = r.event_id
    JOIN races race ON race.id = r.race_id
    LEFT JOIN categories c ON c.id = r.category_id
    LEFT JOIN waves w ON w.id = r.wave_id
    WHERE r.id = ?`).bind(registrationId).first<RegistrationMessage>();
}

async function alreadySent(dedupeKey: string) {
  return Boolean(await database().prepare("SELECT id FROM communication_logs WHERE dedupe_key = ? AND status = 'sent'").bind(dedupeKey).first());
}

async function recordDelivery(input: { registrationId: string; messageType: MessageType; channel: "email" | "wallet"; provider: string; status: "sent" | "failed" | "skipped"; externalId?: string; error?: string; dedupeKey: string }) {
  const timestamp = now();
  await database().prepare(`INSERT INTO communication_logs
    (id, registration_id, message_type, channel, provider, status, external_id, error_message, dedupe_key, created_at, sent_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(dedupe_key) DO UPDATE SET status = excluded.status, external_id = excluded.external_id,
    error_message = excluded.error_message, sent_at = excluded.sent_at`)
    .bind(id("delivery"), input.registrationId, input.messageType, input.channel, input.provider, input.status,
      input.externalId ?? null, input.error?.slice(0, 500) ?? null, input.dedupeKey, timestamp, input.status === "sent" ? timestamp : null).run();
}

async function sendEmail(registration: RegistrationMessage, input: { type: MessageType; subject: string; title: string; paragraphs: string[]; buttonLabel?: string; buttonUrl?: string; dedupeSuffix: string }) {
  const dedupeKey = `email/${input.type}/${registration.id}/${input.dedupeSuffix}`;
  if (await alreadySent(dedupeKey)) return true;
  const detailRows = [
    ["Registration", registration.registrationReference], ["Event", registration.eventName], ["Race", registration.raceName],
    ["Starts", formatDubai(registration.eventStartsAt)], ["Venue", registration.venueName],
    ...(registration.bibNumber ? [["Bib", registration.bibNumber]] : []),
  ];
  const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:32px;color:#191434"><p style="color:#6336df;font-weight:700">3F Striders Events</p><h1 style="font-size:32px">${escapeHtml(input.title)}</h1>${input.paragraphs.map((paragraph) => `<p style="line-height:1.65">${escapeHtml(paragraph)}</p>`).join("")}<div style="margin:24px 0;padding:20px;border-radius:16px;background:#f5f4f8">${detailRows.map(([label, value]) => `<p style="margin:8px 0"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`).join("")}</div>${input.buttonUrl && input.buttonLabel ? `<p><a href="${escapeHtml(input.buttonUrl)}" style="display:inline-block;padding:14px 22px;border-radius:999px;background:#c9f43d;color:#1f2707;font-weight:700;text-decoration:none">${escapeHtml(input.buttonLabel)}</a></p>` : ""}<p style="color:#626979;font-size:13px">This is a transactional message about your race registration.</p></div>`;
  try {
    const sent = await sendTransactionalEmail({ to: registration.email, subject: input.subject, html, idempotencyKey: dedupeKey });
    await recordDelivery({ registrationId: registration.id, messageType: input.type, channel: "email", provider: "resend", status: "sent", externalId: sent.id, dedupeKey });
    return true;
  } catch (error) {
    await recordDelivery({ registrationId: registration.id, messageType: input.type, channel: "email", provider: "resend", status: "failed", error: errorMessage(error), dedupeKey });
    return false;
  }
}

export async function deliverConfirmedRegistration(registrationId: string, force = false, deliveryVersion?: string) {
  const registration = await loadRegistration(registrationId);
  if (!registration || registration.status !== "confirmed") return;
  const confirmationVersion = deliveryVersion ?? (force ? crypto.randomUUID() : registration.confirmedAt ?? registration.updatedAt);
  let walletUrl: string | undefined;
  let walletFailed = false;
  const walletDedupe = `wallet/issue/${registration.id}/${registration.confirmedAt ?? "confirmed"}`;
  if (walletDeliveryConfigured()) {
    try {
      const wallet = await issueWalletPass(registration.id);
      walletUrl = await buildWalletDeliveryUrl(registration.id);
      await recordDelivery({ registrationId, messageType: "wallet_delivery", channel: "wallet", provider: "walletwallet", status: "sent", externalId: wallet?.externalSerial, dedupeKey: walletDedupe });
    } catch (error) {
      walletFailed = true;
      await recordDelivery({ registrationId, messageType: "wallet_delivery", channel: "wallet", provider: "walletwallet", status: "failed", error: errorMessage(error), dedupeKey: walletDedupe });
    }
  } else {
    await recordDelivery({ registrationId, messageType: "wallet_delivery", channel: "wallet", provider: "walletwallet", status: "skipped", error: "Wallet delivery is not configured", dedupeKey: walletDedupe });
  }
  const emailSent = await sendEmail(registration, {
    type: "confirmation", subject: `Confirmed: ${registration.eventName}`, title: `You’re confirmed, ${registration.firstName}`,
    paragraphs: ["Your race registration is confirmed.", walletUrl ? "Use the button below to add your QR race pass. iPhone receives an Apple Wallet pass; Android opens Google Wallet directly." : "Your wallet pass is still being prepared. It will also appear on your athlete dashboard."],
    buttonLabel: walletUrl ? "Add race pass to Wallet" : "Open athlete dashboard", buttonUrl: walletUrl ?? `${env.APP_URL}/dashboard`, dedupeSuffix: confirmationVersion,
  });
  if (walletFailed || !emailSent) throw new Error("One or more confirmation deliveries failed");
}

export async function deliverWaitlistNotice(registrationId: string) {
  const registration = await loadRegistration(registrationId); if (!registration) return;
  let walletFailed = false;
  try { await revokeWalletPass(registrationId); }
  catch (error) { walletFailed = true; console.error("Wallet revoke failed", error); }
  const emailSent = await sendEmail(registration, { type: "waitlist", subject: `Waitlist: ${registration.eventName}`, title: "You’re on the waitlist", paragraphs: ["The selected capacity is currently full. We will automatically confirm your place if capacity becomes available."], buttonLabel: "View registration", buttonUrl: `${env.APP_URL}/dashboard`, dedupeSuffix: registration.updatedAt });
  if (walletFailed || !emailSent) throw new Error("One or more waitlist deliveries failed");
}

export async function deliverCancellationNotice(registrationId: string) {
  const registration = await loadRegistration(registrationId); if (!registration) return;
  let walletFailed = false;
  try { await revokeWalletPass(registrationId); }
  catch (error) { walletFailed = true; console.error("Wallet revoke failed", error); }
  const emailSent = await sendEmail(registration, { type: "cancellation", subject: `Cancelled: ${registration.eventName}`, title: "Registration cancelled", paragraphs: ["Your registration has been cancelled and its wallet pass is no longer valid."], buttonLabel: "Open athlete dashboard", buttonUrl: `${env.APP_URL}/dashboard`, dedupeSuffix: registration.updatedAt });
  if (walletFailed || !emailSent) throw new Error("One or more cancellation deliveries failed");
}

export async function deliverRegistrationUpdate(registrationId: string, message: string, deliveryVersion?: string) {
  const registration = await loadRegistration(registrationId); if (!registration || registration.status !== "confirmed") return;
  let walletUrl: string | undefined;
  let walletFailed = false;
  try {
    if (walletDeliveryConfigured()) {
      if (!(await syncWalletPass(registrationId, message))) await issueWalletPass(registrationId);
      walletUrl = await buildWalletDeliveryUrl(registrationId);
    }
  }
  catch (error) { walletFailed = true; console.error("Wallet sync failed", error); }
  const emailSent = await sendEmail(registration, { type: "event_update", subject: `Update: ${registration.eventName}`, title: "Race information updated", paragraphs: [message, "If your pass is already in Apple Wallet or Google Wallet, it will update automatically."], buttonLabel: walletUrl ? "View race pass" : "Open athlete dashboard", buttonUrl: walletUrl ?? `${env.APP_URL}/dashboard`, dedupeSuffix: await sha256(`${deliveryVersion ?? registration.updatedAt}:${message}`) });
  if (walletFailed || !emailSent) throw new Error("One or more update deliveries failed");
}

function formatDubai(value: string) {
  return new Intl.DateTimeFormat("en-AE", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dubai" }).format(new Date(value));
}
function errorMessage(error: unknown) { return error instanceof Error ? error.message : "Delivery failed"; }
