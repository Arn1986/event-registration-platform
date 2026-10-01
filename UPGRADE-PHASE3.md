# Upgrade from Phase 2

This ZIP is a complete source snapshot. Extract it over the existing repository while preserving your own `wrangler.jsonc`, then run this once in PowerShell:

```powershell
.\upgrade-phase3.ps1
npm install
npm test
npm run typecheck
npm run build
npm run db:migrate:remote
```

Phase 3 has no new Worker secrets. Migration `0004_phase_3_registration_engine.sql` adds the registration engine, atomic capacity reservations, status history, teams, members, and invitations. It preserves existing athlete, event, form, waiver, and registration data.

After pushing to GitHub and allowing Cloudflare to deploy:

1. Open an event in the organizer console.
2. Configure **Entry modes** for every race that should support team or relay registration.
3. Open **Registrations** and confirm any existing Phase 2 entries still marked `submitted`.
4. Use **Teams** to create organizer-managed teams, or let a captain create one during registration.

The upgrade script only removes obsolete pre-Phase-2 source files that an ordinary ZIP overlay cannot delete. It does not touch `wrangler.jsonc`, credentials, migrations, or application data.
