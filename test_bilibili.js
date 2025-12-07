const userId = '20259914'; // 使用用户提供的ID
const apiUrl = `https://api.bilibili.com/x/space/arc/search?mid=${userId}&pn=1&ps=5`;

console.log('Testing Bilibili API for user:', userId);
console.log('API URL:', apiUrl);

// 添加更长的延迟
console.log('Waiting 10 seconds before request...');
setTimeout(() => {
  fetch(apiUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Referer': 'https://space.bilibili.com/'
    }
  }).then(resp => {
    console.log('HTTP Status:', resp.status);
    console.log('Status Text:', resp.statusText);
    console.log('Response Headers:', Object.fromEntries(resp.headers.entries()));
    return resp.text();
  }).then(text => {
    console.log('Response length:', text.length);
    console.log('Raw response (first 200 chars):', text.substring(0, 200));

    try {
      const data = JSON.parse(text);
      console.log('Parsed JSON:');
      console.log('  Code:', data.code);
      console.log('  Message:', data.message);

      if (data.code === 0) {
        const videos = data.data?.list?.vlist || [];
        console.log('  Video count:', videos.length);

        if (videos.length > 0) {
          console.log('  First video details:');
          const firstVideo = videos[0];
          console.log('    Title:', firstVideo.title);
          console.log('    BVID:', firstVideo.bvid);
          console.log('    Play count:', firstVideo.play);
          console.log('    Created:', new Date(firstVideo.created * 1000).toISOString());
          console.log('    Description:', firstVideo.description?.substring(0, 100) + '...');
        }

        console.log('\n✅ SUCCESS: Successfully retrieved video data!');
      } else {
        console.log('❌ FAILED: Bilibili API returned error code');
      }
    } catch (e) {
      console.log('❌ FAILED: Could not parse JSON response');
      console.log('Parse error:', e.message);
    }
  }).catch(err => {
    console.error('❌ FAILED: Network error');
    console.error('Error:', err.message);
  });
}, 10000);