# 3F Striders Event Registration Platform

Cloudflare-native race registration for `events.3fstriders.org`.

## Current foundation

- React Router v8 framework mode with server rendering
- Cloudflare Workers and the Cloudflare Vite plugin
- D1-ready Drizzle schema and initial SQL migration
- Public event listing and event detail routes
- Email-verification registration entry screen
- Athlete dashboard access screen
- Organizer overview shell
- Initial capacity decision unit tests

The screens currently use typed example event data. OTP delivery, database repositories, form submission, Resend, and WalletWallet are the next vertical-slice work.

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
```
