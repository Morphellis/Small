# Run locally after revoking any bot token previously shared in chat.
# The token is entered without echo and is sent only to api.telegram.org.
$ErrorActionPreference = 'Stop'
$secureToken = Read-Host 'New bot token (hidden input)' -AsSecureString
$botToken = [System.Net.NetworkCredential]::new('', $secureToken).Password
$webhookSecret = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
$webhookUrl = 'https://small.morphellis.workers.dev/api/telegram/webhook'
try {
  if ($botToken -notmatch '^\d+:[A-Za-z0-9_-]+$') { throw 'Invalid token format.' }
  Write-Host ''
  Write-Host 'In Cloudflare: small -> Settings -> Runtime variables and secrets -> Add variable'
  Write-Host 'Type: Secret; Name: TELEGRAM_WEBHOOK_SECRET; Value:'
  Write-Host $webhookSecret
  Write-Host ''
  Read-Host 'Save and deploy that secret in Cloudflare, then press Enter here' | Out-Null
  # Verify the deployed endpoint before registering it with Telegram.
  $probe = Invoke-RestMethod -Method Post -Uri $webhookUrl -ContentType 'application/json' `
    -Headers @{ 'X-Telegram-Bot-Api-Secret-Token' = $webhookSecret } -Body '{"update_id":0}'
  if (-not $probe.ok) { throw 'Webhook check failed.' }
  $payload = @{ url = $webhookUrl; secret_token = $webhookSecret; allowed_updates = @('message') } | ConvertTo-Json -Compress
  $result = Invoke-RestMethod -Method Post -Uri "https://api.telegram.org/bot$botToken/setWebhook" `
    -ContentType 'application/json' -Body $payload
  if (-not $result.ok) { throw 'Telegram rejected webhook registration.' }
  Write-Host 'Connected. Open your bot and send /start to test the button.'
} catch {
  # Never echo exceptions containing the Bot API URL (it includes the token).
  Write-Host 'Connection failed. Check the saved Cloudflare secret, deployment and bot token, then run this script again.'
  exit 1
} finally {
  $botToken = $null
  $secureToken.Dispose()
  $webhookSecret = $null
}
