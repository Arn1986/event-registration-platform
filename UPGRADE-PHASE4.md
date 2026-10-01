# Upgrade from Phase 3

This ZIP is a complete source snapshot. Extract it over the existing repository while preserving your own `wrangler.jsonc`, then run:

```powershell
.\upgrade-phase4.ps1
npm install
```

## 1. Create Cloudflare resources

```powershell
npx wrangler r2 bucket create event-registration-passes
npx wrangler queues create event-registration-delivery
```

Add these top-level properties to your existing `wrangler.jsonc`:

The same fragment is included as `PHASE4-WRANGLER-BINDINGS.jsonc` for easy copying.

```jsonc
"r2_buckets": [
  {
    "binding": "PASSES",
    "bucket_name": "event-registration-passes"
  }
],
"queues": {
  "producers": [
    {
      "binding": "DELIVERY_QUEUE",
      "queue": "event-registration-delivery"
    }
  ],
  "consumers": [
    {
      "queue": "event-registration-delivery",
      "max_batch_size": 10,
      "max_batch_timeout": 5,
      "max_retries": 5
    }
  ]
}
```

Do not make the R2 bucket public. Preserve your existing D1 database ID and all other settings.

## 2. Add secrets

```powershell
npx wrangler secret put WALLETWALLET_API_KEY
npx wrangler secret put WALLET_DOWNLOAD_SECRET
```

Use a new random value of at least 32 bytes for `WALLET_DOWNLOAD_SECRET`.
Keep this value stable because existing first-party wallet links depend on it.

## 3. Validate and migrate

```powershell
npm test
npm run typecheck
npm run build
npm run db:migrate:remote
```

Migration `0005_phase_4_wallet_and_communications.sql` adds bib numbers, wallet artifact metadata, and communication delivery logs. It preserves Phase 3 registrations.

Commit and push to GitHub after the remote migration succeeds. Cloudflare will deploy normally from GitHub.

After deployment, open each existing event and select **Issue/retry race passes** once. This creates wallet passes and sends confirmation delivery for Phase 3 registrations that were already confirmed before Phase 4.

The application ignores WalletWallet's `shareUrl`. Apple pass bytes are delivered directly by `events.3fstriders.org`; Android users are redirected only to the provider-generated `pay.google.com` save URL.
