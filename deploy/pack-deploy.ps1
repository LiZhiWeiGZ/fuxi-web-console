param(
  [string]$OutputDir = "dist",
  [switch]$IncludeKnowledgeBase,
  [string]$KnowledgeBasePath = "..\ai-lib\knowledge-base"
)

$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
if ([System.IO.Path]::IsPathRooted($OutputDir)) {
  $distRoot = $OutputDir
} else {
  $distRoot = Join-Path $projectRoot $OutputDir
}
$releaseRoot = Join-Path $distRoot "fuxi-web-console-$stamp"

New-Item -ItemType Directory -Force -Path $releaseRoot | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $releaseRoot "server\config") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $releaseRoot "deploy") | Out-Null

$files = @(
  "package.json",
  "server.mjs",
  "Dockerfile",
  "docker-compose.yml",
  ".dockerignore",
  ".env.example",
  ".env.docker.example",
  "README.md",
  "DEPLOY.md"
)

foreach ($file in $files) {
  Copy-Item -LiteralPath (Join-Path $projectRoot $file) -Destination (Join-Path $releaseRoot $file) -Force
}

Copy-Item -LiteralPath (Join-Path $projectRoot "public") -Destination (Join-Path $releaseRoot "public") -Recurse -Force
Copy-Item -LiteralPath (Join-Path $projectRoot "server\config\kb.paths.example.json") -Destination (Join-Path $releaseRoot "server\config\kb.paths.example.json") -Force
Copy-Item -LiteralPath (Join-Path $projectRoot "server\config\model.config.example.json") -Destination (Join-Path $releaseRoot "server\config\model.config.example.json") -Force
Copy-Item -LiteralPath (Join-Path $projectRoot "deploy\nginx.example.conf") -Destination (Join-Path $releaseRoot "deploy\nginx.example.conf") -Force

if ($IncludeKnowledgeBase) {
  $resolvedKb = Resolve-Path (Join-Path $projectRoot $KnowledgeBasePath)
  New-Item -ItemType Directory -Force -Path (Join-Path $releaseRoot "ai-lib") | Out-Null
  Copy-Item -LiteralPath $resolvedKb -Destination (Join-Path $releaseRoot "ai-lib\knowledge-base") -Recurse -Force
}

Write-Host "Deploy package staged at: $releaseRoot"
Write-Host "model.config.local.json and .env are intentionally not copied."
