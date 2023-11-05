

chrome.runtime.onInstalled.addListener(() => {
  chrome.action.disable();

  // Clear all rules to ensure only our expected rules are set
  chrome.declarativeContent.onPageChanged.removeRules(undefined, () => {
    let mainRule = {
      conditions: [
        new chrome.declarativeContent.PageStateMatcher({
          pageUrl: {hostSuffix: '.trello.com', pathPrefix: '/b/'},
        })
      ],
      actions: [new chrome.declarativeContent.ShowAction()],
    };

    // Finally, apply our new array of rules
    let rules = [mainRule];
    chrome.declarativeContent.onPageChanged.addRules(rules);
  });
});


chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
    // Match Trello board pages only
    var regex = new RegExp(/.*:\/\/trello\.com\/b\/.*/);
    var match = regex.exec(tab.url);

  
    // Setup page for layout changes and show page action
    if (match) {
      chrome.scripting.executeScript({target: {tabId: tabId}, files: ['setup-css.js']});
    }
  });
  