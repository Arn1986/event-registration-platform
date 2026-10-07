import { data, redirect } from "react-router";
import type { Route } from "./+types/wallet-download";
import { getWalletDelivery } from "../infrastructure/wallet/wallet-service.server";

export async function loader({ params, request }: Route.LoaderArgs) {
  const delivery = await getWalletDelivery(params.registrationId, params.token);
  if (!delivery) throw data("Wallet pass not found", { status: 404 });
  const url = new URL(request.url);
  const requested = url.searchParams.get("wallet");
  const userAgent = request.headers.get("user-agent") ?? "";
  const android = /Android/i.test(userAgent);

  // If Google Wallet is explicitly requested or on Android:
  if (requested === "google" || (!requested && android && delivery.wallet.googleSaveUrl)) {
    if (!delivery.wallet.googleSaveUrl) throw data("Google Wallet is unavailable for this pass", { status: 404 });
    const googleUrl = new URL(delivery.wallet.googleSaveUrl);
    if (googleUrl.protocol !== "https:" || googleUrl.hostname !== "pay.google.com" || !googleUrl.pathname.startsWith("/gp/v/save/")) {
      throw data("Google Wallet link is invalid", { status: 502 });
    }
    return redirect(delivery.wallet.googleSaveUrl, {
      headers: {
        "Referrer-Policy": "no-referrer",
        "Cache-Control": "private, no-cache",
      },
    });
  }

  // Deliver Apple Wallet .pkpass file
  if (!delivery.object) throw data("Apple Wallet pass is unavailable", { status: 404 });
  const arrayBuffer = await delivery.object.arrayBuffer();
  return new Response(arrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.apple.pkpass",
      "Content-Disposition": `attachment; filename="${safeFilename(delivery.registration.eventName)}.pkpass"`,
      "Content-Length": String(arrayBuffer.byteLength),
      "Cache-Control": "private, no-cache",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

function safeFilename(value: string) {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 60) || "race-pass";
}
