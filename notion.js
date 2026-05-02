export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).json({ ok: true });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  let notionKey;
  try {
    notionKey = req.body?.notionKey;
  } catch (e) {
    return res.status(400).json({ success: false, error: 'Invalid request body' });
  }

  if (!notionKey) {
    return res.status(400).json({ success: false, error: 'notionKey is required' });
  }

  try {
    const results = [];
    let cursor = undefined;
    let hasMore = true;
    let pageCount = 0;

    while (hasMore && pageCount < 10) { // max 1000 pages safety limit
      pageCount++;
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

      let data;
      const text = await notionRes.text();
      try {
        data = JSON.parse(text);
      } catch (e) {
        return res.status(500).json({ success: false, error: `Notion returned invalid JSON: ${text.slice(0, 200)}` });
      }

      if (!notionRes.ok) {
        return res.status(notionRes.status).json({
          success: false,
          error: data.message || data.error || `Notion API error ${notionRes.status}`,
        });
      }

      results.push(...(data.results || []));
      hasMore = data.has_more;
      cursor = data.next_cursor;
    }

    return res.status(200).json({ success: true, results });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
