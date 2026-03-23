import gplay from 'google-play-scraper';

// ---------------- VERSION COMPARE ----------------
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

// ---------------- FETCH HTML VERSION ----------------
async function getVersionFromHTML(appId, gl = 'us', retry = 2) {
  try {
    const url = `https://play.google.com/store/apps/details?id=${appId}&hl=vi&gl=${gl}&_=${Date.now()}_${Math.random()}`;

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Cache-Control': 'no-cache'
      }
    });

    const html = await res.text();

    // Cách 1: regex nhanh
    let match = html.match(/"softwareVersion":"(.*?)"/);
    if (match && match[1]) return match[1];

    // Cách 2: fallback parse sâu hơn (AF_initDataCallback)
    match = html.match(/AF_initDataCallback[\s\S]*?data:([\s\S]*?),\s*sideChannel/);
    if (match) {
      const data = match[1];
      const verMatch = data.match(/\d+(\.\d+)+/);
      if (verMatch) return verMatch[0];
    }

    return null;

  } catch (e) {
    if (retry > 0) {
      return await getVersionFromHTML(appId, gl, retry - 1);
    }
    return null;
  }
}

// ---------------- MAIN HANDLER ----------------
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Thiếu app id' });

  const requestOptions = {
    headers: {
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    }
  };

  try {
    const countries = ['us', 'vn', 'sg'];

    // ----------- GPLAY SONG SONG -----------
    const gplayPromises = countries.map(country =>
      gplay.app({
        appId: id,
        lang: 'vi',
        country,
        requestOptions
      }).catch(() => null)
    );

    // ----------- HTML SONG SONG (multi region) -----------
    const htmlPromises = countries.map(gl =>
      getVersionFromHTML(id, gl)
    );

    const [gplayResults, htmlResults] = await Promise.all([
      Promise.all(gplayPromises),
      Promise.all(htmlPromises)
    ]);

    const validResults = gplayResults.filter(r => r !== null);
    const validHTMLVersions = htmlResults.filter(v => v !== null);

    if (validResults.length === 0 && validHTMLVersions.length === 0) {
      return res.status(500).json({ error: 'Không lấy được dữ liệu từ Google Play' });
    }

    // ----------- CHỌN BEST TỪ GPLAY -----------
    let bestApp = validResults[0] || { version: "0.0.0" };

    for (let i = 1; i < validResults.length; i++) {
      if (isVersionNewer(bestApp.version, validResults[i].version)) {
        bestApp = validResults[i];
      }
    }

    // ----------- SO VỚI HTML -----------
    for (const htmlVer of validHTMLVersions) {
      if (isVersionNewer(bestApp.version, htmlVer)) {
        bestApp.version = htmlVer;
      }
    }

    return res.status(200).json({
      ...bestApp,
      debug: {
        gplayVersions: validResults.map(r => r.version),
        htmlVersions: validHTMLVersions
      }
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}