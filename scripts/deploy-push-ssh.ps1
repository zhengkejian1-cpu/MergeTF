# 静态站点：git commit + SSH push -> GitHub -> Vercel 自动部署
# Usage: .\scripts\deploy-push-ssh.ps1 [-Message "msg"] [-Redeploy] [-NoCommit]
# Config: scripts/deploy.config.json

param(
  [string]$Message = "",
  [string]$Branch = $env:DEPLOY_BRANCH,
  [string]$Remote = $(if ($env:DEPLOY_REMOTE) { $env:DEPLOY_REMOTE } else { "origin" }),
  [switch]$AllowEmptyCommit,
  [switch]$Redeploy,
  [switch]$NoCommit
)

$ErrorActionPreference = "Stop"
$IsExe = $PSCommandPath -match '\.exe$'

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

function Pause-IfExe {
  if (-not $IsExe) { return }
  Write-Host ""
  Read-Host "Press Enter to close"
}

function Get-ToolDirectory {
  if ($PSCommandPath) { return (Split-Path -Parent $PSCommandPath) }
  if ($MyInvocation.MyCommand.Path) { return (Split-Path -Parent $MyInvocation.MyCommand.Path) }
  return (Split-Path -Parent ([Diagnostics.Process]::GetCurrentProcess().MainModule.FileName))
}

function Get-DeployConfig {
  param([string]$ScriptsDir)
  $path = Join-Path $ScriptsDir "deploy.config.json"
  if (-not (Test-Path $path)) { throw "缺少 scripts\deploy.config.json" }
  $raw = Get-Content $path -Raw -Encoding UTF8 | ConvertFrom-Json
  return @{
    SshRemote     = if ($env:DEPLOY_GITHUB_SSH) { $env:DEPLOY_GITHUB_SSH } else { $raw.github.sshRemote }
    Branch        = if ($env:DEPLOY_BRANCH) { $env:DEPLOY_BRANCH } else { $raw.github.branch }
    UserName      = if ($env:DEPLOY_GIT_NAME) { $env:DEPLOY_GIT_NAME } else { $raw.github.userName }
    UserEmail     = if ($env:DEPLOY_GIT_EMAIL) { $env:DEPLOY_GIT_EMAIL } else { $raw.github.userEmail }
    VercelProject = $raw.vercel.projectUrl
    SiteUrl       = $raw.vercel.siteUrl
    RepoWeb       = ($raw.github.sshRemote -replace '^git@[^:]+:', 'https://github.com/' -replace '\.git$', '')
    SshHost       = if ($raw.github.sshRemote -match '^git@([^:]+):') { $Matches[1] } else { 'github.com' }
  }
}

function Find-Git {
  $cmd = Get-Command git -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $candidates = @(
    "${env:ProgramFiles}\Git\cmd\git.exe",
    "${env:ProgramFiles(x86)}\Git\cmd\git.exe",
    "$env:LOCALAPPDATA\Programs\Git\cmd\git.exe"
  )
  foreach ($p in $candidates) {
    if (Test-Path $p) { return $p }
  }
  throw "未找到 git，请安装 Git for Windows。"
}

function Invoke-Git {
  param([string[]]$GitArgs)
  & $script:GitExe @GitArgs
  if ($LASTEXITCODE -ne 0) {
    throw "git 失败: git $($GitArgs -join ' ') (exit $LASTEXITCODE)"
  }
}

function Ensure-GitIdentity {
  param($Cfg)
  Write-Host "Git 作者（仅本仓库）:" -ForegroundColor DarkGray
  Write-Host "  $($Cfg.UserName) <$($Cfg.UserEmail)>"
  Invoke-Git -GitArgs @("config", "user.name", $Cfg.UserName)
  Invoke-Git -GitArgs @("config", "user.email", $Cfg.UserEmail)
}

function Ensure-OriginRemote {
  param([string]$RemoteName, [string]$SshUrl)
  $url = ""
  try {
    $url = (Invoke-Git -GitArgs @("remote", "get-url", $RemoteName) | Out-String).Trim()
  } catch {
    $url = ""
  }

  if (-not $url) {
    Write-Host "添加 remote $RemoteName -> $SshUrl" -ForegroundColor Yellow
    Invoke-Git -GitArgs @("remote", "add", $RemoteName, $SshUrl)
    return $SshUrl
  }

  if ($url -ne $SshUrl) {
    if ($url -match '^https://github\.com/(.+?)(?:\.git)?/?$') {
      $path = $Matches[1] -replace '\.git$', ''
      $converted = "git@github.com:$path.git"
      if ($converted -eq $SshUrl) {
        Write-Host "将 $RemoteName 从 HTTPS 改为 SSH: $SshUrl" -ForegroundColor Yellow
        Invoke-Git -GitArgs @("remote", "set-url", $RemoteName, $SshUrl)
        return $SshUrl
      }
    }
    Write-Host "设置 $RemoteName -> $SshUrl" -ForegroundColor Yellow
    Invoke-Git -GitArgs @("remote", "set-url", $RemoteName, $SshUrl)
    return $SshUrl
  }

  if ($url -match '^https://github\.com/(.+?)(?:\.git)?/?$') {
    $path = $Matches[1] -replace '\.git$', ''
    $ssh = "git@github.com:$path.git"
    Write-Host "将 $RemoteName 改为 SSH: $ssh" -ForegroundColor Yellow
    Invoke-Git -GitArgs @("remote", "set-url", $RemoteName, $ssh)
    return $ssh
  }

  Write-Host "Remote ${RemoteName}: $url" -ForegroundColor DarkGray
  return $url
}

