const admin_ui = require('./admin_ui.cjs');
console.log('Generated HTML length:', admin_ui.length);
console.log('Contains CSS:', admin_ui.includes('<style>'));
console.log('Contains JS:', admin_ui.includes('<script>'));
console.log('Contains link detection code:', admin_ui.includes('智能链接选择'));
console.log('First 200 chars:', admin_ui.substring(0, 200));