import { data, redirect } from "react-router";
import type { Route } from "./+types/wallet-download";
import { getWalletDelivery } from "../infrastructure/wallet/wallet-service.server";

export function headers() {
  return { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const delivery = await getWalletDelivery(params.registrationId, params.token);
  if (!delivery) throw data("Wallet pass not found", { status: 404 });
  const url = new URL(request.url); const requested = url.searchParams.get("wallet"); const userAgent = request.headers.get("user-agent") ?? "";
  const android = /Android/i.test(userAgent); const apple = /iPhone|iPad|iPod/i.test(userAgent);
  if (requested === "google" || (!requested && android)) {
    if (!delivery.wallet.googleSaveUrl) throw data("Google Wallet is unavailable for this pass", { status: 404 });
    const googleUrl = new URL(delivery.wallet.googleSaveUrl);
    if (googleUrl.protocol !== "https:" || googleUrl.hostname !== "pay.google.com" || !googleUrl.pathname.startsWith("/gp/v/save/")) throw data("Google Wallet link is invalid", { status: 502 });
    return redirect(delivery.wallet.googleSaveUrl, { headers: { "Referrer-Policy": "no-referrer", "Cache-Control": "private, no-store" } });
  }
  if (requested === "apple" || (!requested && apple)) {
    if (!delivery.object) throw data("Apple Wallet pass is unavailable", { status: 404 });
    return new Response(delivery.object.body, { headers: {
      "Content-Type": "application/vnd.apple.pkpass",
      "Content-Disposition": `attachment; filename="${safeFilename(delivery.registration.eventName)}.pkpass"`,
      "Content-Length": String(delivery.object.size), "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow",
    } });
  }
  return { eventName: delivery.registration.eventName, raceName: delivery.registration.raceName, hasGoogle: Boolean(delivery.wallet.googleSaveUrl) };
}

export default function WalletDownload({ loaderData }: Route.ComponentProps) {
  return <main className="narrow-page section-space"><section className="confirmation-card wallet-choice"><span className="eyebrow eyebrow-dark">3F Striders race pass</span><h1>{loaderData.eventName}</h1><p>{loaderData.raceName}</p><div className="wallet-buttons"><a className="button button-primary" href="?wallet=apple">Add to Apple Wallet</a>{loaderData.hasGoogle ? <a className="button button-muted" href="?wallet=google" rel="noreferrer">Add to Google Wallet</a> : null}</div><p className="section-help">Open this page on your phone to add the correct pass automatically.</p></section></main>;
}

function safeFilename(value: string) { return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 60) || "race-pass"; }
