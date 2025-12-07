# PowerShell 部署脚本 - WorkerRSS 管理后台

Write-Host "🚀 WorkerRSS 管理后台部署助手" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# 检查是否安装 Node.js
if (!(Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "❌ 未找到 Node.js，请先安装: https://nodejs.org/" -ForegroundColor Red
    exit 1
}

# 检查是否安装 wrangler
if (!(Get-Command npx -ErrorAction SilentlyContinue)) {
    Write-Host "❌ 未找到 npx，请确保 Node.js 正确安装" -ForegroundColor Red
    exit 1
}

Write-Host "📦 步骤 1/5: 创建 KV 命名空间" -ForegroundColor Yellow
Write-Host ""
Write-Host "正在创建生产环境 KV..."

$KV_OUTPUT = npx wrangler kv:namespace create RSS_KV 2>&1 | Out-String
$KV_ID = if ($KV_OUTPUT -match 'id:\s*"([^"]+)"') { $matches[1] } else { $null }

if (-not $KV_ID) {
    Write-Host "❌ KV 创建失败，请手动执行: npx wrangler kv:namespace create RSS_KV" -ForegroundColor Red
    exit 1
}

Write-Host "✅ KV 命名空间已创建" -ForegroundColor Green
Write-Host "   ID: $KV_ID"
Write-Host ""

Write-Host "正在创建预览环境 KV..."
$PREVIEW_KV_OUTPUT = npx wrangler kv:namespace create RSS_KV --preview 2>&1 | Out-String
$PREVIEW_KV_ID = if ($PREVIEW_KV_OUTPUT -match 'id:\s*"([^"]+)"') { $matches[1] } else { $null }

if (-not $PREVIEW_KV_ID) {
    Write-Host "⚠️  预览 KV 创建失败（不影响生产环境）" -ForegroundColor Yellow
} else {
    Write-Host "✅ 预览 KV 命名空间已创建" -ForegroundColor Green
    Write-Host "   Preview ID: $PREVIEW_KV_ID"
}
Write-Host ""

Write-Host "🔐 步骤 2/5: 生成管理员 Token" -ForegroundColor Yellow
Write-Host ""
$ADMIN_TOKEN = [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
Write-Host "✅ 已生成随机 Token（请妥善保存）:" -ForegroundColor Green
Write-Host "   $ADMIN_TOKEN" -ForegroundColor Cyan
Write-Host ""

Write-Host "📝 步骤 3/5: 更新配置文件" -ForegroundColor Yellow
Write-Host ""

# 备份原配置
if (Test-Path "wrangler.toml") {
    Copy-Item "wrangler.toml" "wrangler.toml.backup"
}

# 更新 wrangler.toml
$CONFIG = @"
name = "worker_rss"
main = "main.js"
compatibility_date = "2025-03-12"

[observability.logs]
enabled = true

# KV 命名空间配置
[[kv_namespaces]]
binding = "RSS_KV"
id = "$KV_ID"
preview_id = "$PREVIEW_KV_ID"
"@

Set-Content -Path "wrangler.toml" -Value $CONFIG

Write-Host "✅ wrangler.toml 已更新（原文件备份为 wrangler.toml.backup）" -ForegroundColor Green
Write-Host ""

Write-Host "🔑 步骤 4/5: 配置管理员密钥" -ForegroundColor Yellow
Write-Host ""
Write-Host "正在将 ADMIN_TOKEN 设置为 Secret..."

# 使用 stdin 传递 token
$ADMIN_TOKEN | npx wrangler secret put ADMIN_TOKEN

Write-Host ""
Write-Host "✅ 密钥配置完成" -ForegroundColor Green
Write-Host ""

Write-Host "🚢 步骤 5/5: 部署到 Cloudflare Workers" -ForegroundColor Yellow
Write-Host ""
npx wrangler deploy

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "🎉 部署完成！" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "📋 重要信息（请保存）:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. KV 命名空间 ID: $KV_ID"
Write-Host "2. 管理员 Token: " -NoNewline
Write-Host "$ADMIN_TOKEN" -ForegroundColor Cyan
Write-Host ""
Write-Host "🌐 访问地址:" -ForegroundColor Yellow

$DEPLOYMENTS = npx wrangler deployments list 2>&1 | Out-String
$WORKER_URL = if ($DEPLOYMENTS -match 'https://[^\s]+') { $matches[0] } else { $null }

if ($WORKER_URL) {
    Write-Host "   RSS 服务: $WORKER_URL"
    Write-Host "   管理后台: $WORKER_URL/admin?token=$ADMIN_TOKEN"
} else {
    Write-Host "   请在 Cloudflare Dashboard 中查看 Worker URL"
    Write-Host "   管理后台路径: /admin?token=$ADMIN_TOKEN"
}

Write-Host ""
Write-Host "📖 下一步:" -ForegroundColor Yellow
Write-Host "   1. 访问管理后台添加订阅"
Write-Host "   2. 查看完整文档: Get-Content ADMIN-GUIDE.md"
if ($WORKER_URL) {
    Write-Host "   3. 测试 RSS 功能: $WORKER_URL/?github=owner/repo"
}
Write-Host ""
Write-Host "💡 提示:" -ForegroundColor Yellow
Write-Host "   - Token 已保存到 Cloudflare Secrets，安全存储"
Write-Host "   - 原配置文件备份: wrangler.toml.backup"
Write-Host "   - 本地开发: npx wrangler dev"
Write-Host ""

# 询问是否在浏览器中打开
if ($WORKER_URL) {
    $OPEN = Read-Host "是否在浏览器中打开管理后台？(Y/N)"
    if ($OPEN -eq "Y" -or $OPEN -eq "y") {
        Start-Process "$WORKER_URL/admin?token=$ADMIN_TOKEN"
    }
}
