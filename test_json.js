
const data = {
  "status": 0,
  "msg": "",
  "data": {
    "total": 152,
    "data": [
      {
        "id": 1050,
        "title": "《Jackbox 派对包 4》原价 78 限时喜加一,截止至 2025-12-12 00:00:00",
        "description": "...",
        "createTime": "2025-12-06T09:20:03+08:00"
      }
    ]
  }
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

const itemSelector = 'data.data';
const list = getVal(data, itemSelector); // This returns the array, but getVal stringifies objects?

// Wait, getVal returns JSON.stringify(current) if it is an object.
// In routers/json.js:
// let list = itemSelector ? getVal(data, itemSelector) : data;
// if (typeof list === 'string') { try { list = JSON.parse(list); } ... }

let itemsList = list;
if (typeof itemsList === 'string') {
    itemsList = JSON.parse(itemsList);
}

const item = itemsList[0];
const titleSelector = '标题:{title}';
const result = processTemplate(item, titleSelector);

console.log('Result:', result);
