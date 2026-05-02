module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).json({ ok: true });
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const { notionKey, action, pageId, cursor: startCursor } = req.body || {};
  if (!notionKey) return res.status(400).json({ success: false, error: 'notionKey is required' });

  if (action === 'blocks') {
    if (!pageId) return res.status(400).json({ success: false, error: 'pageId is required' });
    try {
      const blocks = await fetchBlocks(notionKey, pageId);
      return res.status(200).json({ success: true, blocks });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  if (action === 'database') {
    if (!pageId) return res.status(400).json({ success: false, error: 'pageId is required' });
    try {
      const { items, hasMore, nextCursor } = await fetchDatabaseItems(notionKey, pageId, startCursor);
      if (startCursor) {
        // 추가 로드: 스키마 생략
        return res.status(200).json({ success: true, items, hasMore, nextCursor });
      }
      const schema = await notionGet(notionKey, `https://api.notion.com/v1/databases/${pageId}`);
      return res.status(200).json({ success: true, schema, items, hasMore, nextCursor });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // Default: search (500개씩 페이지네이션)
  try {
    const results = [];
    let cursor = startCursor;
    let hasMore = true;
    let pageCount = 0;

    while (hasMore && pageCount < 5) {
      pageCount++;
      const body = { page_size: 100 };
      if (cursor) body.start_cursor = cursor;
      const data = await notionPost(notionKey, 'https://api.notion.com/v1/search', body);
      results.push(...(data.results || []));
      hasMore = data.has_more;
      cursor = data.next_cursor;
    }

    return res.status(200).json({ success: true, results, hasMore, nextCursor: cursor });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

async function notionGet(notionKey, url) {
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${notionKey}`, 'Notion-Version': '2022-06-28' },
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch (e) { throw new Error(`Notion returned invalid JSON: ${text.slice(0, 200)}`); }
  if (!res.ok) throw new Error(data.message || `Notion API error ${res.status}`);
  return data;
}

async function notionPost(notionKey, url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${notionKey}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch (e) { throw new Error(`Notion returned invalid JSON: ${text.slice(0, 200)}`); }
  if (!res.ok) throw new Error(data.message || `Notion API error ${res.status}`);
  return data;
}

async function fetchDatabaseItems(notionKey, databaseId, startCursor) {
  const items = [];
  let cursor = startCursor;
  let hasMore = true;
  let pageCount = 0;

  while (hasMore && pageCount < 5) {
    pageCount++;
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const data = await notionPost(notionKey, `https://api.notion.com/v1/databases/${databaseId}/query`, body);
    items.push(...(data.results || []));
    hasMore = data.has_more;
    cursor = data.next_cursor;
  }

  return { items, hasMore, nextCursor: cursor };
}

async function fetchBlocks(notionKey, blockId, depth = 0) {
  if (depth > 3) return [];
  const blocks = [];
  let cursor;
  let hasMore = true;

  while (hasMore) {
    const url = new URL(`https://api.notion.com/v1/blocks/${blockId}/children`);
    url.searchParams.set('page_size', '100');
    if (cursor) url.searchParams.set('start_cursor', cursor);
    const data = await notionGet(notionKey, url.toString());

    for (const block of (data.results || [])) {
      if (block.has_children) {
        block.children = await fetchBlocks(notionKey, block.id, depth + 1);
      }
      blocks.push(block);
    }

    hasMore = data.has_more;
    cursor = data.next_cursor;
  }

  return blocks;
}
