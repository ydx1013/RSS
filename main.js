import { handleAdminRequest } from "./handlers/admin.js";
import { handleProxyRequest } from "./handlers/proxy.js";
import { handleFeedRequest } from "./handlers/feed.js";

export default {
    async fetch(request, env, ctx) {
        try {
            console.log("UA:", request.headers.get("User-Agent") || "No UA");

            const url = new URL(request.url);
            const path = url.pathname;

            // 1. Admin & API Handlers
            let response = await handleAdminRequest(path, request, env);
            if (response) return response;

            // 2. Proxy Handlers
            response = await handleProxyRequest(path, request, env);
            if (response) return response;

            // 3. Feed Generation Handler
            response = await handleFeedRequest(path, request, env, ctx);
            if (response) return response;

            // 4. Default / Welcome
            return new Response("RSS Worker is running.\\n\\nUsage:\\n- Admin: /admin\\n- Feed: /?custom=your_route_key", {
                headers: { 'Content-Type': 'text/plain; charset=utf-8' }
            });
        } catch (e) {
            return new Response(`Server Error: ${e.message}\n${e.stack}`, { status: 500 });
        }
    }
}




