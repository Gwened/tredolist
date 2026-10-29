
function isTrelloBoard(url) {
  return typeof url === 'string' && /:\/\/trello\.com\/b\//.test(url);
}

function injectSetup(tabId) {
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    files: ['setup-css.js']
  });
}

function syncTab(tab) {
  if (!tab?.id)
    return;
  if (isTrelloBoard(tab.url)) {
    chrome.action.enable(tab.id);
    injectSetup(tab.id);
  } else if (tab.url) {
    chrome.action.disable(tab.id);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  // Disabled by default; enabled per tab on Trello boards (Chrome + Firefox).
  chrome.action.disable();
  chrome.tabs.query({}, (tabs) => tabs.forEach(syncTab));
});

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
  if (!isTrelloBoard(tab.url)) {
    if (tab.url)
      chrome.action.disable(tabId);
    return;
  }

  chrome.action.enable(tabId);

  // Inject on navigation / load complete (covers full loads and Trello SPA board changes).
  if (changeInfo.status === 'complete' || changeInfo.url)
    injectSetup(tabId);
});
