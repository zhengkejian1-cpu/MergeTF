# mergePK 工具：本地预览 / 发布 Vercel
# Usage:
#   .\scripts\mergepk-toolkit.ps1           # 交互菜单
#   .\scripts\mergepk-toolkit.ps1 dev       # npx serve 本地预览
#   .\scripts\mergepk-toolkit.ps1 deploy    # commit + push
#   .\scripts\mergepk-toolkit.ps1 redeploy  # 空提交触发 Vercel
#   .\scripts\mergepk-toolkit.ps1 help

param(
  [Parameter(Position = 0)]
  [ValidateSet("menu", "dev", "deploy", "redeploy", "help")]
  [string]$Action = "menu"
)

$ErrorActionPreference = "Stop"
$script:PauseOnExit = $true

function Get-ToolDirectory {
  if ($PSCommandPath) { return (Split-Path -Parent $PSCommandPath) }
  if ($MyInvocation.MyCommand.Path) { return (Split-Path -Parent $MyInvocation.MyCommand.Path) }
  return (Split-Path -Parent ([Diagnostics.Process]::GetCurrentProcess().MainModule.FileName))
}

function Find-ProjectRoot {
  param([string]$StartDir)
  $dir = (Resolve-Path $StartDir).Path
  for ($i = 0; $i -lt 8; $i++) {
    if (Test-Path (Join-Path $dir "index.html")) { return $dir }
    $parent = Split-Path -Parent $dir
    if (-not $parent -or $parent -eq $dir) { break }
    $dir = $parent
  }
  throw "未找到项目根目录（需要 index.html）。"
}

function Pause-IfNeeded {
  if ($script:PauseOnExit) {
    Write-Host ""
    Read-Host "按 Enter 关闭"
  }
}

function Get-DeployConfig {
  param([string]$ScriptsDir)
  $path = Join-Path $ScriptsDir "deploy.config.json"
  if (-not (Test-Path $path)) { throw "缺少 scripts\deploy.config.json" }
  $raw = Get-Content $path -Raw -Encoding UTF8 | ConvertFrom-Json
  return @{
    SiteUrl = $raw.vercel.siteUrl
    Branch  = $raw.github.branch
  }
}

function Show-WorkflowHelp {
  param($Cfg)
  Write-Host ""
  Write-Host "=== mergePK 发布流程 ===" -ForegroundColor Cyan
  Write-Host ""
  Write-Host "1) 本地预览" -ForegroundColor Yellow
  Write-Host "   mergepk.bat dev  -> npx serve ."
  Write-Host ""
  Write-Host "2) 首次发布前" -ForegroundColor Yellow
  Write-Host "   - GitHub 仓库: zhengkejian1-cpu/MergeTF"
  Write-Host "   - Vercel Import 该仓库（静态站点，根目录即站点）"
  Write-Host "   - 编辑 scripts\deploy.config.json 中的地址"
  Write-Host ""
  Write-Host "3) 日常发布" -ForegroundColor Yellow
  Write-Host "   mergepk.bat deploy  -> git add/commit/push -> Vercel 自动部署"
  Write-Host ""
  Write-Host "4) 仅重建线上" -ForegroundColor Yellow
  Write-Host "   mergepk.bat redeploy  -> 空提交 push"
  Write-Host ""
  Write-Host "5) 线上地址: $($Cfg.SiteUrl)" -ForegroundColor Green
  Write-Host ""
}

function Invoke-PsScript {
  param(
    [string]$ScriptPath,
    [string[]]$ScriptArgs = @()
  )
  if (-not (Test-Path $ScriptPath)) { throw "缺少脚本: $ScriptPath" }
  $psArgs = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $ScriptPath) + $ScriptArgs
  & powershell.exe @psArgs
  if ($LASTEXITCODE -ne 0) {
    throw "脚本失败 (exit $LASTEXITCODE): $ScriptPath"
  }
}

function Invoke-Dev {
  param([string]$Root)
  Set-Location $Root
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) {
    $nodePath = "${env:ProgramFiles}\nodejs\node.exe"
    if (Test-Path $nodePath) { $env:Path = "$(Split-Path $nodePath);$env:Path" }
    else { throw "未找到 Node.js，请安装 LTS 版本。" }
  }
  Write-Host "启动本地预览: npx serve ." -ForegroundColor Cyan
  Write-Host "浏览器打开 http://localhost:3000 （或终端显示的端口）" -ForegroundColor DarkGray
  $script:PauseOnExit = $false
  & cmd.exe /c "npx --yes serve ."
}

function Invoke-Deploy {
  param([string]$Root, [switch]$Redeploy)
  $deploy = Join-Path $Root "scripts\deploy-push-ssh.ps1"
  $script:PauseOnExit = $false
  if ($Redeploy) {
    Invoke-PsScript -ScriptPath $deploy -ScriptArgs @("-Redeploy")
  } else {
    Invoke-PsScript -ScriptPath $deploy
  }
}

function Show-Menu {
  param([string]$Root, $Cfg)
  while ($true) {
    Write-Host ""
    Write-Host "=== mergePK 工具 ===" -ForegroundColor Cyan
    Write-Host "项目: $Root"
    Write-Host "线上: $($Cfg.SiteUrl)"
    Write-Host ""
    Write-Host "  1  本地预览 (npx serve)"
    Write-Host "  2  发布: commit + push -> Vercel"
    Write-Host "  3  仅触发 Vercel 重建 (空提交)"
    Write-Host "  4  查看流程说明"
    Write-Host "  0  退出"
    Write-Host ""
    $choice = Read-Host "请选择"
    switch ($choice.Trim()) {
      "1" {
        try { Invoke-Dev -Root $Root } catch { Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red }
      }
      "2" {
        try { Invoke-Deploy -Root $Root } catch { Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red }
      }
      "3" {
        try { Invoke-Deploy -Root $Root -Redeploy } catch { Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red }
      }
      "4" { Show-WorkflowHelp -Cfg $Cfg }
      "0" { return }
      default { Write-Host "无效选项" -ForegroundColor Yellow }
    }
  }
}

$exitCode = 0
try {
  $Root = Find-ProjectRoot (Get-ToolDirectory)
  Set-Location $Root
  $Cfg = Get-DeployConfig -ScriptsDir (Join-Path $Root "scripts")

  switch ($Action) {
    "help" {
      Show-WorkflowHelp -Cfg $Cfg
      $script:PauseOnExit = $false
    }
    "dev" { Invoke-Dev -Root $Root }
    "deploy" { Invoke-Deploy -Root $Root }
    "redeploy" { Invoke-Deploy -Root $Root -Redeploy }
    "menu" { Show-Menu -Root $Root -Cfg $Cfg }
    default { Show-Menu -Root $Root -Cfg $Cfg }
  }
} catch {
  Write-Host ""
  Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
  $exitCode = 1
} finally {
  Pause-IfNeeded
}

exit $exitCode
