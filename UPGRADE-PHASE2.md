# Upgrade from Phase 1

This ZIP is a complete source snapshot. Extract it over the existing repository, preserving your own `wrangler.jsonc`, then run this once in PowerShell:

```powershell
.\upgrade-phase2.ps1
npm install
npm test
npm run typecheck
npm run build
npm run db:migrate:remote
```

The upgrade script removes the obsolete `app/routes/organizer.tsx` file that an ordinary ZIP overlay cannot delete. It does not touch `wrangler.jsonc`, credentials, migrations, or application data.

Add `OTP_HASH_SECRET`, `FIELD_ENCRYPTION_KEY`, `RESEND_API_KEY`, and `EMAIL_FROM` as Cloudflare Worker secrets before pushing to GitHub.

3F Striders Events <events@notification.3fstriders.org>