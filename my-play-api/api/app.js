import gplay from 'google-play-scraper';

export default async function handler(req, res) {
  // Bật CORS để Apps Script gọi được
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Thiếu app id (ví dụ: ?id=com.example.app)' });

  try {
    const app = await gplay.app({ 
      appId: id, 
      lang: 'en', 
      country: 'us' 
    });
    res.status(200).json(app);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}