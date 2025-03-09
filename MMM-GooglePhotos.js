//
//
// MMM-GooglePhotos
//
Module.register("MMM-GooglePhotos", {
  defaults: {
    albums: [],
    updateInterval: 1000 * 30, // minimum 10 seconds.
    sort: "new", // "old", "random"
    uploadAlbum: null, // Only for created by `create_uploadable_album.js`
    condition: {
      fromDate: null, // Or "2018-03", RFC ... format available
      toDate: null, // Or "2019-12-25",
      minWidth: null, // Or 400
      maxWidth: null, // Or 8000
      minHeight: null, // Or 400
      maxHeight: null, // Or 8000
      minWHRatio: null,
      maxWHRatio: null,
      // WHRatio = Width/Height ratio ( ==1 : Squared Photo,   < 1 : Portraited Photo, > 1 : Landscaped Photo)
    },
    showWidth: 1080, // These values will be used for quality of downloaded photos to show. real size to show in your MagicMirror region is recommended.
    showHeight: 1920,
    timeFormat: "YYYY/MM/DD HH:mm",
    enableFaceFocus: false,
    autoInfoPosition: false    
  },
  requiresVersion: "2.24.0",

  suspended: false,

  getStyles: function () {
    return ["MMM-GooglePhotos.css"];
  },

  start: function () {
    this.uploadableAlbum = null;
    this.albums = null;
    this.scanned = [];
    this.updateTimer = null;
    this.index = 0;
    this.needMorePicsFlag = true;
    this.firstScan = true;
    if (this.config.updateInterval < 1000 * 10) this.config.updateInterval = 1000 * 10;
    this.config.condition = Object.assign({}, this.defaults.condition, this.config.condition);
    
    const config = { ...this.config };
    for (let i = 0; i < config.albums.length; i++) {
      const album = config.albums[i];
      if (album instanceof RegExp) {
        config.albums[i] = {
          source: album.source,
          flags: album.flags,
        };
      }
    }

    this.sendSocketNotification("INIT", config);
    this.dynamicPosition = 0;
  },

  socketNotificationReceived: function (noti, payload) {
    if (noti === "UPLOADABLE_ALBUM") {
      this.uploadableAlbum = payload;
    }
    if (noti === "INITIALIZED") {
      this.albums = payload;      
    }
    if (noti === "UPDATE_ALBUMS") {
      this.albums = payload;
    }
    if (noti === "MORE_PICS") {
      if (payload && Array.isArray(payload) && payload.length > 0) this.needMorePicsFlag = false;
      this.scanned = payload;
      this.index = 0;
      if (this.firstScan) {
        this.updatePhotos(); //little faster starting
      }
    }
    if (noti === "SETIMAGEWITHBACKGROUNDCOLOR") {		
      var color = payload.IMGAVGCOLOR.rgba;	
      document.getElementById("GPHOTO_BACK").style.filter = ''
      document.getElementById("GPHOTO_BACK").style.backgroundColor = color			
      this.setImageSize(payload.IMGSIZE);
      
      let topdiv = document.getElementById("GPHOTO_TOP")
      topdiv.style.opacity = "1";
      topdiv.classList.add("animated_block")  
      var current = document.getElementById("GPHOTO_CURRENT")       
      current.classList.add(this.AnimationEffect);
    }	
    if (noti === "SETIMAGEWITHBACKGROUNDCOLORWITHFACE") {		
      var color = payload.IMGAVGCOLOR.rgba;	
      document.getElementById("GPHOTO_BACK").style.filter = ''
      document.getElementById("GPHOTO_BACK").style.backgroundColor = color			
      
      var enc = new TextDecoder("utf-8");
      var obj = JSON.parse(enc.decode(payload.IMGFACE))      
      if(obj.count > 0 && Math.floor(Math.random() * (5)) != 0) // use default effect for 20%
        this.setImageFace(payload.IMGFACE)      
      else
        this.setImageSize(payload.IMGSIZE)   
      
      let topdiv = document.getElementById("GPHOTO_TOP")
      topdiv.style.opacity = "1";
      topdiv.classList.add("animated_block")  
      var current = document.getElementById("GPHOTO_CURRENT")       
      current.classList.add(this.AnimationEffect);
    }	
    if (noti === "ERROR") {
      const current = document.getElementById("GPHOTO_CURRENT");
      const errMsgDiv = document.createElement("div");
      errMsgDiv.style.textAlign = "center";
      errMsgDiv.style.lineHeight = "80vh";
      errMsgDiv.style.fontSize = "1.5em";
      errMsgDiv.style.verticalAlign = "middle";
      errMsgDiv.textContent = payload;
      current.appendChild(errMsgDiv);
    }
  },
  setImageSize:function(payload) {
    this.AnimationEffect = "zoom-in";		
		var current = document.getElementById("GPHOTO_CURRENT")
	
		var photoAspectRatio = payload.width / payload.height;
		var displayAspectRatio = this.config.showWidth / this.config.showHeight;
		
		var animationKind;
		
    var animationX = Math.floor(Math.random() * (3)); //0~2
    var animationY = Math.floor(Math.random() * (3)); //0~2
    var animationZ = Math.floor(Math.random() * (3)); //0~2

    if(Math.abs(photoAspectRatio - displayAspectRatio) < 0.16) // Full Screen
		{
			increaseLength = (Math.abs(photoAspectRatio - displayAspectRatio) * this.config.showHeight + 100)/2 ;
			
			current.style.top = "-"+increaseLength+"px";
			current.style.left = "-"+increaseLength+"px";
			current.style.right = "-"+increaseLength+"px";
			current.style.bottom = "-"+increaseLength+"px";					
		}
		else
		{
			current.style.top = "-50px";
			current.style.left = "-50px";
			current.style.right = "-50px";
      current.style.bottom = "-50px";			

			if(photoAspectRatio - displayAspectRatio > 0)  
				  animationY = 2; // landscape, don't move up and down
			else
				  animationX = 2; // portrait, don't move left and right
    }		 

    var fromX,toX, fromY,toY, fromZ, toZ;
    switch(animationX)
    {
      case 0: //move to left
        fromX = "50px"; toX = "-50px"; break;
      case 1: //move to right
        fromX = "-50px"; toX = "50px"; break;
      default: //stay
        fromX = "0px"; toX = "0px"; break;
    }
    switch(animationY)
    {
      case 0: //move to up
        fromY = "-50px"; toY = "50px"; break;
      case 1: //move to down
        fromY = "50px"; toY = "-50px"; break;
      default: //stay
        fromY = "0px"; toY = "0px"; break;
    }
    switch(animationZ)
    {
      case 0: //zoom-in
        fromZ = "1"; toZ = "1.1"; break;
      case 1: //zoom-out
        fromZ = "1.1"; toZ = "1"; break;
      default: //stay
        fromZ = "1"; toZ = "1"; break;
    }    

    this.AnimationEffect = "move-size";
    var cssstyle = document.getElementById("cssstyle");
    cssstyle.innerHTML = '@keyframes move-size { from{transform: translate('+ fromX+', '+ fromY+') scale('+fromZ+', '+fromZ+');} to{transform: translate('+ toX+', '+ toY+') scale('+toZ+', '+toZ+');} }';    
    cssstyle.innerHTML +='  #GPHOTO_CURRENT.move-size { animation-name: move-size;  animation-duration: '+(this.config.updateInterval/1000 + 10)+'s; }';
	
  },
  setImageFace:function(payload) {
    this.AnimationEffect = "zoom-in";		
    var enc = new TextDecoder("utf-8");
    var obj = JSON.parse(enc.decode(payload))
    
    var current = document.getElementById("GPHOTO_CURRENT")   
    
    var animationZ = Math.floor(Math.random() * (2)); //0~2

    var targetFaceX = 0;
    var targetFaceY = 0;
    var targetFaceWidth = 0;
    var targetFaceHeight = 0;

    //Randomly select face for animation
    var targetFace = Math.floor(Math.random() * (obj.count)); //face count

    targetFaceX = obj.faces[targetFace].x + (obj.faces[targetFace].w /2);
    targetFaceY = obj.faces[targetFace].y + (obj.faces[targetFace].h /2);
    targetFaceWidth = obj.faces[targetFace].w;
    targetFaceHeight = obj.faces[targetFace].h;
    
    targetFaceRaio = targetFaceWidth> 500 ? 1 : 500 / targetFaceWidth;
    targetFaceXDifferential = targetFaceX - (this.config.showWidth / 2)
    targetFaceYDifferential = targetFaceY - (this.config.showHeight / 2)


    var fromX,toX, fromY,toY, fromZ, toZ;
    if(animationZ == 0) //zoomin
    {
        fromX = "0px"; toX = (targetFaceXDifferential/4*-1) + "px"; 
        fromY = "0px"; toY = (targetFaceYDifferential/4*-1) + "px";
        fromZ = "1"; toZ = Math.min(Math.round(1*targetFaceRaio,2) , 1.25);
    }
    else if(animationZ == 1) //zoom out
    {
      toX = "0px"; fromX = (targetFaceXDifferential/4*-1) + "px"; 
      toY = "0px"; fromY = (targetFaceYDifferential/4*-1) + "px";
      toZ = "1"; fromZ = Math.min(Math.round(1*targetFaceRaio,2) , 1.25);
    } 
    else ////no zoom
    {
      fromX = "0px"; toX = (targetFaceXDifferential/4*-1) + "px"; 
      fromY = "0px"; toY = (targetFaceYDifferential/4*-1) + "px";
      fromZ = "1"; toZ = "1";;
    }
    this.AnimationEffect = "move-size";
    var cssstyle = document.getElementById("cssstyle");
    cssstyle.innerHTML = '@keyframes move-size { from {transform: translate('+ fromX+', '+ fromY+') scale('+fromZ+', '+fromZ+');} to {transform: translate('+ toX+', '+ toY+') scale('+toZ+', '+toZ+');} }';    
    cssstyle.innerHTML +='  #GPHOTO_CURRENT.move-size { animation-name: move-size;  animation-duration: '+(this.config.updateInterval/1000 + 10)+'s; }';
  },
  notificationReceived: function (noti, payload, sender) {
    if (noti === "GPHOTO_NEXT") {
      this.updatePhotos();
    }
    if (noti === "GPHOTO_PREVIOUS") {
      this.updatePhotos(-2);
    }
    if (noti === "GPHOTO_UPLOAD") {
      this.sendSocketNotification("UPLOAD", payload);
    }
  },

  updatePhotos: function (dir = 0) {
    Log.debug("Updating photos..");
    this.firstScan = false;

    if (this.scanned.length === 0) {
      this.sendSocketNotification("NEED_MORE_PICS", []);
      return;
    }
    if (this.suspended) {
      this.sendSocketNotification("MODULE_SUSPENDED_SKIP_UPDATE");
      let info = document.getElementById("GPHOTO_INFO");
      info.innerHTML = "";
      return;
    }
    this.index = this.index + dir; //only used for reversing
    if (this.index < 0) this.index = this.scanned.length + this.index;
    if (this.index >= this.scanned.length) {
      this.index -= this.scanned.length;
    }
    let target = this.scanned[this.index];
    let url = target.baseUrl + `=w${this.config.showWidth}-h${this.config.showHeight}`;
    this.ready(url, target);
    this.index++;
    if (this.index >= this.scanned.length) {
      this.index = 0;
      this.needMorePicsFlag = true;
    }
    
    if(this.config.enableFaceFocus == true)
    {
      this.sendSocketNotification("GET_IMAGE_WITH_BACKGROUD_COLOR_FACEFOCUS", url);
    }
    else
    {
      this.sendSocketNotification("GET_IMAGE_WITH_BACKGROUD_COLOR", url);
    }

    if (this.needMorePicsFlag) {
      setTimeout(() => {
        this.sendSocketNotification("NEED_MORE_PICS", []);
      }, 2000);
    }
  },

  ready: function (url, target) {
    let hidden = document.createElement("img");
    const _this = this;
    hidden.onerror = (event, source, lineno, colno, error) => {
      const errObj = { url, event, source, lineno, colno, error };
      this.sendSocketNotification("IMAGE_LOAD_FAIL", errObj);
    };
    hidden.onload = () => {
      _this.render(url, target);
    };
    hidden.src = url;
  },

  render: function (url, target) {
    let back = document.getElementById("GPHOTO_BACK");
    let current = document.getElementById("GPHOTO_CURRENT");
    current.textContent = "";
    current.style.backgroundImage = `url(${url})`;
    current.classList.add("animated");
    const info = document.getElementById("GPHOTO_INFO");
    const album = Array.isArray(this.albums) ? this.albums.find((a) => a.id === target._albumId) : { id: -1, title: '' };
    if (this.config.autoInfoPosition) {
      let op = (album, target) => {
        let now = new Date();
        let q = Math.floor(now.getMinutes() / 15);
        let r = [
          [0, "none", "none", 0],
          ["none", "none", 0, 0],
          ["none", 0, 0, "none"],
          [0, 0, "none", "none"],
        ];
        return r[q];
      };
      if (typeof this.config.autoInfoPosition === "function") {
        op = this.config.autoInfoPosition;
      }
      const [top, left, bottom, right] = op(album, target);
      info.style.setProperty("--top", top);
      info.style.setProperty("--left", left);
      info.style.setProperty("--bottom", bottom);
      info.style.setProperty("--right", right);
    }
    info.innerHTML = "";
    let albumCover = document.createElement("div");
    albumCover.classList.add("albumCover");
    albumCover.style.backgroundImage = `url(modules/MMM-GooglePhotos/cache/${album.id})`;
    let albumTitle = document.createElement("div");
    albumTitle.classList.add("albumTitle");
    albumTitle.innerHTML = album.title;
    let photoTime = document.createElement("div");
    photoTime.classList.add("photoTime");
    photoTime.innerHTML = this.config.timeFormat === "relative" ? moment(target.mediaMetadata.creationTime).fromNow() : moment(target.mediaMetadata.creationTime).format(this.config.timeFormat);
    let infoText = document.createElement("div");
    infoText.classList.add("infoText");

    info.appendChild(albumCover);
    infoText.appendChild(albumTitle);
    infoText.appendChild(photoTime);
    info.appendChild(infoText);
    this.sendSocketNotification("IMAGE_LOADED", { id: target.id, index: this.index });
  },

  getDom: function () {
    let wrapper = document.createElement("div");
    wrapper.id = "GPHOTO";
    let back = document.createElement("div");
    back.id = "GPHOTO_BACK";
    back.classList.add("backgroundFilter")    
    let current = document.createElement("div");
    current.id = "GPHOTO_CURRENT";
    if (this.data.position.search("fullscreen") === -1) {
      if (this.config.showWidth) wrapper.style.width = this.config.showWidth + "px";
      if (this.config.showHeight) wrapper.style.height = this.config.showHeight + "px";
    }
    current.addEventListener("animationend", () => {
      current.classList.remove("animated");
    });
    let info = document.createElement("div");
    info.id = "GPHOTO_INFO";
    info.innerHTML = "Loading...";
    let topdiv = document.createElement("div")
    topdiv.id = "GPHOTO_TOP"
    topdiv.style.willChange = 'opacity';
    topdiv.addEventListener('animationend', ()=>{
      if(topdiv.classList.contains("animated_block")) {
        topdiv.classList.remove("animated_block")
        topdiv.style.opacity = "0";          
        this.fadeoutTimer = setTimeout(()=>{
          clearTimeout(this.fadeoutTimer)
          topdiv.classList.add("animated_trans")
        }, this.config.updateInterval-4000)
      }else if(topdiv.classList.contains("animated_trans")) {
        topdiv.classList.remove("animated_trans")
        topdiv.style.opacity = "1";		
        current.classList.remove(this.AnimationEffect);
        this.updatePhotos()				
      }
    })
    wrapper.appendChild(back);
    wrapper.appendChild(current);
    wrapper.appendChild(topdiv)
    wrapper.appendChild(info);
    let cssstyle = document.createElement('style');
    cssstyle.id = "cssstyle";
    wrapper.appendChild(cssstyle);
    Log.info("updated!");
    return wrapper;
  },

  suspend() {
    this.suspended = true;
  },

  resume() {
    this.suspended = false;
  },
});
