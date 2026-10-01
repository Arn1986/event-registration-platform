$ErrorActionPreference = "Stop"

$requiredFiles = @(
    "migrations/0005_phase_4_wallet_and_communications.sql",
    "app/routes/wallet-download.tsx"
)

foreach ($file in $requiredFiles) {
    if (-not (Test-Path -LiteralPath $file)) {
        throw "Phase 4 source is incomplete. Missing: $file"
    }
}

Write-Host "Phase 4 source is ready. Your wrangler.jsonc was not changed."
Write-Host "Next: create the R2 bucket and Queue, add their bindings, then configure the two wallet secrets."
