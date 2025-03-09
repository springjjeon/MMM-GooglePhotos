"use strict";

const fs = require("fs");
const { writeFile, readFile } = require("fs/promises");
const path = require("path");
const moment = require("moment");
const { Readable } = require("stream");
const { finished } = require("stream/promises");
const { RE2 } = require("re2-wasm");
const { Set } = require('immutable');
const NodeHelper = require("node_helper");
const Log = require("logger");
const GP = require("./GPhotos.js");
const authOption = require("./google_auth.json");
const { shuffle } = require("./shuffle.js");
const { error_to_string } = require("./error_to_string");
const { ConfigFileError, AuthError } = require("./Errors.js");
const getAverageColor = require('fast-average-color-node');
const probe = require('probe-image-size');


const ONE_DAY = 24 * 60 * 60 * 1000; // 1 day in milliseconds

/**
 * @type {GP}
 */
let GPhotos = null;

const NodeHeleprObject = {
  start: function () {
    this.scanInterval = 1000 * 60 * 55; // fixed. no longer needs to be fixed
    this.config = {};
    this.scanTimer = null;
    /** @type {Promise<GooglePhotos.Album[]>} */
    this.selecetedAlbums = [];
    /** @type {MediaItem[]} */
    this.photos = [];
    this.localPhotoList = [];
    this.localPhotoPntr = 0;
    this.lastLocalPhotoPntr = 0;
    this.queue = null;
    this.uploadAlbumId;
    this.initializeTimer = null;

    this.CACHE_ALBUMNS_PATH = path.resolve(this.path, "cache", "selecetedAlbumsCache.json");
    this.CACHE_PHOTOLIST_PATH = path.resolve(this.path, "cache", "photoListCache.json");
    this.CACHE_CONFIG = path.resolve(this.path, "cache", "config.json");
  },

  socketNotificationReceived: function (notification, payload) {
    switch (notification) {
      case "INIT":
        this.initializeAfterLoading(payload);
        break;
      case "UPLOAD":
        this.upload(payload);
        break;
      case "IMAGE_LOAD_FAIL":
        {
          const { url, event, source, lineno, colno, error } = payload;
          Log.error("[GPHOTO] hidden.onerror", { event, source, lineno, colno });
          if (error) {
            Log.error("[GPHOTO] hidden.onerror error", error.message, error.name, error.stack);
          }
          Log.error("Image loading fails. Check your network.:", url);
          this.prepAndSendChunk(Math.ceil((20 * 60 * 1000) / this.config.updateInterval)).then(); // 20min * 60s * 1000ms / updateinterval in ms
        }
        break;
      case "IMAGE_LOADED":
        {
          const { id, index } = payload;
          this.log_debug("Image loaded:", `${this.lastLocalPhotoPntr} + ${index}`, id);
        }
        break;
      case "NEED_MORE_PICS":
        {
          Log.info("Used last pic in list");
          this.prepAndSendChunk(Math.ceil((20 * 60 * 1000) / this.config.updateInterval)).then(); // 20min * 60s * 1000ms / updateinterval in ms
        }
        break;
      case "MODULE_SUSPENDED_SKIP_UPDATE":
        this.log_debug("Module is suspended so skip the UI update");
        break;
      case "GET_IMAGE_AVERAGE_COLOR":
        this.getImageAverageColor(payload)		
        break;
      default:
        Log.error("Unknown notification received", notification);
    }
  },

  log_debug: function (...args) {
    if (this.debug) Log.info("[GPHOTOS] [node_helper]", ...args);
  },

  upload: async function (path) {
    if (!this.uploadAlbumId) {
      Log.info("No uploadable album exists.");
      return;
    }
    let uploadToken = await GPhotos.upload(path);
    if (uploadToken) {
      await GPhotos.create(uploadToken, this.uploadAlbumId);
      Log.info("Upload completed.");
    } else {
      Log.error("Upload Fails.");
    }
  },
  getImageAverageColor: async function(imgURL) {      
    let result = await probe(imgURL);  
    Log.info('probe', result);
    getAverageColor.getAverageColor(imgURL).then(color => {
    Log.info('getAverageColor',color);
    this.sendSocketNotification("IMGAVGCOLOR", {"IMGAVGCOLOR":color,"IMGSIZE":result});
    });  
  },
  initializeAfterLoading: function (config) {
    this.config = config;
    this.debug = config.debug ? config.debug : false;

    GPhotos = new GP({
      authOption: authOption,
      debug: this.debug,
    });

    this.albumsFilters = [];
    for (let album of config.albums) {
      if (album.hasOwnProperty("source") && album.hasOwnProperty("flags")) {
        this.albumsFilters.push(new RE2(album.source, album.flags + 'u'));
      } else {
        this.albumsFilters.push(album);
      }
    }
    delete this.config.albums;

    this.tryToIntitialize();
  },

  tryToIntitialize: async function () {
    //set timer, in case if fails to retry in 3 min
    clearTimeout(this.initializeTimer);
    this.initializeTimer = setTimeout(
      () => {
        this.tryToIntitialize();
      },
      3 * 60 * 1000
    );

    Log.info("Starting Initialization");

    //load cached album list - if available
    const cacheAlbumDt = new Date(await this.readCacheConfig("CACHE_ALBUMNS_PATH"));
    const notExpiredCacheAlbum = cacheAlbumDt && (Date.now() - cacheAlbumDt.getTime() < ONE_DAY);
    if (notExpiredCacheAlbum && fs.existsSync(this.CACHE_ALBUMNS_PATH)) {
      Log.info("Loading cached albumns list");
      try {
        const data = await readFile(this.CACHE_ALBUMNS_PATH, "utf-8");
        this.selecetedAlbums = JSON.parse(data.toString());
        this.log_debug("successfully loaded selecetedAlbums");
        this.sendSocketNotification("UPDATE_ALBUMS", this.selecetedAlbums); // for fast startup
      } catch (err) {
        Log.error("unable to load selecetedAlbums cache", err);
      }
    }

    //load cached list - if available
    const cachePhotoListDt = new Date(await this.readCacheConfig("CACHE_PHOTOLIST_PATH"));
    const notExpiredCachePhotoList = cachePhotoListDt && (Date.now() - cachePhotoListDt.getTime() < ONE_DAY);
    if (notExpiredCachePhotoList && fs.existsSync(this.CACHE_PHOTOLIST_PATH)) {
      Log.info("Loading cached albumns list");
      try {
        const data = await readFile(this.CACHE_PHOTOLIST_PATH, "utf-8");
        this.localPhotoList = JSON.parse(data.toString());
        if (this.config.sort === "random") {
          shuffle(this.localPhotoList);
        }
        this.log_debug("successfully loaded photo list cache of ", this.localPhotoList.length, " photos");
        await this.prepAndSendChunk(5); // only 5 for extra fast startup
      } catch (err) {
        Log.error("unable to load photo list cache", err);
      }
    }

    Log.info("Initialization complete!");
    clearTimeout(this.initializeTimer);
    Log.info("Start first scanning.");
    this.startScanning();
  },

  prepAndSendChunk: async function (desiredChunk = 50) {
    try {
      //find which ones to refresh
      if (this.localPhotoPntr < 0 || this.localPhotoPntr >= this.localPhotoList.length) {
        this.localPhotoPntr = 0;
        this.lastLocalPhotoPntr = 0;
      }
      let numItemsToRefresh = Math.min(desiredChunk, this.localPhotoList.length - this.localPhotoPntr, 50); //50 is api limit
      this.log_debug("num to ref: ", numItemsToRefresh, ", DesChunk: ", desiredChunk, ", totalLength: ", this.localPhotoList.length, ", Pntr: ", this.localPhotoPntr);

      // refresh them
      let list = [];
      if (numItemsToRefresh > 0) {
        list = await GPhotos.updateTheseMediaItems(this.localPhotoList.slice(this.localPhotoPntr, this.localPhotoPntr + numItemsToRefresh));
      }

      if (list.length > 0) {
        // update the localList
        this.localPhotoList.splice(this.localPhotoPntr, list.length, ...list);

        // send updated pics
        this.sendSocketNotification("MORE_PICS", list);

        // update pointer
        this.lastLocalPhotoPntr = this.localPhotoPntr;
        this.localPhotoPntr = this.localPhotoPntr + list.length;
        this.log_debug("refreshed: ", list.length, ", totalLength: ", this.localPhotoList.length, ", Pntr: ", this.localPhotoPntr);
      } else {
        Log.error("couldn't send ", list.length, " pics");
      }
    } catch (err) {
      Log.error("failed to refresh and send chunk: ");
      Log.error(error_to_string(err));
    }
  },

  /**
   * @returns {Promise<GooglePhotos.Album[]>}
   */
  getAlbums: async function () {
    try {
      let r = await GPhotos.getAlbums();
      return r;
    } catch (err) {
      if (err instanceof ConfigFileError || err instanceof AuthError) {
        this.sendSocketNotification("ERROR", err.message);
      }
      Log.error(error_to_string(err));
      throw err;
    }
  },

  startScanning: function () {
    const fn = () => {
      const nextScanDt = new Date(Date.now() + this.scanInterval);
      this.scanJob().then(() => {
        Log.info("Next scan will be at", nextScanDt);
      });
    };
    // set up interval, then 1 fail won't stop future scans
    this.scanTimer = setInterval(fn, this.scanInterval);
    // call for first time
    fn();
  },

  scanJob: async function () {
    Log.info("Start Album scanning");
    this.queue = null;
    await this.getAlbumList();
    try {
      if (this.selecetedAlbums.length > 0) {
        this.photos = await this.getImageList();
        return true;
      } else {
        Log.warn("There is no album to get photos.");
        return false;
      }
    } catch (err) {
      Log.error(error_to_string(err));
    }
  },

  getAlbumList: async function () {
    Log.info("Getting album list");
    /**
     * @type {GooglePhotos.Album[]}
     */
    let albums = await this.getAlbums();
    if (this.config.uploadAlbum) {
      const uploadAlbum = albums.find((a) => a.title === this.config.uploadAlbum);
      if (uploadAlbum) {
        if (uploadAlbum.hasOwnProperty("shareInfo") && uploadAlbum.isWriteable) {
          Log.info("Confirmed Uploadable album:", this.config.uploadAlbum, uploadAlbum.id);
          this.uploadAlbumId = uploadAlbum.id;
          this.sendSocketNotification("UPLOADABLE_ALBUM", this.config.uploadAlbum);
        } else {
          Log.error("This album is not uploadable:", this.config.uploadAlbum);
        }
      } else {
        Log.error("Can't find uploadable album :", this.config.uploadAlbum);
      }
    }
    /**
     * @type {GooglePhotos.Album[]}
     */
    let selecetedAlbums = [];
    for (let ta of this.albumsFilters) {
      const matches = albums.filter((a) => {
        if (ta instanceof RE2) {
          Log.debug(`RE2 match ${ta.source} -> '${a.title}' : ${ta.test(a.title)}`);
          return ta.test(a.title);
        }
        else {
          return ta === a.title;
        }
      });
      if (matches.length === 0) {
        Log.warn(`Can't find "${ta instanceof RE2 ? ta.source : ta}" in your album list.`);
      }
      else {
        selecetedAlbums.push(...matches);
      }
    }
    selecetedAlbums = Set(selecetedAlbums).toArray();
    Log.info("Finish Album scanning. Properly scanned :", selecetedAlbums.length);
    Log.info("Albums:", selecetedAlbums.map((a) => a.title).join(", "));
    this.writeFileSafe(this.CACHE_ALBUMNS_PATH, JSON.stringify(selecetedAlbums, null, 4), "Album list cache");
    this.saveCacheConfig("CACHE_ALBUMNS_PATH", new Date().toISOString());

    for (let a of selecetedAlbums) {
      let url = a.coverPhotoBaseUrl + "=w160-h160-c";
      let fpath = path.join(this.path, "cache", a.id);
      let file = fs.createWriteStream(fpath);
      const response = await fetch(url);
      await finished(Readable.fromWeb(response.body).pipe(file));
    }
    this.selecetedAlbums = selecetedAlbums;
    Log.info("getAlbumList done");
    this.sendSocketNotification("INITIALIZED", selecetedAlbums);
  },

  getImageList: async function () {
    let condition = this.config.condition;
    let photoCondition = (photo) => {
      if (!photo.hasOwnProperty("mediaMetadata")) return false;
      let data = photo.mediaMetadata;
      if (data.hasOwnProperty("video")) return false;
      if (!data.hasOwnProperty("photo")) return false;
      let ct = moment(data.creationTime);
      if (condition.fromDate && moment(condition.fromDate).isAfter(ct)) return false;
      if (condition.toDate && moment(condition.toDate).isBefore(ct)) return false;
      if (condition.minWidth && Number(condition.minWidth) > Number(data.width)) return false;
      if (condition.minHeight && Number(condition.minHeight) > Number(data.height)) return false;
      if (condition.maxWidth && Number(condition.maxWidth) < Number(data.width)) return false;
      if (condition.maxHeight && Number(condition.maxHeight) < Number(data.height)) return false;
      let whr = Number(data.width) / Number(data.height);
      if (condition.minWHRatio && Number(condition.minWHRatio) > whr) return false;
      if (condition.maxWHRatio && Number(condition.maxWHRatio) < whr) return false;
      return true;
    };
    // let sort = (a, b) => {
    //   let at = moment(a.mediaMetadata.creationTime);
    //   let bt = moment(b.mediaMetadata.creationTime);
    //   if (at.isBefore(bt) && this.config.sort === "new") return 1;
    //   if (at.isAfter(bt) && this.config.sort === "old") return 1;
    //   return -1;
    // };
    /** @type {MediaItem[]} */
    let photos = [];
    try {
      for (let album of this.selecetedAlbums) {
        this.log_debug(`Prepare to get photo list from '${album.title}'`);
        let list = await GPhotos.getImageFromAlbum(album.id, photoCondition);
        list.forEach((i) => {
          i._albumTitle = album.title;
        });
        this.log_debug(`Got ${list.length} photo(s) from '${album.title}'`);
        photos = photos.concat(list);
      }
      if (photos.length > 0) {
        if (this.config.sort === "new" || this.config.sort === "old") {
          photos.sort((a, b) => {
            let at = moment(a.mediaMetadata.creationTime);
            let bt = moment(b.mediaMetadata.creationTime);
            if (at.isBefore(bt) && this.config.sort === "new") return 1;
            if (at.isAfter(bt) && this.config.sort === "old") return 1;
            return -1;
          });
        } else {
          shuffle(photos);
        }
        Log.info(`Total indexed photos: ${photos.length}`);
        this.localPhotoList = [...photos];
        this.localPhotoPntr = 0;
        this.lastLocalPhotoPntr = 0;
        this.prepAndSendChunk(50).then();
        this.writeFileSafe(this.CACHE_PHOTOLIST_PATH, JSON.stringify(photos, null, 4), "Photo list cache");
        this.saveCacheConfig("CACHE_PHOTOLIST_PATH", new Date().toISOString());
      }

      return photos;
    } catch (err) {
      Log.error(error_to_string(err));
    }
  },

  stop: function () {
    clearInterval(this.scanTimer);
  },

  readFileSafe: async function (filePath, fileDescription) {
    try {
      const data = await readFile(filePath, "utf-8");
      return data.toString();
    } catch (err) {
      Log.error(`unable to read ${fileDescription}: ${filePath}`);
      Log.error(error_to_string(err));
    }
  },

  writeFileSafe: async function (filePath, data, fileDescription) {
    try {
      await writeFile(filePath, data);
      this.log_debug(fileDescription + " saved");
    } catch (err) {
      Log.error(`unable to write ${fileDescription}: ${filePath}`);
      Log.error(error_to_string(err));
    }
  },

  readCacheConfig: async function (key) {
    try {
      let config = {};
      if (fs.existsSync(this.CACHE_CONFIG)) {
        const configStr = await this.readFileSafe(this.CACHE_CONFIG, "Cache Config");
        config = JSON.parse(configStr);
      }
      if (Object(config).hasOwnProperty(key)) {
        return config[key];
      }
      else {
        return undefined;
      }
    } catch (err) {
      Log.error(`unable to read Cache Config`);
      Log.error(error_to_string(err));
    }
  },

  saveCacheConfig: async function (key, value) {
    try {
      let config = {};
      if (fs.existsSync(this.CACHE_CONFIG)) {
        const configStr = await this.readFileSafe(this.CACHE_CONFIG, "Cache Config");
        config = JSON.parse(configStr);
      }
      config[key] = value;
      await this.writeFileSafe(this.CACHE_CONFIG, JSON.stringify(config, null, 4), "Cache Config");
      this.log_debug("Cache Config saved");
    } catch (err) {
      Log.error(`unable to write Cache Config`);
      Log.error(error_to_string(err));
    }
  },
};

module.exports = NodeHelper.create(NodeHeleprObject);
