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
- Protected organizer bootstrap login
- Event create/edit and publication workflow
- Race, category, wave, and multi-level capacity configuration
- Public/private event visibility with rotatable private links
- Staff memberships and role permission matrix
- Audit records for organizer changes
- Capacity, RBAC, registration lifecycle, and team-rule unit tests

Phase 3 automatically confirms new completed registrations while all configured capacity levels have space, otherwise it waitlists them. Cancelling or manually waitlisting a confirmed registration releases its capacity and promotes eligible athletes in submission order. Confirmation email and WalletWallet issuance begin in Phase 4.

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

Apply migrations before deploying. Phase 3 adds `0004_phase_3_registration_engine.sql`.

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

## Planned secrets

```text
SESSION_SECRET
OTP_HASH_SECRET
FIELD_ENCRYPTION_KEY
RESEND_API_KEY
WALLETWALLET_API_KEY
ORGANIZER_SETUP_TOKEN
ORGANIZER_EMAIL
```

## Phase 3 deployment order

1. Preserve the real D1 `database_id` already present in your deployed `wrangler.jsonc`.
2. Run `./upgrade-phase3.ps1` once after extracting the ZIP over Phase 2.
3. Install dependencies and run `npm test`, `npm run typecheck`, and `npm run build`.
4. Run `npm run db:migrate:remote` before pushing the application code.
5. Commit and push; let Cloudflare deploy from GitHub. Phase 3 has no new secrets.
6. Open each race in the event editor and choose its allowed individual, team, and relay entry modes.
7. Use **Registrations** to confirm any Phase 2 registrations that were already stored as `submitted`; new Phase 3 registrations are processed automatically.
8. Test an individual registration, a captain-created team, a join-code registration, cancellation, and waitlist promotion before opening the feature publicly.
