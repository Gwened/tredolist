// For Edge to support for...of before Fall 2018 update
// https://stackoverflow.com/questions/22754315/for-loop-for-htmlcollection-elements
NodeList.prototype[Symbol.iterator] = Array.prototype[Symbol.iterator];
HTMLCollection.prototype[Symbol.iterator] = Array.prototype[Symbol.iterator];

function getBoardId() {
  var matches = window.location.href.match(/^.*:\/\/trello\.com\/b\/(.*)\/.*/);
  if (! (matches && matches.length > 1))
    return null;
  return matches[1];
}

var boardId = getBoardId();
if (boardId !== null) {

  // Utilities

  function insertCss(cssFile, id) {
    if (document.getElementById(id) === null) {
      var css = document.createElement('link');
      css.id = id;
      css.type = 'text/css';
      css.rel = 'stylesheet';
      css.href = cssFile;
      document.getElementsByTagName('head')[0].appendChild(css);
    }
  }

  function findStylesheet(token) {
    var currentCssArray = document.querySelectorAll('link[rel=stylesheet]');
    var i;
    for (i=0; i<currentCssArray.length; ++i) {
        var styleSh = currentCssArray[i];
        if (styleSh.getAttribute('href').lastIndexOf(token) !== -1)
            return styleSh;
    }
    return null;
  }

  function switchStylesheet(styleSh, newShortFilename) {
    var href = styleSh.getAttribute('href');
    var sflnPos = href.lastIndexOf('/') + 1;
    if (sflnPos == 0)
        return;
    href = href.substr(0, sflnPos) + newShortFilename;
    styleSh.setAttribute('href', href);
  }

  function setNewStylesheet(cssToReplace, newCss) {
    var styleSh = findStylesheet(cssToReplace);
    if (styleSh !== null)
      switchStylesheet(styleSh, newCss);
    else
      insertCss(chrome.runtime.getURL("css/"+newCss));
  }

  function catchNodeBySelector(selector, callback) {
    var nodes = document.querySelectorAll(selector);
    for (var node of nodes) {
      callback(node);
    }
  }

  function getParent(node, selector) {
    for (var p = node && node.parentElement; p; p = p.parentElement) {
      if (p.matches(selector))
        return p;
    }
    return null;
  }

  function loadSettings(boardId, defaultId=undefined) {
    chrome.storage.sync.get([boardId], function(result) {
        var configObj = result[boardId];
        if (configObj) {
            document.querySelector('#layout [value='+configObj.layout+'}').checked = true;
            document.querySelector('#coloring [value='+configObj.coloring+'}').checked = true;
        }
        else if (defaultId)
            loadSettings(defaultId);
    });
  }

  // Main logic

  var board = document.getElementById('board');
  var layouts = ['', 'vertical', 'mixed', 'horizcards'];

  function getBoard() {
    if (!board || !board.isConnected)
      board = document.getElementById('board');
    return board;
  }

  function setLayout(layoutName) {
    var boardEl = getBoard();
    if (!boardEl?.classList)
      return;
    boardEl.classList.add('layout-trello-'+layoutName);
    for (var layout of layouts) {
      if (layout !== layoutName)
        boardEl.classList.remove('layout-trello-'+layout);
    }
  }

  insertCss(chrome.runtime.getURL('css/layout.css'), 'layoutcss');

  var configObj = {
    layout: '',
    coloring: ''
  };
  var hasSpecificConfig = false;
  var defaultSettingKey = '*';

  function onSettingChanged(key, newConfigObj) {
    if (key === boardId) {
      hasSpecificConfig = true;
      //console.log("Tredolist: loading page-specific settings for "+key);
      //console.log(newConfigObj);
    }
    else if ((key !== defaultSettingKey) || hasSpecificConfig)
      return;
    //else
    //  console.log("Tredolist: loading default settings");
    
    for (var configKey in configObj) {
      if (newConfigObj[configKey] !== configObj[configKey]) {
        switch (configKey) {
          case 'layout':
            setLayout(newConfigObj[configKey]);
            break;
          case 'coloring':
            setNewStylesheet(
              'theme-'+configObj[configKey]+'.css',
              'theme-'+newConfigObj[configKey]+'.css');
          break;
        }
        configObj[configKey] = newConfigObj[configKey];
      }
    }
  }

  // Load settings
  chrome.storage.sync.get([boardId], function(result) {
    if (result[boardId])
      onSettingChanged(boardId, result[boardId]);
    else {
      chrome.storage.sync.get([defaultSettingKey], function(resultD) {
        if (resultD[defaultSettingKey])
          onSettingChanged((defaultSettingKey), resultD[defaultSettingKey]);
      });
    }
  });
  chrome.storage.onChanged.addListener(function(changes, areaName) {
    for (key in changes) {
      onSettingChanged(key, changes[key].newValue);
    }
  });

  var States = ['canceled-tdl', 'done-tdl', 'for-later-tdl', 'waiting-for-tdl', 'in-progress-tdl']; // in order of priority
  var Fields = ['Canceled', 'Done', 'For Later', 'Waiting For', 'Started'];

  const selectors = {
    listSlot: '[data-testid="list-wrapper"]', // '.bi0h3HALKXjfDq'
    list: '[data-testid="list"]', // '.Sb_QqNKeadm2oq'
    listTitle: '[data-testid="list-name"]', // '.KLvU2mDGTQrsWG'
    card: ':is([data-testid="trello-card"], [data-testid="minimal-card"])',
    cardContent: ':is([data-testid="trello-card"], [data-testid="minimal-card"]) > div:first-child',
    cardTitle: '[data-testid="card-name"]', // '.NdQKKfeqJDDdX3'
    badges: '[data-testid="card-front-badges"]', // '.jS9THwzyUow79A'
    badge: '[data-testid="card-front-badges"] > *' // '.BOkIMdOUAQVOQk'
  }

  function getStateFromBadgeText(node) {
    if (!node)
      return undefined;

    if (node.innerText.indexOf("/", 1) === -1) { // optim
      // Using custom fields
      for (var iState in Fields) {
        if (node.innerText === Fields[iState])
          return States[iState];
      }
    }
    else {
      // Using checklist
      var toks = node.innerText.match(/^(\d+)\/(\d+)$/);
      if (toks && toks.length > 2) {
        var numDone = toks[1];
        var numTodo = toks[2];
        if (numDone === numTodo)
          return 'done-tdl';
        else if (numDone > 0)
          return 'in-progress-tdl';
        else
          return 'not-started-tdl';
      }
    }
    return undefined;
  }

  function getStateFromTitle(node) {
    if (node && node.innerText) {
      if (node.innerText.match(/^\(.*\)$/) !== null)
        return 'for-later-tdl';
      if (node.innerText.match(/\<.*\>/) !== null)
        return 'waiting-for-tdl';
    }
    return undefined;
  }

  function getMainState(compoundStates) {
    for (var st of States) {
      if (compoundStates.indexOf(st) !== -1) {
        return st;
      }
    }
    return undefined;
  }

  function setState(card, state) {
    if (!card.classList)
      return;
    for (var st of States) {
      card.classList.toggle(st, (st === state));
    }
  }

  // Adapted from https://stackoverflow.com/a/64138530/447122

  function rgb2hsv(r,g,b) { // https://stackoverflow.com/a/54070620/1487756
    let v=Math.max(r,g,b), n=v-Math.min(r,g,b);
    let h= n && ((v==r) ? (g-b)/n : ((v==g) ? 2+(b-r)/n : 4+(r-g)/n)); 
    return [60*(h<0?h+6:h), v&&n/v, v];
  }

  function strToRGB(str) {
    if (str === undefined)
      return undefined;
    var toks = str.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
    if (toks && toks.length > 3) {
      return [parseInt(toks[1]), parseInt(toks[2]), parseInt(toks[3])];
    }
    return undefined;
  }

  function determineColorGroup(rgbColor) {
    if (rgbColor === undefined)
      return "";
    const hsv = rgb2hsv(rgbColor[0], rgbColor[1], rgbColor[2]);
    const h = hsv[0];
    if (h >= 0 && h < 65)
      return "wrn";
    else if (h >= 65 && h < 125)
      return "ok";
    return "";
  }

  function updateColor(listCardNode) {
    // if (listCardNode)
    //   console.log("updateColor", listCardNode.innerText)
    // Look at badge text
    var badgeTextNodes = listCardNode.querySelectorAll(selectors.badge);
    var compoundStates = Array.from(badgeTextNodes).map(function(badgeTextNode) {
      return getStateFromBadgeText(badgeTextNode);
    });

    // Look at title
    var titleState = getStateFromTitle(listCardNode.querySelector(selectors.cardTitle));
    if (titleState !== undefined)
      compoundStates.push(titleState);

    // Resolve according to priority
    var mainState = getMainState(compoundStates);
    setState(listCardNode, mainState);

    // Set additional class if having a short or past deadline
    if (listCardNode.classList) {
      iconClockNode = listCardNode.querySelector(`${selectors.badge}[data-testid="badge-due-date-completed"]`);
      if (iconClockNode)
        listCardNode.classList.toggle('urgent-tdl', false);
      else {
        var iconClockNode = listCardNode.querySelector(`${selectors.badge}[data-testid="badge-due-date-not-completed"]`);
        if (iconClockNode) {
          const colorGroup = (iconClockNode !== null)
            ? determineColorGroup(strToRGB(window.getComputedStyle(iconClockNode).getPropertyValue('background-color')))
            : null;
          //console.log({colorGroup});
          listCardNode.classList.toggle('urgent-tdl', colorGroup === "wrn" && (mainState !== 'canceled-tdl'));
        } else {
          listCardNode.classList.toggle('urgent-tdl', false);
        }
      }
    }
  }

  (function() {
    var counter = 1;
    window.tredoList_NewListId = function(){
        return counter++;
    }
  })();

  function resolveListSlot(listOrWrapper) {
    if (!listOrWrapper || !listOrWrapper.matches)
      return null;
    if (listOrWrapper.matches(selectors.listSlot))
      return listOrWrapper;
    return getParent(listOrWrapper, selectors.listSlot);
  }

  function updateSwimlanes(listOrWrapper) {
    var listSlotNode = resolveListSlot(listOrWrapper);
    if (!listSlotNode)
      return;

    var titleEl = listSlotNode.querySelector(selectors.listTitle);
    if (!titleEl)
      return;
    
    var wantWrap = false;
    var swimlaneTitle;
    if (titleEl.innerText) {
      var matches = titleEl.innerText.match(/^.*[\|🏊](.*)/);
      if (matches && matches.length > 1) {
        wantWrap = true;
        swimlaneTitle = matches[1];
      }
    }
    listSlotNode.classList.toggle('wrapBefore-tdl', wantWrap);
    var lineBreakEl = listSlotNode.previousElementSibling;
    var hasLineBreakBefore = (lineBreakEl && lineBreakEl.classList && lineBreakEl.classList.contains('line-break-tdl'));
    if (wantWrap && !hasLineBreakBefore) {
      // Add
      var currentSwimlaneId = listSlotNode.getAttribute('data-swimlane-id-tdl');
      if (currentSwimlaneId) { // a swimlane line break already exists (possibly below) => delete it
        lineBreakEl = listSlotNode.parentNode.querySelector('[data-swimlane-for-tdl="'+currentSwimlaneId+'"]');
        if (lineBreakEl)
          listSlotNode.parentElement.removeChild(lineBreakEl);
      }
      var swimlaneListId = tredoList_NewListId();
      var lineBreak = document.createElement('div');
      lineBreak.className = 'line-break-tdl';
      lineBreak.setAttribute('data-swimlane-title-tdl', swimlaneTitle.trim()); // for displaying in the CSS:after
      lineBreak.setAttribute('data-swimlane-for-tdl', swimlaneListId); // for finding the line break when the list is moved
      listSlotNode.parentNode.insertBefore(lineBreak, listSlotNode);
      listSlotNode.setAttribute('data-swimlane-id-tdl', swimlaneListId); // link from list to line break
    }
    else if (!wantWrap && hasLineBreakBefore) {
      // Remove
      listSlotNode.parentElement.removeChild(lineBreakEl);
      listSlotNode.removeAttribute('data-swimlane-id-tdl');
    }
    else if (wantWrap && hasLineBreakBefore) {
      // Modify
      lineBreakEl.setAttribute('data-swimlane-title-tdl', swimlaneTitle.trim());
    }
  }

  function listFromTitleMutation(node) {
    if (!node)
      return null;
    var el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    if (!el || !el.closest)
      return null;
    var title = el.matches?.(selectors.listTitle) ? el : el.closest(selectors.listTitle);
    if (!title && el.querySelector)
      title = el.querySelector(selectors.listTitle);
    if (!title)
      return null;
    return title.closest(selectors.list) || getParent(title, selectors.list);
  }

  function refreshBoardNodes() {
    catchNodeBySelector(selectors.card, updateColor);
    catchNodeBySelector(selectors.list, updateSwimlanes);
  }

  // Make sure we catch late asynchronous badge changes
  var nodesToObserve = [
    {selector: selectors.card, type: 'c', callback: updateColor},
    {selector: selectors.cardContent, type: 'c', callback: function(node) {
      var listCardNode = getParent(node, selectors.card);
      if (listCardNode)
        updateColor(listCardNode);
    }},
    {selector: selectors.list, type: 'c', callback: updateSwimlanes},
    {selector: selectors.listTitle, type: 'c', callback: function(node) {
      var listNode = node.closest(selectors.list) || getParent(node, selectors.list);
      if (listNode)
        updateSwimlanes(listNode);
    }},
    {selector: '.wrapBefore-tdl', type: 'c', callback: function(node) {
      updateSwimlanes(node); // make sure to make the line break follow in case the list is moved
    }}];
  
  var attributesToObserve = [
    {selector: selectors.badge, type: 'a', callback: function(node) {
      var listCardNode = getParent(node, selectors.card);
      if (listCardNode)
        updateColor(listCardNode);
    }},
    {selector: selectors.card, type: 'a', callback: updateColor},
    {selector: selectors.listTitle, type: 'a', callback: function(node) {
      var listWrapperNode = getParent(node, selectors.list);
      if (listWrapperNode)
        updateSwimlanes(listWrapperNode);
    }}
  ];

  function matchAddedNode(node, selector, callback) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE)
      return;
    if (node.matches(selector))
      callback(node);
    node.querySelectorAll(selector).forEach(callback);
  }

  function setupObservers(rootNode) {
    var callback = function(mutations) {
      for (var mutation of mutations) {
        switch (mutation.type) {
          case 'childList':
            mutation.addedNodes.forEach(function(node) {
              nodesToObserve.forEach(function(obj) {
                switch (obj.type) {
                  case 'c':
                    matchAddedNode(node, obj.selector, obj.callback);
                    break;
                  case 'v':
                    if (node.nodeValue !== undefined && node.parentElement && node.parentElement.classList && node.parentElement.classList.contains(obj.className))
                      obj.callback(node);
                    break;
                }
              });
            });
            // List title edits replace nested text/nodes without matching card/list selectors
            var listFromTitle = listFromTitleMutation(mutation.target);
            if (listFromTitle)
              updateSwimlanes(listFromTitle);
            break;
          case 'characterData':
            var listFromText = listFromTitleMutation(mutation.target);
            if (listFromText)
              updateSwimlanes(listFromText);
            break;
          case 'attributes':
            if (mutation.attributeName === 'data-testid' && mutation.target?.matches(selectors.card))
              updateColor(mutation.target);
            attributesToObserve.forEach(function(obj) {
              if (obj.type === 'a' && mutation.target?.matches(obj.selector))
                obj.callback(mutation.target);
            });
            break;
        }
      }
    };
    var observer1 = new MutationObserver(callback);
    observer1.observe(rootNode, {childList: true, subtree: true, characterData: true});
    var observer2 = new MutationObserver(callback);
    observer2.observe(rootNode, {attributes: true, subtree: true});
  }

  function getBoardCanvas() {
    return document.querySelector('.board-canvas, [data-testid="board-canvas"]');
  }

  var observersReady = false;
  var readyAttempts = 0;
  var maxReadyAttempts = 40;

  function tryReady() {
    var boardEl = getBoard();
    var rootNode = getBoardCanvas();
    if (boardEl && rootNode) {
      if (!observersReady) {
        setupObservers(rootNode);
        observersReady = true;
      }
      if (configObj.layout)
        setLayout(configObj.layout);
      refreshBoardNodes();
      return;
    }
    readyAttempts++;
    if (readyAttempts < maxReadyAttempts)
      setTimeout(tryReady, 250);
  }

  tryReady();
}