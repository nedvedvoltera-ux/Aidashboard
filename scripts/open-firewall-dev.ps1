# Разрешить входящие подключения в режиме разработки (порт 5173)
# Запускать PowerShell от имени администратора

$port = 5173
$ruleName = "Aidashboard Dev TCP $port"

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
Write-Host "Запустите dev-сервер: npm run dev"
