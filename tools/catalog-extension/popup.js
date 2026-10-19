// Optional manual fallback. One click collects the current product page and
// downloads a `zari-collection/1` file (blob link, no downloads permission).
import { extractProducts } from './lib/extract.js';
import { collectPage } from './lib/collector.js';
import { detectBlocked } from './lib/blocked.js';
import { isVisitable, productKey } from './lib/sites.js';

const status = document.getElementById('status');
const say = (text) => {
  status.textContent = text;
};

document.getElementById('add').addEventListener('click', async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url || !isVisitable(tab.url) || !productKey(tab.url)) {
      say('허용된 사이트의 상품 페이지가 아닙니다.');
      return;
    }
    const [injection] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: collectPage });
    const snapshot = injection?.result;
    if (!snapshot) {
      say('페이지를 읽지 못했습니다.');
      return;
    }
    if (detectBlocked(snapshot, new URL(tab.url).pathname)) {
      say('로그인·차단 화면으로 보여 수집하지 않았습니다.');
      return;
    }
    const { items, error } = extractProducts(snapshot, tab.url, Date.now());
    if (error || items.length === 0 || items.length > 50) {
      say('상품 정보를 찾지 못했습니다.');
      return;
    }
    const file = { format: 'zari-collection/1', createdAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'), items };
    const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `zari-collection-${items[0].id.replace(/[^a-z0-9_-]+/gi, '_')}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    say(`${items.length}건을 파일로 저장했습니다. 봇의 ingest로 읽습니다.`);
  } catch {
    say('수집하지 못했습니다.');
  }
});
