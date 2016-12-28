"use strict";

let FILE_LIST = [
    "/",
    "/index.html",
    "/scratchpad.css",
    "/scratchpad.js",
    "/service-worker.js",
];

let CACHE_NAME = "v1";
let REFRESH_DELAY = 5000;
let cachedFiles = {};

function log(s) {
  console.log(new Date().toISOString() + " " + s);
}

function installEvent(e) {
  log("installing " + e);
  let installedFiles = [];
  for (let path in cachedFiles) {
    let request = new Request(path);
    installedFiles.push(fetch(request).then(response => {
      return updateCache(path, request.clone(), response);
    }).catch(err => {
      log("installation failed for " + path + ": " + e);
    }));
  }
  e.waitUntil(Promise.all(installedFiles).then(() => {
    log("all files installed");
  }));
}

function updateCache(path, request, response) {
  let result = caches.open(CACHE_NAME).then(cache => {
    log("Adding cached value for " + path);
    cache.put(path, response);
  });
  let cacheObj = cachedFiles[path];
  if (cacheObj.timeout) {
    clearTimeout(cacheObj.timeout);
  }
  cacheObj.response = response;
  cacheObj.stale = false;
  cacheObj.timeout = setTimeout(() => {
    log("cache entry expired for " + path);
    cacheObj.stale = true;
    cacheObj.timeout = null; }, REFRESH_DELAY);
  return result;
}

function fetchEvent2(e) {
  let path = new URL(e.request.url).pathname;
  log("async fetch event for " + e.request.url + " " + path);
  e.respondWith(spawn(function *() {
    if (!path in cachedFiles) {
      log("uncached path " + path);
      return fetch(e.request);
    }
    
    if (cachedFiles[path].stale) {
      log("stale path " + path);
      let fetchResponse;
      try {
        fetchResponse = yield fetch(e.request);
      } catch (err) {
        log("cannot fetch: " + err);
        return caches.match(e.request.clone());
      }
      if (fetchResponse && fetchResponse.status == 200) {
        log("updating cache for stale file " + path);
        updateCache(path, e.request.clone(), fetchResponse.clone());
        return Promise.resolve(fetchResponse);
      } else {
        log("returning cache entry for stale file " + path);
        return caches.match(e.request.clone());
      }
    } else {
      log("unstale path " + path);
      let cacheResponse;
      try {
        cacheResponse = yield caches.match(e.request);
      } catch (err) {
        log("cannot get from cache: " + err);
        let fetchResponse = yield fetch(e.request.clone());
        if (fetchResponse && fetchResponse.status == 200) {
          log("updating cache for unstale file " + path);
          updateCache(path, e.request.clone(), fetchResponse.clone());
        }
        return fetchResponse;
      }
      
      return Promise.resolve(cacheResponse);
    }
  }));
}

function fetchEvent(e) {
  let path = new URL(e.request.url).pathname;
  log("fetch event for " + e.request.url + " " + path);
  if (!path in cachedFiles) {
    log("uncached path " + path);
    // We don't want to cache this file
    e.respondWith(fetch(e.request));
  }
  
  if (cachedFiles[path].stale) {
    log("stale path " + path);
    // The file is stale. Try the network, and if it fails, use the cache.
    e.respondWith(fetch(e.request).then(fetchResponse => {
      if (fetchResponse && fetchResponse.status == 200) {
        log("updating cache for stale file " + path);
        updateCache(path, e.request.clone(), fetchResponse.clone());
        return fetchResponse;
      } else {
        return caches.match(e.request.close());
      }
    }).catch(err => {
      log("fetch failed for " + path + ": " + err);
      return caches.match(e.request.clone());
    }));
  } else {
    // The file is not stale. Try the cache, and if it's not there, ask the network.
    log("valid path " + path);
    e.respondWith(caches.match(e.request).then(cacheMatch => {
      log("cache hit for " + path);
      return cacheMatch;
    }).catch(err => {
      log("cache error for " + path + ": " + err);
      fetch(e.request.clone()).then(fetchResponse => {
        if (fetchResponse && fetchResponse.status == 200) {
          log("populating cache from valid server response for " + path);
          updateCache(path, e.request.clone(), fetchResponse.clone());
        }
        log("responding for " + path);
        return response;
      });
    }));
  }
}

function spawn(generatorFunc) {
  function continuer(verb, arg) {
    var result;
    try {
      result = generator[verb](arg);
    } catch (err) {
      return Promise.reject(err);
    }
    if (result.done) {
      return result.value;
    } else {
      return Promise.resolve(result.value).then(onFulfilled, onRejected);
    }
  }
  var generator = generatorFunc();
  var onFulfilled = continuer.bind(continuer, "next");
  var onRejected = continuer.bind(continuer, "throw");
  return onFulfilled();
}

log("Service worker JS file running");

for (let i = 0; i < FILE_LIST.length; i++) {
  cachedFiles[FILE_LIST[i]] = { stale: true, response: null };
}

this.addEventListener("install", installEvent);
this.addEventListener("fetch", fetchEvent2);
