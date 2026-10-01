import { createRequestHandler } from "react-router";
import { dispatchDeliveryMessage, type DeliveryMessage } from "../app/infrastructure/communications/delivery-queue.server";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request) {
    return requestHandler(request);
  },
  async queue(batch: MessageBatch<DeliveryMessage>) {
    for (const message of batch.messages) {
      try {
        await dispatchDeliveryMessage(message.body);
        message.ack();
      } catch (error) {
        console.error("Delivery queue message failed", error);
        message.retry();
      }
    }
  },
} satisfies ExportedHandler<Env, DeliveryMessage>;
