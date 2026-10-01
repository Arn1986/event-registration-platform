# 3F Striders Event Registration Platform

Cloudflare-native race registration for `events.3fstriders.org`.

## Current implementation

- React Router v8 framework mode with server rendering
- Cloudflare Workers and the Cloudflare Vite plugin
- D1-ready Drizzle schema and initial SQL migration
- D1-backed public event listing and event detail routes
- Email-verification registration entry screen
- Resend-backed six-digit email OTP with expiry, attempt limits, and request throttling
- D1-backed, revocable athlete sessions
- Reusable athlete profiles with an explicit review step on every registration
- Encrypted medical notes and sensitive custom answers
- Versioned registration form builder and immutable published forms
- Versioned participant waivers with checksum-backed consent records
- Minor detection on event day and separate guardian OTP consent
- Atomic event, race, category, and wave capacity allocation with automatic waitlisting
- Individual, team, and relay entry modes per race
- Captain-created teams, organizer-created teams, join codes, and email invitations
- Athlete team dashboard with member roster, invite controls, and rotatable join codes
- Athlete dashboard with registration references, confirmation state, team links, and cancellation
- Organizer registration search, review, status control, and status history
- Organizer team creation, invitation, join-code rotation, and registration assignment
- Automatic confirmation, waitlist, cancellation, bib, and event-update emails
- WalletWallet-backed Apple Wallet and Google Wallet race passes with QR registration references
- First-party pass delivery on `events.3fstriders.org`; WalletWallet hosted share links are never stored or exposed
- Private Apple `.pkpass` storage in R2 and direct Google Wallet redirects to `pay.google.com`
- Pass issue, update, revoke, delivery logging, retries, and organizer delivery controls
- Cloudflare Queue-backed asynchronous delivery with a safe synchronous local fallback
- Protected organizer bootstrap login
- Event create/edit and publication workflow
- Race, category, wave, and multi-level capacity configuration
- Public/private event visibility with rotatable private links
- Staff memberships and role permission matrix
- Audit records for organizer changes
- Capacity, RBAC, registration lifecycle, and team-rule unit tests

Phase 4 issues a wallet pass as soon as a registration is confirmed. Bib assignments and event-detail changes update installed passes; waitlisting or cancellation revokes them. Athletes receive only first-party `events.3fstriders.org` pass links.

## Local setup on Windows

Open PowerShell in the project directory:

```powershell
npm install
npm run db:migrate:local
npm run dev
```

The development server prints its local URL, normally `http://localhost:5173`.

## Validation

```powershell
npm run typecheck
npm test
npm run build
```

## Create the Cloudflare D1 database

Do this once after signing in to Wrangler:

```powershell
npx wrangler login
npx wrangler d1 create event-registration-platform
```

Copy the returned database ID into `wrangler.jsonc`, replacing `replace-with-your-d1-database-id`, then review and apply the production migration:

```powershell
npm run db:migrate:remote
```

Apply migrations before deploying. Phase 4 adds `0005_phase_4_wallet_and_communications.sql`.

## Configure organizer access

The organizer console continues to use the temporary bootstrap access key in Phase 2. Athlete OTP is separate; staff invitation activation and stronger organizer authentication will follow in a later security milestone. Organizer routes refuse access if the required bootstrap secrets are missing.

```powershell
npx wrangler secret put SESSION_SECRET
npx wrangler secret put ORGANIZER_SETUP_TOKEN
npx wrangler secret put ORGANIZER_EMAIL
```

- `SESSION_SECRET`: use a unique random value of at least 32 bytes.
- `ORGANIZER_SETUP_TOKEN`: use a strong, unique access key and share it only with current organizers.
- `ORGANIZER_EMAIL`: use the initial owner email address.

Optional:

```powershell
npx wrangler secret put ORGANIZER_DEFAULT_ROLE
```

Valid values are `owner`, `admin`, `event_manager`, and `registration_reviewer`. It defaults to `owner`.

After deployment, open `https://events.3fstriders.org/organizer/login`.

## Configure Phase 2 athlete email and encryption

Verify a sending domain in Resend, then add these Worker secrets from PowerShell:

```powershell
npx wrangler secret put OTP_HASH_SECRET
npx wrangler secret put FIELD_ENCRYPTION_KEY
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put EMAIL_FROM
```

- `OTP_HASH_SECRET`: a unique random value of at least 32 bytes, used to hash one-time codes.
- `FIELD_ENCRYPTION_KEY`: a different random value of at least 32 bytes, used to encrypt medical notes and sensitive form answers.
- `RESEND_API_KEY`: the API key from Resend.
- `EMAIL_FROM`: a sender on your verified domain, for example `3F Striders Events <events@send.3fstriders.org>`.

Do not rotate `FIELD_ENCRYPTION_KEY` until a key-version migration is implemented; existing encrypted values depend on it.

## GitHub and Cloudflare deployment

1. Create an empty GitHub repository named `event-registration-platform`.
2. Add it as this repository's `origin` and push the default branch.
3. In Cloudflare Workers Builds, connect the GitHub repository.
4. Set the build command to `npm run build` and deploy command to `npx wrangler deploy`.
5. Add the custom domain `events.3fstriders.org` to the Worker.
6. Store provider credentials as Cloudflare secrets, never in this repository.

Normal updates should be tested locally, committed, and pushed to GitHub so Cloudflare performs the deployment.

## Configure Phase 4 wallet delivery

Create a private R2 bucket and a delivery queue:

```powershell
npx wrangler r2 bucket create event-registration-passes
npx wrangler queues create event-registration-delivery
```

Add these bindings to the top level of your existing `wrangler.jsonc`. Preserve the real D1 binding already in that file:

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

Keep the R2 bucket private. The Worker serves Apple pass bytes only after validating a signed first-party URL.

Add the two Phase 4 secrets:

```powershell
npx wrangler secret put WALLETWALLET_API_KEY
npx wrangler secret put WALLET_DOWNLOAD_SECRET
```

- `WALLETWALLET_API_KEY`: the live WalletWallet API key.
- `WALLET_DOWNLOAD_SECRET`: a new random value of at least 32 bytes used to sign first-party download URLs. Do not reuse another secret.

Do not rotate `WALLET_DOWNLOAD_SECRET` without planning to resend wallet links; existing signed links depend on it.

## Application secrets

```text
SESSION_SECRET
OTP_HASH_SECRET
FIELD_ENCRYPTION_KEY
RESEND_API_KEY
WALLETWALLET_API_KEY
WALLET_DOWNLOAD_SECRET
ORGANIZER_SETUP_TOKEN
ORGANIZER_EMAIL
```

## Phase 4 deployment order

1. Preserve the real D1 `database_id` already present in your deployed `wrangler.jsonc`.
2. Run `./upgrade-phase4.ps1` once after extracting the ZIP over Phase 3.
3. Install dependencies and run `npm test`, `npm run typecheck`, and `npm run build`.
4. Create the R2 bucket and Queue, then add the `PASSES` and `DELIVERY_QUEUE` bindings to `wrangler.jsonc`.
5. Add `WALLETWALLET_API_KEY` and `WALLET_DOWNLOAD_SECRET` as Worker secrets.
6. Run `npm run db:migrate:remote` before pushing the application code.
7. Commit and push; let Cloudflare deploy from GitHub.
8. For events with existing confirmed Phase 3 registrations, select **Issue/retry race passes** once.
9. Confirm a test registration on an iPhone and Android device. Verify that Apple receives a `.pkpass` from your domain and Android redirects directly to `pay.google.com`.
10. Assign a bib and edit the event details to verify that the installed pass and transactional email update.
