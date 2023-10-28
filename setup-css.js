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
      insertCss(chrome.extension.getURL("css/"+newCss));
  }

  function catchNodeByClass(className, callback) {
    var nodes = document.getElementsByClassName(className);
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

  function setLayout(layoutName) {
    if (!board.classList)
      return;
    board.classList.add('layout-trello-'+layoutName);
    for (var layout of layouts) {
      if (layout !== layoutName)
        board.classList.remove('layout-trello-'+layout);
    }
  }

  insertCss(chrome.extension.getURL('css/layout.css'), 'layoutcss');

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

  const listClass = "Sb_QqNKeadm2oq";
  const listTitleClass = "mKJWg6W_CLHoiO";
  const cardClass = "KWQlnMvysRK4fI";
  const cardContentClass = "amUfYqLTZOvGsn";
  const cardTitleClass = "NdQKKfeqJDDdX3";
  const badgesClass = "jS9THwzyUow79A";
  const badgeClass = "BOkIMdOUAQVOQk";

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

  function updateColor(listCardNode) {
    // Look at badge text
    var badgeTextNodes = listCardNode.querySelectorAll(`.${badgesClass}`);
    var compoundStates = Array.from(badgeTextNodes).map(function(badgeTextNode) {
      return getStateFromBadgeText(badgeTextNode);
    });

    // Look at title
    var titleState = getStateFromTitle(listCardNode.querySelector(`.${cardTitleClass}`));
    if (titleState !== undefined)
      compoundStates.push(titleState);

    // Resolve according to priority
    var mainState = getMainState(compoundStates);
    setState(listCardNode, mainState);

    // Set additional class if having a short or past deadline
    /* TODO */
    var iconClockNode = listCardNode.querySelector(`.${badgeClass}.is-due-soon`) || listCardNode.querySelector(`.${badgeClass}.is-due-now`) || listCardNode.querySelector(`.${badgeClass}.is-due-past`);
    if (listCardNode.classList)
      listCardNode.classList.toggle('urgent-tdl', iconClockNode !== null && (mainState !== 'canceled-tdl'));
  }

  (function() {
    var counter = 1;
    window.tredoList_NewListId = function(){
        return counter++;
    }
  })();

  function updateSwimlanes(listWrapperNode) {
    var titleEl = listWrapperNode.querySelector(`.${listTitleClass}’`);
    if (!titleEl)
      return;
    var wantWrap = false;
    var swimlaneTitle;
    if (titleEl.value) {
      var matches = titleEl.value.match(/^.*[\|🏊](.*)/);
      if (matches && matches.length > 1) {
        wantWrap = true;
        swimlaneTitle = matches[1];
      }
    }
    if (listWrapperNode.classList)
      listWrapperNode.classList.toggle('wrapBefore-tdl', wantWrap);
    var lineBreakEl = listWrapperNode.previousElementSibling;
    var hasLineBreakBefore = (lineBreakEl && lineBreakEl.classList && lineBreakEl.classList.contains('line-break-tdl'));
    if (wantWrap && !hasLineBreakBefore) {
      // Add
      var currentSwimlaneId = listWrapperNode.getAttribute('data-swimlane-id-tdl');
      if (currentSwimlaneId) { // a swimlane line break already exists (possibly below) => delete it
        lineBreakEl = listWrapperNode.parentNode.querySelector('[data-swimlane-for-tdl="'+currentSwimlaneId+'"]');
        if (lineBreakEl)
          listWrapperNode.parentElement.removeChild(lineBreakEl);
      }
      var swimlaneListId = tredoList_NewListId();
      var lineBreak = document.createElement('div');
      lineBreak.className = 'line-break-tdl';
      lineBreak.setAttribute('data-swimlane-title-tdl', swimlaneTitle.trim());
      lineBreak.setAttribute('data-swimlane-for-tdl', swimlaneListId);
      listWrapperNode.parentNode.insertBefore(lineBreak, listWrapperNode);
      listWrapperNode.setAttribute('data-swimlane-id-tdl', swimlaneListId);
    }
    else if (!wantWrap && hasLineBreakBefore) {
      // Remove
      listWrapperNode.parentElement.removeChild(lineBreakEl);
    }
    else if (wantWrap && hasLineBreakBefore) {
      // Modify
      lineBreakEl.setAttribute('data-swimlane-title-tdl', swimlaneTitle);
    }
  }

  catchNodeByClass(cardClass, updateColor);

  catchNodeByClass(listClass, updateSwimlanes);

  // Make sure we catch late asynchronous badge changes
  var classesToObserve = [
  {className: cardContentClass, type: 'c', callback: function(node) {
    var listCardNode = getParent(node, `.${cardClass}`);
    if (listCardNode)
      updateColor(listCardNode);
  }},
  {className: 'list-header-name-assist' /*TODO*/, type: 'v', callback: function(node) {
    var listWrapperNode = getParent(node, `.${listClass}`);
    if (listWrapperNode)
      updateSwimlanes(listWrapperNode);
  }},
  {className: 'wrapBefore-tdl', type: 'c', callback: function(node) {
    updateSwimlanes(node); // make sure to make the line break follow in case the list is moved
  }}];

  var rootNode = document.getElementsByClassName('board-canvas');
  if (rootNode) {
    rootNode = rootNode[0];
    var callback = function(mutations) {
      for(var mutation of mutations) {
        switch (mutation.type) {
          case 'childList':
            mutation.addedNodes.forEach(function(node, iNode, nodes) {
              classesToObserve.forEach(function(obj) {
                switch (obj.type) {
                  case 'c': // does added node contain tracked class?
                    if (node.classList && node.classList.contains(obj.className))
                      obj.callback(node);
                    break;
                  case 'v': // has added node a nodeValue under tracked class?
                    if (node.nodeValue !== undefined && node.parentElement && node.parentElement.classList && node.parentElement.classList.contains(obj.className))
                      obj.callback(node);
                    break;
                }
              });
            });
            break;
          case 'attributes':
            if (obj.type === 'a' && mutation.target.classList.contains(obj.className))
              obj.callback(mutation.target);
            break;
        }
      }
    };
    var observer = new MutationObserver(callback);
    observer.observe(rootNode, {childList: true, subtree: true});
  }
}