#!/usr/bin/env pwsh
# Build Azure Functions Host for Windows with Python worker included.
# This patches the upstream repo to remove the Windows exclusion for Python worker.

param(
    [string]$HostTag = "v4.1047.100",
    [string]$OutputDir = "$PSScriptRoot\..\cdn-server\hosts"
)

$ErrorActionPreference = "Stop"
$env:DOTNET_ROLL_FORWARD = "latestMajor"

$RID = "win-x64"
$HostDir = "$PSScriptRoot\azure-functions-host"
$Version = $HostTag -replace '^v', ''

Write-Host "Building host $Version for $RID" -ForegroundColor Cyan
Write-Host "Output: $OutputDir\$Version" -ForegroundColor Cyan
Write-Host ""

# Clone if needed
if (-not (Test-Path $HostDir)) {
    Write-Host "Cloning azure-functions-host..." -ForegroundColor Yellow
    git clone https://github.com/Azure/azure-functions-host.git $HostDir
}

Push-Location $HostDir
try {
    # Fetch and checkout tag
    git fetch --tags
    git checkout $HostTag --quiet
    Write-Host "Checked out $HostTag" -ForegroundColor Green

    # Patch global.json for SDK compatibility
    if (Test-Path "global.json") {
        $content = Get-Content "global.json" -Raw
        $content = $content -replace '"rollForward": "[^"]*"', '"rollForward": "latestMajor"'
        Set-Content "global.json" $content
        Write-Host "✓ Patched global.json for SDK compatibility" -ForegroundColor Green
    }

    # CRITICAL: Patch to include Python worker on Windows
    $pythonProps = "eng\build\Workers.Python.props"
    if (Test-Path $pythonProps) {
        $content = Get-Content $pythonProps -Raw
        # Remove: Condition="!$(RuntimeIdentifier.StartsWith('win'))"
        $content = $content -replace 'Condition="\!\$\(RuntimeIdentifier\.StartsWith\(''win''\)\)"\s*', ''
        Set-Content $pythonProps $content
        Write-Host "✓ Patched Workers.Python.props to INCLUDE Python worker on Windows" -ForegroundColor Green
        Write-Host "  (Removed Windows exclusion condition)" -ForegroundColor DarkGray
        Get-Content $pythonProps
    } else {
        Write-Host "⚠ Workers.Python.props not found" -ForegroundColor Yellow
    }

    # Build self-contained
    Write-Host ""
    Write-Host "Building... (this may take a few minutes)" -ForegroundColor Yellow
    $buildOutput = ".\build-output\$Version"
    
    dotnet publish src/WebJobs.Script.WebHost/WebJobs.Script.WebHost.csproj `
        -c Release `
        -r $RID `
        --self-contained `
        -p:PublishReadyToRun=false `
        -o $buildOutput

    # Verify exe exists
    $exeName = "Microsoft.Azure.WebJobs.Script.WebHost.exe"
    if (-not (Test-Path "$buildOutput\$exeName")) {
        throw "Build did not produce $exeName"
    }

    # Verify Python worker was included
    $pythonWorkerDir = "$buildOutput\workers\python"
    if (Test-Path $pythonWorkerDir) {
        Write-Host "✓ Python worker included!" -ForegroundColor Green
        Get-ChildItem $pythonWorkerDir -Directory | ForEach-Object { Write-Host "  - $($_.Name)" -ForegroundColor DarkGray }
    } else {
        Write-Host "⚠ Python worker directory not found - patch may have failed" -ForegroundColor Red
    }

    # Create output directory and zip
    $zipDir = "$OutputDir\$Version"
    $zipFile = "$zipDir\azure-functions-v$Version-$RID.zip"
    
    if (-not (Test-Path $zipDir)) {
        New-Item -ItemType Directory -Path $zipDir -Force | Out-Null
    }

    Write-Host ""
    Write-Host "Creating zip..." -ForegroundColor Yellow
    Compress-Archive -Path "$buildOutput\*" -DestinationPath $zipFile -Force
    
    Write-Host ""
    Write-Host "════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "✓ Build complete!" -ForegroundColor Green
    Write-Host "  Host: $zipFile" -ForegroundColor White
    Write-Host "  Size: $([math]::Round((Get-Item $zipFile).Length / 1MB, 1)) MB" -ForegroundColor White
    Write-Host "════════════════════════════════════════════════════" -ForegroundColor Cyan

} finally {
    Pop-Location
}

Write-Host ""
Write-Host "To test with fnx:" -ForegroundColor Yellow
Write-Host "  1. Extract to ~/.fnx/hosts/$Version/" -ForegroundColor White
Write-Host "  2. Run: fnx start (in a Python function app)" -ForegroundColor White
