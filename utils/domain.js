/**
 * Generate a list of candidate URLs based on domain groups.
 * The original URL is always the first candidate.
 * 
 * @param {string} url The original URL
 * @param {string[][]} domainGroups Array of domain groups
 * @returns {string[]} List of URLs to try
 */
export function getCandidateUrls(url, domainGroups) {
    if (!url) return [];
    
    let urlObj;
    try {
        urlObj = new URL(url);
    } catch (e) {
        return [url];
    }

    // If no groups, just return original
    if (!domainGroups || !Array.isArray(domainGroups) || domainGroups.length === 0) {
        return [url];
    }

    const hostname = urlObj.hostname;
    
    // Find if hostname is in any group
    const group = domainGroups.find(g => g.includes(hostname));
    
    if (!group) {
        return [url];
    }

    // Create candidates: original first, then others in the group
    const candidates = [url];
    
    const others = group.filter(d => d !== hostname);
    for (const domain of others) {
        try {
            const newUrl = new URL(url);
            newUrl.hostname = domain;
            candidates.push(newUrl.href);
        } catch (e) {
            // Ignore invalid domains
        }
    }

    return candidates;
}
