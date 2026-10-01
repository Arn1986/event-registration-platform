$ErrorActionPreference = "Stop"

$obsoleteFiles = @(
    "app/routes/organizer.tsx",
    "app/domain/events/example-event.ts"
)

foreach ($file in $obsoleteFiles) {
    if (Test-Path -LiteralPath $file) {
        Remove-Item -LiteralPath $file -Force
        Write-Host "Removed obsolete file: $file"
    }
}

Write-Host "Phase 3 source cleanup complete. Your wrangler.jsonc was not changed."
