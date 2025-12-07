
const data = {
    "date": 1733760000000,
    "pe": 12.82,
    "pePercentile": 56.03,
    "bondYR": 1.884,
    "diff": 5.91,
    "percentile": 78.3,
    "indexValue": 3995.64
};

const getVal = (obj, path) => {
    if (!path) return '';
    if (path === '.') return obj;
    
    try {
        const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
        let current = obj;
        
        for (const part of parts) {
            if (!part) continue;
            if (!isNaN(part)) {
                current = current[parseInt(part)];
            } else {
                current = current?.[part];
            }
            if (current === undefined || current === null) return '';
        }
        
        if (typeof current === 'object') {
            return JSON.stringify(current);
        }
        
        return String(current);
    } catch(e) {
        console.error('JSON path error:', path, e);
        return '';
    }
};

const processTemplate = (obj, template) => {
    if (!template) return '';
    
    if (template.includes('{') && template.includes('}')) {
        return template.replace(/\{([^}]+)\}/g, (match, path) => {
            const val = getVal(obj, path.trim());
            return val !== undefined ? val : '';
        });
    }
    
    return getVal(obj, template);
};

const template = "PE是{pe}，分位点是{pePercentile}%，指数点位：{indexValue}";
const result = processTemplate(data, template);

console.log('Template:', template);
console.log('Result:', result);
