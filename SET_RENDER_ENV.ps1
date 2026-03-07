# ═══════════════════════════════════════════════════════════════
#  Kazi Agent — Set Render Environment Variables Automatically
#  Run this script ONCE after getting your Render API key.
#
#  HOW TO GET YOUR RENDER API KEY:
#  1. Go to: https://dashboard.render.com/u/settings#api-keys
#  2. Click "Create API Key"
#  3. Give it a name: "Kazi Setup"
#  4. Copy the key
#  5. Paste it below where it says: PASTE_YOUR_RENDER_API_KEY_HERE
# ═══════════════════════════════════════════════════════════════

$RENDER_API_KEY = "PASTE_YOUR_RENDER_API_KEY_HERE"
$SERVICE_ID     = "srv-d6ltu07afjfc738otmi0"

# ── Environment Variables to Set ──────────────────────────────
$envVars = @(
    @{ key = "GEMINI_API_KEY";    value = "AIzaSyAhXABzuL_lJdI3TvaaySIj_nEakxDhwZo" },
    @{ key = "SUPER_ADMIN_EMAIL"; value = "eugine.micah@outlook.com" },
    @{ key = "JWT_SECRET";        value = "26e5b1a7a964889212fb94825083cb7710118da4fbbc97b2baea3a92a36b855d" },
    @{ key = "ADMIN_API_KEY";     value = "4958b732357131840fb4cde416e322f5d545926144b41fae1e09164b3ef288f4" },
    @{ key = "NODE_ENV";          value = "production" },
    @{ key = "FRONTEND_URL";      value = "https://kazi-agent.vercel.app" },
    @{ key = "JWT_EXPIRES_IN";    value = "30d" },
    @{ key = "MPESA_ENV";         value = "sandbox" }
)

# ── Validate API key was set ───────────────────────────────────
if ($RENDER_API_KEY -eq "PASTE_YOUR_RENDER_API_KEY_HERE") {
    Write-Host ""
    Write-Host "❌  ERROR: You haven't pasted your Render API key yet!" -ForegroundColor Red
    Write-Host ""
    Write-Host "   1. Go to: https://dashboard.render.com/u/settings#api-keys" -ForegroundColor Yellow
    Write-Host "   2. Click 'Create API Key'  →  name it 'Kazi Setup'" -ForegroundColor Yellow
    Write-Host "   3. Copy the key" -ForegroundColor Yellow
    Write-Host "   4. Open this file in Notepad and replace PASTE_YOUR_RENDER_API_KEY_HERE" -ForegroundColor Yellow
    Write-Host "   5. Run the script again" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter to open the Render API Keys page..."
    Start-Process "https://dashboard.render.com/u/settings#api-keys"
    exit 1
}

Write-Host ""
Write-Host "🚀 Setting Render environment variables for kazi-backend..." -ForegroundColor Cyan
Write-Host ""

$headers = @{
    "Authorization" = "Bearer $RENDER_API_KEY"
    "Content-Type"  = "application/json"
    "Accept"        = "application/json"
}

$body = @{ envVars = $envVars } | ConvertTo-Json -Depth 5

try {
    $response = Invoke-RestMethod `
        -Uri "https://api.render.com/v1/services/$SERVICE_ID/env-vars" `
        -Method PUT `
        -Headers $headers `
        -Body $body `
        -ErrorAction Stop

    Write-Host "✅ Environment variables set successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "   Variables configured:" -ForegroundColor White
    foreach ($v in $envVars) {
        $display = if ($v.key -in @("JWT_SECRET","ADMIN_API_KEY","GEMINI_API_KEY")) {
            $v.value.Substring(0,8) + "..."
        } else { $v.value }
        Write-Host "   ✓ $($v.key) = $display" -ForegroundColor Green
    }

    Write-Host ""
    Write-Host "⏳ Render is redeploying kazi-backend with the new variables..." -ForegroundColor Yellow
    Write-Host "   Wait ~2 minutes, then run the migration." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "📋 Next step — Run migration in Render Shell:" -ForegroundColor Cyan
    Write-Host "   1. Go to: https://dashboard.render.com/web/$SERVICE_ID/shell" -ForegroundColor White
    Write-Host "   2. Click 'Connect'" -ForegroundColor White
    Write-Host "   3. Run: npm run db:migrate" -ForegroundColor White
    Write-Host ""
    Write-Host "🔑 Save your Admin API Key (for Claude Code):" -ForegroundColor Magenta
    Write-Host "   4958b732357131840fb4cde416e322f5d545926144b41fae1e09164b3ef288f4" -ForegroundColor Magenta
    Write-Host ""

    Start-Process "https://dashboard.render.com/web/$SERVICE_ID/shell"

} catch {
    Write-Host "❌ Error setting env vars: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    if ($_.Exception.Response.StatusCode -eq 401) {
        Write-Host "   Your API key is invalid. Create a new one at:" -ForegroundColor Yellow
        Write-Host "   https://dashboard.render.com/u/settings#api-keys" -ForegroundColor Yellow
    }
}

Write-Host "Press Enter to exit..."
Read-Host
