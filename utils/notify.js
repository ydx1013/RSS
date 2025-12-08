
/**
 * Send a notification via Bark
 * @param {string} barkUrl The Bark server URL (e.g. https://api.day.app/KEY/)
 * @param {string} title Notification title
 * @param {string} body Notification body
 * @param {string} group Notification group (optional)
 * @param {string} url Click URL (optional)
 */
export async function sendBarkNotification(barkUrl, title, body, group = 'RSS-Worker', url = '') {
    if (!barkUrl) return;
    
    // Ensure barkUrl ends with /
    if (!barkUrl.endsWith('/')) barkUrl += '/';
    
    try {
        const payload = {
            title: title,
            body: body,
            group: group,
            url: url,
            icon: 'https://cdn-icons-png.flaticon.com/512/3670/3670157.png' // Generic RSS icon
        };
        
        // Bark supports GET or POST. POST is better for long body.
        // Format: https://api.day.app/KEY/
        // We assume barkUrl includes the key.
        
        await fetch(barkUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=utf-8'
            },
            body: JSON.stringify(payload)
        });
        
    } catch (e) {
        console.error('Failed to send Bark notification:', e);
    }
}
