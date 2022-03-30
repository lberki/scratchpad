"use strict";

// - Figure out how to update the web page quickly during development
// - Tweak timeouts (e.g. service worker staling) for production
// - Figure out if we what prod and dev to be any different
// - Somehow indicate if offline mode is properly installed
// - favicon
// - Shortcut for New/Delete buttons (or make them focusable or something)
let itemIds = [];
let selectedItem = null;
let selectedId = null;

let changeTimeoutId = null;

let UPDATE_TIMEOUT = 2000;
let WHITESPACE_REGEX = /^\s*$/;

function log(s) {
  console.log(new Date().toISOString() + " " + s);
}

function generateId() {
  let digits = "0123456789abcdef";
  let result = "";
  for (let i = 0; i < 32; i++) {
    result = result + digits[Math.floor(Math.random() * 16)];
  }

  return result;
}

function updateDatabaseFromChange() {
  log("update");
  markChangesAsCommitted();
  selectedItem.title = document.querySelector(".title").value;
  selectedItem.content = document.querySelector(".content").value;
  localStorage.setItem("item:" + selectedId, JSON.stringify(selectedItem));
  refreshItemList();
}

function itemChanged() {
  if (changeTimeoutId !== null) {
    clearTimeout(changeTimeoutId);
  }

  changeTimeoutId = setTimeout(updateDatabaseFromChange, UPDATE_TIMEOUT);
  document.querySelector(".changed_marker").style.visibility = "visible";
}

function itemKeyDown(id, e) {
  let currentIndex = itemIds.indexOf(id);
  let newIndex;
  if (e.keyCode == 13) {
    log("enter 3 " + id);
    selectItem(id);
    e.preventDefault();
  }
  
  if (e.keyCode == 40) {
    log("down " + id);
    newIndex = currentIndex + 1;
  } else if (e.keyCode == 38) {
    log("up " + id);
    newIndex = currentIndex - 1;
  } else {
    return;
  }
  
  if (newIndex >= 0 && newIndex < itemIds.length) {
    log(newIndex);
    document.querySelector(".items_pane").childNodes[newIndex].focus();
  }
}

function createListItem(id, item, tabIndex) {
  let result = document.createElement("div");
  // Theoretically, we should check if there are any
  result.textContent = item.title.match(WHITESPACE_REGEX) ? "(empty)" : item.title;
  result.className = id == selectedId ? "item selected_item" : "item";
  result.setAttribute("tabindex", tabIndex);
  result.addEventListener("click", () => { selectItem(id); });
  result.addEventListener("keydown", e => { itemKeyDown(id, e); });
  return result;
}

function getListElementById(id) {
  return document.querySelector(".items_pane").childNodes[itemIds.indexOf(id)];
}

function markChangesAsCommitted() {
  clearTimeout(changeTimeoutId);
  changeTimeoutId = null;
  document.querySelector(".changed_marker").style.visibility = "hidden";
}
function selectItem(id) {
  if (id === selectedId) {
    let contentElement = document.querySelector(".content");
    contentElement.select();
    contentElement.focus();
    return;
  }
  
  if (changeTimeoutId !== null) {
    updateDatabaseFromChange();
  }
  if (selectedId !== null) {
    let currentElement = getListElementById(selectedId);
    currentElement.className = "item";
  }
  
  if (id !== null && itemIds.indexOf(id) >= 0) {
    let newElement = document.querySelector(".items_pane").childNodes[itemIds.indexOf(id)];
    newElement.className = "item selected_item";
    selectedItem = JSON.parse(localStorage.getItem("item:" + id));
    selectedId = id;
    updateContent();

    let contentElement = document.querySelector(".content");
    contentElement.select();
    contentElement.focus();
  } else {
    selectedItem = null;
    selectedId = null;
    updateContent();
  }
}

function updateContent() {
  if (changeTimeoutId !== null) {
    markChangesAsCommitted();
  }
  let contentElement = document.querySelector(".content");
  let titleElement = document.querySelector(".title");

  if (selectedItem === null) {
    contentElement.value = "";
    contentElement.disabled = true;
    titleElement.value = "";
    titleElement.disabled = true;
  } else {
    contentElement.value = selectedItem.content;
    contentElement.disabled = false;
    titleElement.value = selectedItem.title;
    titleElement.disabled = false;
  }
}

function initializeDatabase() {
  log("initializing database on first startup");
  let initialId = generateId();
  localStorage.setItem("items", JSON.stringify([initialId]));
  localStorage.setItem("item:" + initialId, JSON.stringify({
    title: "First item",
    content: "Type something here."}));
}

function refreshItemList() {
  itemIds = JSON.parse(localStorage.getItem("items"));
  let itemsNode = document.querySelector(".items_pane");
  let focusedIndex = null;
  if (document.activeElement !== null && document.activeElement.parentNode === itemsNode) {
    focusedIndex = Array.prototype.indexOf.call(itemsNode.childNodes, document.activeElement);
  }
  while (itemsNode.firstChild) {
    itemsNode.removeChild(itemsNode.firstChild);
  }

  for (let i = 0; i < itemIds.length; i++) {
    let id = itemIds[i];
    let element = createListItem(id, JSON.parse(localStorage.getItem("item:" + id)), i + 3);
    itemsNode.appendChild(element);
  }
  
  if (focusedIndex !== null) {
    log("fi " + focusedIndex + " " + itemsNode.childNodes.length);
    itemsNode.childNodes[focusedIndex].focus();
  }
}

function newItem() {
  let id = generateId();
  let item = { title: "New", content: "" };
  localStorage.setItem("item:" + id, JSON.stringify(item));
  itemIds.push(id);
  localStorage.setItem("items", JSON.stringify(itemIds));
 
  refreshItemList();
  selectItem(id);

  let titleElement = document.querySelector(".title");
  titleElement.select();
  titleElement.focus();
}

function deleteCurrentItem() {
  if (selectedId === null) {
    return;
  }

  let deleteId = selectedId;
  selectItem(null);
  let idx = itemIds.indexOf(deleteId);
  itemIds.splice(idx, 1);
  localStorage.removeItem("item:" + deleteId);
  localStorage.setItem("items", JSON.stringify(itemIds));
  refreshItemList();
}

function onLoad() {
  if (localStorage.getItem("items") === null) {
    // First startup. Initialize the local storage with something reasonable.
    initializeDatabase();
  }

  navigator.serviceWorker.register("service-worker.js", { scope: "./" })
      .then(r => {
        log("service worker installed: " + r);
      })
      .catch(e => {
        log("could not install service worker: " + e);
      });

  refreshItemList();
  selectItem(itemIds[0]);
}

window.addEventListener("load", onLoad);
