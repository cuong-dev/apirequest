import gplay from 'google-play-scraper';

// 1. Hàm so sánh version
function isVersionNewer(oldVer, newVer) {
  if (!oldVer || !newVer || oldVer === "N/A" || newVer === "N/A") return false;
  const cleanOld = String(oldVer).replace(/[^0-9.]/g, '');
  const cleanNew = String(newVer).replace(/[^0-9.]/g, '');
  
  const oldParts = cleanOld.split(".").map(n => parseInt(n, 10) || 0);
  const newParts = cleanNew.split(".").map(n => parseInt(n, 10) || 0);
  const len = Math.max(oldParts.length, newParts.length);
  
  for (let i = 0; i < len; i++) {
    const o = oldParts[i] || 0;
    const n = newParts[i] || 0;
    if (n > o) return true;
    if (n < o) return false;
  }
  return false;
}

// 2. Hàm cào APKCombo với Header giả lập Chrome xịn nhất để né Cloudflare
async function getApkComboVersion(appId) {
  try {
    const url = `https://apkcombo.com/vi/a/${appId}/`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Ch-Ua': '"Google Chrome";v="123", "Not:A-Brand";v="8", "Chromium";v="123"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1'
      }
    });
    
    if (!res.ok) return null;
    const html = await res.text();

    // Nếu vẫn xui xẻo bị Cloudflare chặn thì bỏ qua
    if (html.includes('Cloudflare') || html.includes('Just a moment')) {
      return null;
    }

    const match = html.match(/<span class="is-version[^>]*>([^<]+)<\/span>/i)
               || html.match(/data-version="([^"]+)"/i)
               || html.match(/Version\s*([\d\.]+)/i);

    if (match && match[1]) {
      return match[1].trim().replace(/^v/i, '').trim();
    }
    return null;
  } catch (e) {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Thiếu app id' });

  try {
    // 3. Chạy SONG SONG: Vừa cào Google Play, vừa rình APKCombo
    const [playApp, apkComboVersion] = await Promise.all([
      gplay.app({
        appId: id, lang: 'vi', country: 'us',
        requestOptions: {
          headers: {
            'Cache-Control': 'no-cache',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/123.0.0.0 Safari/537.36'
          }
        }
      }).catch(() => null),
      getApkComboVersion(id)
    ]);

    if (!playApp) {
      return res.status(500).json({ error: 'App ID không tồn tại hoặc lỗi Google Play' });
    }

    // 4. Cướp version của APKCombo nếu nó cao hơn bản 1% của Google Play
    if (apkComboVersion && isVersionNewer(playApp.version, apkComboVersion)) {
      playApp.version = apkComboVersion;
      playApp.sourceLog = `APKCombo (${apkComboVersion})`;
    } else {
      playApp.sourceLog = `Google Play`;
    }

    res.status(200).json(playApp);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}