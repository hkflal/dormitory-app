# PowerShell script to clear Next.js cache and restart development server
# Usage: .\clear-cache.ps1

Write-Host "🧹 Clearing Next.js cache..." -ForegroundColor Yellow

# Stop any running development servers
Write-Host "Stopping any running development servers..." -ForegroundColor Blue
Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -eq "node" } | Stop-Process -Force -ErrorAction SilentlyContinue

# Clear Next.js cache
if (Test-Path ".next") {
    Write-Host "Removing .next directory..." -ForegroundColor Blue
    Remove-Item -Path ".next" -Recurse -Force
    Write-Host "✅ .next directory removed" -ForegroundColor Green
} else {
    Write-Host "ℹ️  .next directory doesn't exist" -ForegroundColor Cyan
}

# Clear node_modules cache (optional)
$clearNodeModules = Read-Host "Do you want to clear node_modules and reinstall? (y/N)"
if ($clearNodeModules -eq "y" -or $clearNodeModules -eq "Y") {
    if (Test-Path "node_modules") {
        Write-Host "Removing node_modules..." -ForegroundColor Blue
        Remove-Item -Path "node_modules" -Recurse -Force
        Write-Host "✅ node_modules removed" -ForegroundColor Green
    }
    
    Write-Host "Reinstalling dependencies..." -ForegroundColor Blue
    npm install
    Write-Host "✅ Dependencies reinstalled" -ForegroundColor Green
}

# Clear npm cache
Write-Host "Clearing npm cache..." -ForegroundColor Blue
npm cache clean --force
Write-Host "✅ npm cache cleared" -ForegroundColor Green

Write-Host ""
Write-Host "🚀 Cache cleared! You can now run:" -ForegroundColor Green
Write-Host "   npm run dev" -ForegroundColor Cyan
Write-Host ""

# Optionally start the development server
$startDev = Read-Host "Start development server now? (Y/n)"
if ($startDev -ne "n" -and $startDev -ne "N") {
    Write-Host "Starting development server..." -ForegroundColor Blue
    npm run dev
} 