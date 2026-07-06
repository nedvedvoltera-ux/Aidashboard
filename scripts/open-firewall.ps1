# Разрешить входящие подключения к Aidashboard (порт 3102)
# Запускать PowerShell от имени администратора

$port = if ($env:PORT) { [int]$env:PORT } else { 3102 }
$ruleName = "Aidashboard TCP $port"

$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if ($existing) {
  Write-Host "Правило '$ruleName' уже существует."
  exit 0
}

New-NetFirewallRule `
  -DisplayName $ruleName `
  -Direction Inbound `
  -Action Allow `
  -Protocol TCP `
  -LocalPort $port `
  -Profile Private, Domain

Write-Host "Готово. Порт $port открыт для сети (Private/Domain профили)."
Write-Host "Запустите сервер: npm run start:lan"
