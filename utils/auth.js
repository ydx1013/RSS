// 认证中间件模块
import { cacheConfig } from "../config.js"

/**
 * 检查请求是否通过认证
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境变量
 * @returns {boolean} 是否通过认证
 */
export function checkAuth(request, env) {
    // 如果没有设置密码或使用环境变量ADMIN_PASSWORD，则不需要认证
    const adminPassword = env.ADMIN_PASSWORD || cacheConfig.adminPassword;
    if (!adminPassword) {
        return true; // 没有设置密码，不需要认证
    }
    
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return false;
    
    const token = authHeader.replace('Bearer ', '');
    // 简单的token验证：password的base64编码
    const expectedToken = btoa(adminPassword);
    return token === expectedToken;
}

/**
 * 生成认证令牌
 * @param {string} password - 密码
 * @param {Object} env - 环境变量
 * @returns {string|null} 令牌或null
 */
export function generateToken(password, env) {
    const adminPassword = env.ADMIN_PASSWORD || cacheConfig.adminPassword;
    if (password === adminPassword) {
        return btoa(password);
    }
    return null;
}
