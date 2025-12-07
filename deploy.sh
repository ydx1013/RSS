#!/bin/bash
# 快速部署脚本 - WorkerRSS 管理后台

echo "🚀 WorkerRSS 管理后台部署助手"
echo "================================"
echo ""

# 检查是否安装 wrangler
if ! command -v wrangler &> /dev/null; then
    echo "❌ 未找到 wrangler，正在安装..."
    npm install -g wrangler
fi

echo "📦 步骤 1/5: 创建 KV 命名空间"
echo ""
echo "正在创建生产环境 KV..."
KV_OUTPUT=$(npx wrangler kv:namespace create RSS_KV 2>&1)
KV_ID=$(echo "$KV_OUTPUT" | grep -oP 'id:\s*"\K[^"]+' | head -1)

if [ -z "$KV_ID" ]; then
    echo "❌ KV 创建失败，请手动执行: npx wrangler kv:namespace create RSS_KV"
    exit 1
fi

echo "✅ KV 命名空间已创建"
echo "   ID: $KV_ID"
echo ""

echo "正在创建预览环境 KV..."
PREVIEW_KV_OUTPUT=$(npx wrangler kv:namespace create RSS_KV --preview 2>&1)
PREVIEW_KV_ID=$(echo "$PREVIEW_KV_OUTPUT" | grep -oP 'id:\s*"\K[^"]+' | head -1)

if [ -z "$PREVIEW_KV_ID" ]; then
    echo "⚠️  预览 KV 创建失败（不影响生产环境）"
else
    echo "✅ 预览 KV 命名空间已创建"
    echo "   Preview ID: $PREVIEW_KV_ID"
fi
echo ""

echo "🔐 步骤 2/5: 生成管理员 Token"
echo ""
ADMIN_TOKEN=$(openssl rand -base64 32 | tr -d '\n')
echo "✅ 已生成随机 Token（请妥善保存）:"
echo "   $ADMIN_TOKEN"
echo ""

echo "📝 步骤 3/5: 更新配置文件"
echo ""

# 备份原配置
cp wrangler.toml wrangler.toml.backup

# 更新 wrangler.toml
cat > wrangler.toml << EOF
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
EOF

echo "✅ wrangler.toml 已更新（原文件备份为 wrangler.toml.backup）"
echo ""

echo "🔑 步骤 4/5: 配置管理员密钥"
echo ""
echo "正在将 ADMIN_TOKEN 设置为 Secret..."
echo "$ADMIN_TOKEN" | npx wrangler secret put ADMIN_TOKEN

echo ""
echo "✅ 密钥配置完成"
echo ""

echo "🚢 步骤 5/5: 部署到 Cloudflare Workers"
echo ""
npx wrangler deploy

echo ""
echo "================================================"
echo "🎉 部署完成！"
echo "================================================"
echo ""
echo "📋 重要信息（请保存）:"
echo ""
echo "1. KV 命名空间 ID: $KV_ID"
echo "2. 管理员 Token: $ADMIN_TOKEN"
echo ""
echo "🌐 访问地址:"
WORKER_URL=$(npx wrangler deployments list 2>&1 | grep -oP 'https://[^\s]+' | head -1)
if [ -n "$WORKER_URL" ]; then
    echo "   RSS 服务: $WORKER_URL"
    echo "   管理后台: $WORKER_URL/admin?token=$ADMIN_TOKEN"
else
    echo "   请在 Cloudflare Dashboard 中查看 Worker URL"
    echo "   管理后台路径: /admin?token=$ADMIN_TOKEN"
fi
echo ""
echo "📖 下一步:"
echo "   1. 访问管理后台添加订阅"
echo "   2. 查看完整文档: cat ADMIN-GUIDE.md"
echo "   3. 测试 RSS 功能: $WORKER_URL/?github=owner/repo"
echo ""
echo "💡 提示:"
echo "   - Token 已保存到 Cloudflare Secrets，安全存储"
echo "   - 原配置文件备份: wrangler.toml.backup"
echo "   - 本地开发: npx wrangler dev"
echo ""
