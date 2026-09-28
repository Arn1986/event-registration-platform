# 3F Striders Event Registration Platform

Cloudflare-native race registration for `events.3fstriders.org`.

## Current implementation

- React Router v8 framework mode with server rendering
- Cloudflare Workers and the Cloudflare Vite plugin
- D1-ready Drizzle schema and initial SQL migration
- D1-backed public event listing and event detail routes
- Email-verification registration entry screen
- Athlete dashboard access screen
- Protected organizer bootstrap login
- Event create/edit and publication workflow
- Race, category, wave, and multi-level capacity configuration
- Public/private event visibility with rotatable private links
- Staff memberships and role permission matrix
- Audit records for organizer changes
- Capacity, RBAC, and lifecycle unit tests

OTP delivery, full athlete registration, Resend, and WalletWallet begin in Phase 2.

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

Apply migrations before deploying Phase 1. The new migration is `0002_phase_1_events_and_staff.sql`.

## Configure organizer access

Phase 1 uses a temporary, passwordless-bootstrap access key until staff email OTP authentication is connected in Phase 2. Organizer routes refuse access if the required secrets are missing.

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

## Phase 1 deployment order

1. Preserve the real D1 `database_id` already present in your deployed `wrangler.jsonc`.
2. Install dependencies and run all validation commands.
3. Apply the remote D1 migrations.
4. Add the organizer secrets.
5. Commit and push; let Cloudflare deploy from GitHub.
6. Sign in to `/organizer/login`, create a draft event, add at least one race, and publish it.
