import gplay from 'google-play-scraper';

export default async function handler(req, res) {
  // =====================================================================
  // 1. ÉP VERCEL VÀ TRÌNH DUYỆT TUYỆT ĐỐI KHÔNG LƯU CACHE
  // =====================================================================
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Surrogate-Control', 'no-store'); // Chặn CDN của Vercel
  res.setHeader('Expires', '0');

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Thiếu app id (ví dụ: ?id=com.example.app)' });

  // =====================================================================
  // 2. ÉP GOOGLE PLAY NHẢ DATA MỚI BẰNG HEADER GIẢ LẬP TRÌNH DUYỆT
  // =====================================================================
  const customRequestOptions = {
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      // Giả lập Samsung Galaxy S24 Ultra (SM-S928B) chạy Android 14, Chrome mới nhất
      'User-Agent': 'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36',
      'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
      'Sec-Ch-Ua-Platform': '"Android"',
      'Sec-Ch-Ua-Mobile': '?1'
    }
  };

  try {
    const app = await gplay.app({ 
      appId: id, 
      lang: 'vi', 
      country: 'us', // Nếu app hướng thị trường VN, bạn có thể đổi thành 'vn'
      requestOptions: customRequestOptions // Bơm Header ép cache vào đây!
    });
    
    // Trả về dữ liệu tươi ngon nhất
    res.status(200).json(app);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}