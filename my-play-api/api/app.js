import gplay from 'google-play-scraper';

// Hàm so sánh version (Giữ nguyên để tìm bản cao nhất)
function isVersionNewer(oldVer, newVer) {
  if (!oldVer || !newVer || oldVer === "N/A" || newVer === "N/A") return false;
  const oldParts = String(oldVer).split(".").map(n => parseInt(n, 10) || 0);
  const newParts = String(newVer).split(".").map(n => parseInt(n, 10) || 0);
  const len = Math.max(oldParts.length, newParts.length);
  for (let i = 0; i < len; i++) {
    const o = oldParts[i] || 0;
    const n = newParts[i] || 0;
    if (n > o) return true;
    if (n < o) return false;
  }
  return false;
}

// Hàm sinh ra "nhân dạng giả" ngẫu nhiên để lừa Google
function getRandomUserAgent() {
  const uas = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36', // Chrome Win
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36', // Chrome Mac
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0', // Firefox Win
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36', // Chrome Linux
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15' // Safari Mac
  ];
  return uas[Math.floor(Math.random() * uas.length)];
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Thiếu app id' });

  try {
    // Tạo 3 yêu cầu với 3 nhân dạng giả hoàn toàn khác nhau
    const promises = [1, 2, 3].map(() => {
      const fakeUserAgent = getRandomUserAgent();
      
      return gplay.app({ 
        appId: id, 
        lang: 'vi', 
        country: 'us',
        requestOptions: {
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'User-Agent': fakeUserAgent, // Nhét vân tay giả vào đây
            'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
          }
        }
      }).catch(() => null); // Lỗi 1 cái thì bỏ qua
    });

    // Bắn cả 3 request cùng lúc tới Google
    const results = await Promise.all(promises);
    const validResults = results.filter(r => r !== null);

    if (validResults.length === 0) {
      return res.status(500).json({ error: 'Không lấy được dữ liệu từ Google Play' });
    }

    // Chọn ra bản có version cao nhất trong số các kết quả thu được
    let bestApp = validResults[0];
    for (let i = 1; i < validResults.length; i++) {
      if (isVersionNewer(bestApp.version, validResults[i].version)) {
        bestApp = validResults[i];
      }
    }

    res.status(200).json(bestApp);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}