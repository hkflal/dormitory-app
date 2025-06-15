# Firebase Deployment Script for Next.js App
Write-Host "Starting Firebase deployment process..." -ForegroundColor Green

# Clean previous builds
Write-Host "Cleaning previous builds..." -ForegroundColor Yellow
if (Test-Path "out") {
    Remove-Item -Recurse -Force "out"
    Write-Host "Removed existing 'out' directory" -ForegroundColor Yellow
}

if (Test-Path ".next") {
    Remove-Item -Recurse -Force ".next"
    Write-Host "Removed existing '.next' directory" -ForegroundColor Yellow
}

# Install dependencies
Write-Host "Installing dependencies..." -ForegroundColor Yellow
npm install

# Build the Next.js app for static export
Write-Host "Building Next.js app..." -ForegroundColor Yellow
npm run build

# Check if build was successful
if (Test-Path "out") {
    Write-Host "Build successful! 'out' directory created." -ForegroundColor Green
} else {
    Write-Host "Build failed! 'out' directory not found." -ForegroundColor Red
    exit 1
}

# Deploy functions and hosting to Firebase
Write-Host "Deploying to Firebase..." -ForegroundColor Yellow
firebase deploy

Write-Host "Deployment completed!" -ForegroundColor Green