function Test-SshGithub {
  param([string]$SshHost, [string]$GitHubUser)
  Write-Host "SSH 测试 ($SshHost，期望: Hi $GitHubUser!) ..." -ForegroundColor Cyan
  $out = (cmd.exe /c "ssh -T git@$SshHost 2>&1").Trim()
  Write-Host $out
  $userPat = [regex]::Escape($GitHubUser)
  if ($out -notmatch "successfully authenticated|Hi $userPat") {
    throw "SSH 未通过。请配置 GitHub SSH 公钥（可与 SSxyx 项目共用 ~/.ssh）。"
  }
  Write-Host "SSH OK" -ForegroundColor Green
}

function Verify-Push {
  param([string]$RemoteName, [string]$BranchName, [string]$RepoWeb)
  $local = (Invoke-Git -GitArgs @("rev-parse", "HEAD") | Out-String).Trim()
  $remoteLine = (git ls-remote $RemoteName "refs/heads/$BranchName" 2>&1 | Out-String).Trim()
  if (-not $remoteLine) {
    throw "git ls-remote 未返回 $BranchName"
  }
  $remote = ($remoteLine -split '\s+')[0]
  if ($local -ne $remote) {
    throw "推送校验失败: local $local != remote $remote"
  }
  Write-Host "推送已校验: $local" -ForegroundColor Green
  Write-Host "  GitHub: $RepoWeb/commit/$local"
}

function Test-StaticSite {
  param([string]$Root)
  $required = @("index.html", "js/main.js", "css/style.css", "vercel.json")
  foreach ($rel in $required) {
    if (-not (Test-Path (Join-Path $Root $rel))) {
      throw "缺少部署文件: $rel"
    }
  }
  Write-Host "静态站点文件检查通过" -ForegroundColor Green
}

$exitCode = 0
try {
  $StartDir = Get-ToolDirectory
  $Root = Find-ProjectRoot $StartDir
  $ScriptsDir = Join-Path $Root "scripts"
  $Cfg = Get-DeployConfig -ScriptsDir $ScriptsDir
  Set-Location $Root

  $GitExe = Find-Git
  $env:Path = "$(Split-Path -Parent $GitExe);$env:Path"

  if (-not $Branch) { $Branch = $Cfg.Branch }

  Write-Host ""
  Write-Host "=== mergePK 部署 (SSH -> GitHub -> Vercel) ===" -ForegroundColor Cyan
  Write-Host "根目录: $Root"
  Write-Host "Remote: $($Cfg.SshRemote)"
  Write-Host "分支:   $Branch"

  if (-not (Test-Path (Join-Path $Root ".git"))) {
    throw @"
尚未初始化 git。请先执行：
  git init -b main
  git add .
  git commit -m "init: mergePK web"
然后在 GitHub 确认仓库 MergeTF 已存在并连接 Vercel。
"@
  }

  Write-Host ""
  Write-Host "[1/4] Git 身份 ..." -ForegroundColor Cyan
  Ensure-GitIdentity -Cfg $Cfg

  Write-Host ""
  Write-Host "[2/4] SSH remote ..." -ForegroundColor Cyan
  $null = Ensure-OriginRemote -RemoteName $Remote -SshUrl $Cfg.SshRemote
  Test-SshGithub -SshHost $Cfg.SshHost -GitHubUser $Cfg.UserName

  Write-Host ""
  Write-Host "[3/4] 静态站点检查（无 build）..." -ForegroundColor Cyan
  Test-StaticSite -Root $Root

  $doEmpty = $AllowEmptyCommit -or $Redeploy
  if (-not $NoCommit) {
    Write-Host ""
    Write-Host "[4/4] git commit ..." -ForegroundColor Cyan
    Invoke-Git -GitArgs @("add", "-A")
    $status = (Invoke-Git -GitArgs @("status", "--porcelain") | Out-String).Trim()
    if (-not $status) {
      if ($doEmpty) {
        if (-not $Message) { $Message = "chore: redeploy $(Get-Date -Format 'yyyy-MM-dd HH:mm')" }
        Invoke-Git -GitArgs @("commit", "--allow-empty", "-m", $Message)
        Write-Host "空提交: $Message" -ForegroundColor Green
      } else {
        Write-Host "没有可提交的改动。使用 redeploy 可触发 Vercel 重建。" -ForegroundColor Yellow
      }
    } else {
      if (-not $Message) {
        $Message = "deploy: " + (Get-Date -Format "yyyy-MM-dd HH:mm")
      }
      Invoke-Git -GitArgs @("commit", "-m", $Message)
      Write-Host "已提交: $Message" -ForegroundColor Green
    }
    $author = (Invoke-Git -GitArgs @("log", "-1", "--format=%an <%ae>") | Out-String).Trim()
    Write-Host "Author: $author" -ForegroundColor DarkGray
  } else {
    Write-Host ""
    Write-Host "[4/4] 跳过 commit (-NoCommit)" -ForegroundColor Yellow
  }

  Write-Host ""
  Write-Host "git push $Remote $Branch ..." -ForegroundColor Cyan
  Invoke-Git -GitArgs @("push", "-u", $Remote, $Branch)
  Verify-Push -RemoteName $Remote -BranchName $Branch -RepoWeb $Cfg.RepoWeb

  Write-Host ""
  Write-Host "完成。" -ForegroundColor Green
  Write-Host "  线上:   $($Cfg.SiteUrl)"
  Write-Host "  Vercel: $($Cfg.VercelProject)"
  Write-Host "  （Vercel 需已关联 GitHub 仓库；提交邮箱须与 GitHub 一致）"
} catch {
  Write-Host ""
  Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
  $exitCode = 1
} finally {
  Pause-IfExe
}

exit $exitCode
