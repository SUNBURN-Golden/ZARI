// Service worker: the only bridge to the bot is the native messaging port.
// It opens one tab per bot job, injects the text collector, answers, closes
// the tab. It starts nothing by itself and follows no links.
import { handleJob } from './lib/runner.js';
import { collectPage, collectRobots } from './lib/collector.js';

const HOST_NAME = 'com.zari.catalog_bot';
const LOAD_TIMEOUT_MS = 45000;
const SETTLE_MS = 1500;
let port = null;
let busy = false;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function loaded(tabId) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('timeout'));
    }, LOAD_TIMEOUT_MS);
    function listener(id, info) {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function collect(url, kind) {
  const tab = await chrome.tabs.create({ url, active: true });
  try {
    await loaded(tab.id);
    await wait(SETTLE_MS);
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: kind === 'robots' ? collectRobots : collectPage,
    });
    if (!injection || !injection.result) throw new Error('no_result');
    return injection.result;
  } finally {
    chrome.tabs.remove(tab.id).catch(() => {});
  }
}

async function onMessage(message) {
  if (message?.type !== 'job' || busy) {
    if (message?.type === 'job') port?.postMessage({ type: 'error', id: String(message.id ?? ''), code: 'busy' });
    return;
  }
  busy = true;
  try {
    port?.postMessage(await handleJob(message, { collect, now: () => Date.now() }));
  } finally {
    busy = false;
  }
}

function connect() {
  if (port) return;
  port = chrome.runtime.connectNative(HOST_NAME);
  port.onMessage.addListener((message) => void onMessage(message));
  port.onDisconnect.addListener(() => {
    port = null;
  });
  port.postMessage({ type: 'hello', protocol: 1, extension: chrome.runtime.getManifest().version });
}

chrome.runtime.onStartup.addListener(connect);
chrome.runtime.onInstalled.addListener(connect);
connect();
