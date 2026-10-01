import { env } from "cloudflare:workers";
import { deliverCancellationNotice, deliverConfirmedRegistration, deliverRegistrationUpdate, deliverWaitlistNotice } from "./registration-communications.server";

export type DeliveryMessage =
  | { type: "confirmed"; registrationId: string; force?: boolean; deliveryVersion?: string }
  | { type: "waitlisted"; registrationId: string }
  | { type: "cancelled"; registrationId: string }
  | { type: "registration_updated"; registrationId: string; message: string; deliveryVersion?: string };

type DeliveryEnvironment = Env & { DELIVERY_QUEUE?: Queue<DeliveryMessage> };
const database = () => env.DB;

export async function dispatchDeliveryMessage(message: DeliveryMessage) {
  if (message.type === "confirmed") return deliverConfirmedRegistration(message.registrationId, message.force, message.deliveryVersion);
  if (message.type === "waitlisted") return deliverWaitlistNotice(message.registrationId);
  if (message.type === "cancelled") return deliverCancellationNotice(message.registrationId);
  return deliverRegistrationUpdate(message.registrationId, message.message, message.deliveryVersion);
}

export async function enqueueRegistrationDelivery(message: DeliveryMessage) {
  const queue = (env as DeliveryEnvironment).DELIVERY_QUEUE;
  if (queue) {
    try { await queue.send(message, { contentType: "json" }); return; }
    catch (error) { console.error("Delivery queue publish failed; using inline fallback", error); }
  }
  await dispatchDeliveryMessage(message);
}

export async function enqueueEventUpdate(eventId: string, message: string) {
  const [registrations, event] = await Promise.all([
    database().prepare("SELECT id FROM registrations WHERE event_id = ? AND status = 'confirmed'").bind(eventId).all<{ id: string }>(),
    database().prepare("SELECT updated_at AS updatedAt FROM events WHERE id = ?").bind(eventId).first<{ updatedAt: string }>(),
  ]);
  const messages: DeliveryMessage[] = registrations.results.map((registration) => ({ type: "registration_updated", registrationId: registration.id, message, deliveryVersion: event?.updatedAt }));
  const queue = (env as DeliveryEnvironment).DELIVERY_QUEUE;
  if (queue) {
    try {
      for (let index = 0; index < messages.length; index += 100) await queue.sendBatch(messages.slice(index, index + 100).map((body) => ({ body, contentType: "json" as const })));
      return { attempted: messages.length };
    } catch (error) { console.error("Event delivery queue publish failed; using inline fallback", error); }
  }
  let failed = 0;
  for (const delivery of messages) {
    try { await dispatchDeliveryMessage(delivery); }
    catch (error) { failed += 1; console.error("Inline event delivery failed", error); }
  }
  return { attempted: messages.length, failed };
}

export async function enqueueEventConfirmations(eventId: string) {
  const registrations = await database().prepare("SELECT id FROM registrations WHERE event_id = ? AND status = 'confirmed'").bind(eventId).all<{ id: string }>();
  const messages: DeliveryMessage[] = registrations.results.map((registration) => ({ type: "confirmed", registrationId: registration.id }));
  const queue = (env as DeliveryEnvironment).DELIVERY_QUEUE;
  if (queue) {
    try {
      for (let index = 0; index < messages.length; index += 100) await queue.sendBatch(messages.slice(index, index + 100).map((body) => ({ body, contentType: "json" as const })));
      return { attempted: messages.length };
    } catch (error) { console.error("Confirmation queue publish failed; using inline fallback", error); }
  }
  let failed = 0;
  for (const delivery of messages) {
    try { await dispatchDeliveryMessage(delivery); }
    catch (error) { failed += 1; console.error("Inline confirmation delivery failed", error); }
  }
  return { attempted: messages.length, failed };
}
