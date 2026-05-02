export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { notionKey } = req.body;

  if (!notionKey) {
    return res.status(400).json({ success: false, error: 'notionKey is required' });
  }

  try {
    const results = [];
    let cursor = undefined;
    let hasMore = true;

    while (hasMore) {
      const body = { page_size: 100 };
      if (cursor) body.start_cursor = cursor;

      const notionRes = await fetch('https://api.notion.com/v1/search', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${notionKey}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!notionRes.ok) {
        const errData = await notionRes.json().catch(() => ({}));
        return res.status(notionRes.status).json({
          success: false,
          error: errData.message || `Notion API error: ${notionRes.status}`,
        });
      }

      const data = await notionRes.json();
      results.push(...data.results);
      hasMore = data.has_more;
      cursor = data.next_cursor;
    }

    return res.status(200).json({ success: true, results });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
