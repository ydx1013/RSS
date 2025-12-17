/**
 * Apply filtering rules to a list of items.
 * @param {Array} items - List of feed items.
 * @param {Array} rules - List of filtering rules.
 * @returns {Array} - Filtered list of items.
 */
export function applyFilters(items, rules) {
    if (!items || !Array.isArray(items) || items.length === 0) return items;
    if (!rules || !Array.isArray(rules) || rules.length === 0) return items;

    return items.filter(item => {
        // Default to keeping the item unless an exclude rule matches
        // For include rules, at least one must match if any exist
        let keep = true;
        let hasIncludeRules = false;
        let includeMatch = false;


        for (const rule of rules) {
            if (rule.active === false) continue;


            const fieldVal = (item[rule.field] || '').toString();
            let matched = false;

            try {
                if (rule.type === 'regex') {
                    const regex = new RegExp(rule.value, 'i');
                    matched = regex.test(fieldVal);
                } else {
                    matched = fieldVal.toLowerCase().includes(rule.value.toLowerCase());
                }
            } catch (e) {
                console.warn('Filter regex error:', e);
                continue;
            }

            if (rule.mode === 'exclude') {
                if (matched) {
                    keep = false;
                    break; // One exclude match is enough to drop
                }
            } else if (rule.mode === 'include') {
                hasIncludeRules = true;
                if (matched) {
                    includeMatch = true;
                }
            }
        }

        // If there were include rules, we only keep if at least one matched
        // AND we didn't hit an exclude rule
        if (keep && hasIncludeRules && !includeMatch) {
            keep = false;
        }

        return keep;
    });
}
