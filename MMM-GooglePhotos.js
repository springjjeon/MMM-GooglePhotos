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
    autoInfoPosition: false,
	  enableAnimatedPhotoEffect : false,
  },

  getStyles: function() {
    return ["MMM-GooglePhotos.css"]
  },
      
  start: function() {
    this.uploadableAlbum = null
    this.albums = null
    this.scanned = []
    this.updateTimer = null
    this.index = 0
    this.firstScan = true
    if (this.config.updateInterval < 1000 * 10) this.config.updateInterval = 1000 * 10
    this.config.condition = Object.assign({}, this.defaults.condition, this.config.condition)
    this.sendSocketNotification("INIT", this.config)
    this.dynamicPosition = 0
  },
  socketNotificationReceived: function(noti, payload) {    
    if (noti == "UPLOADABLE_ALBUM") {
      this.uploadableAlbum = payload
    }
    if (noti == "INITIALIZED") {
      this.albums = payload
    }
    if (noti == "SCANNED") {      
      if (payload && Array.isArray(payload) && payload.length > 0)
      this.scanned = payload
      if (this.firstScan) {
        this.firstScan = false
        this.updatePhotos()
      }
    }  
    
	if (noti == "IMGAVGCOLOR") {		
		var color = 'rgba(' + payload.IMGAVGCOLOR[0] + ',' + payload.IMGAVGCOLOR[1]+ ','+payload.IMGAVGCOLOR[2]+ ','+payload.IMGAVGCOLOR[3] + ')'	
		document.getElementById("GPHOTO_BACK").style.filter = ''
    document.getElementById("GPHOTO_BACK").style.backgroundColor = color			
    console.log("recived IMGCOLOR:" +color)		
    if(this.config.enableFaceFocus == false)
    {
      this.setImageSize(payload.IMGSIZE)
      var topdiv = document.getElementById("GPHOTO_TOP")
      topdiv.style.opacity = "1";
      topdiv.classList.add("animated_block")  
      var current = document.getElementById("GPHOTO_CURRENT")       
      if(this.config.enableAnimatedPhotoEffect == true)
        current.classList.add(this.AnimationEffect);
    }
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
    cssstyle.innerHTML = '@keyframes move-size { 0%{transform: translate('+ fromX+', '+ fromY+'); scale('+fromZ+', '+fromZ+');} 100%{transform: translate('+ toX+', '+ toY+'); scale('+toZ+', '+toZ+');} }';    
    cssstyle.innerHTML +='  #GPHOTO_CURRENT.move-size { animation-name: move-size;  animation-duration: '+(this.config.updateInterval/1000 + 10)+'s; }';
	
  },
  setImageFace:function(payload) {
    var enc = new TextDecoder("utf-8");
    var obj = JSON.parse(enc.decode(payload))
    
    var current = document.getElementById("GPHOTO_CURRENT")   
    
    var photoAspectRatio = obj.width / obj.height;
    var displayAspectRatio = this.config.showWidth / this.config.showHeight;
    
    var animationKind;
    
    var animationX ="";
    var animationY ="";
    var animationZ ="";
    if(obj.count > 0)
    {
        var targetX = 0;
        var targetY = 0;
        for(i = 0 ; i < obj.count ; i++)
        {
          targetX += (obj.faces[i].x + obj.faces[i].w /2)
          targetY += (obj.faces[i].y + obj.faces[i].h /2)
        }
        targetX = targetX / obj.count;
        targetY = targetY / obj.count;

        if(obj.width / targetX > 1.0 ) animationX = "left";
        //else if(obj.width / targetX > 0.7 ) animationX = "center";
        else animationX = "right";

        if(obj.width / targetY > 1.0 ) animationY = "up";
        //else if(obj.width / targetY > 0.7 ) animationY = "center";
        else animationY = "down";
    }
    else
    {
      animationX = "center";
      animationY = "center";
    }

    console.log("IMGFACE: count = " + obj.count + ", X:" + animationX + ", Y:" + animationY);

    if(Math.abs(photoAspectRatio - displayAspectRatio) < 0.16)
    {
      increaseLength = (Math.abs(photoAspectRatio - displayAspectRatio) * this.config.showHeight + 100)/2 ;
      
      current.style.top = "-"+increaseLength+"px";
      current.style.left = "-"+increaseLength+"px";
      current.style.right = "-"+increaseLength+"px";
      current.style.bottom = "-"+increaseLength+"px";		
      animationKind  = Math.floor(Math.random() * (7 - 0))						
    }
    else
    {
      current.style.top = "-50px";
      current.style.left = "-50px";
      current.style.right = "-50px";
      current.style.bottom = "-50px";			
      if(photoAspectRatio - displayAspectRatio > 0)
        animationKind  =  Math.floor(Math.random() * (5 - 0));
      else
        animationKind  =  Math.floor(Math.random() * (5 - 0))+2;
      
    }		
    
  
    var fromX,toX, fromY,toY;
    switch(animationX)
    {
      case "left":
        fromX = "50px";
        toX = "-50px";
        break;
      case "right":
        fromX = "-50px";
        toX = "50px";
        break;
      case "center":
        fromX = "0px";
        toX = "0px";
        break;
    }

    switch(animationY)
    {
      case "up":
        fromY = "-50px";
        toY = "50px";
        break;
      case "down":
        fromY = "50px";
        toY = "-50px";
        break;
      case "center":
        fromY = "0px";
        toY = "0px";
        break;
    }

    
    this.AnimationEffect = "move-face";

    var cssstyle = document.getElementById("cssstyle");
    cssstyle.innerHTML = '@keyframes move-face { 0%{transform: translate('+ fromX+', '+ fromY+');transform: scale(1, 1);} 100%{transform: translate('+ toX+', '+ toY+');transform: scale(1.1, 1.1);} }';    
    cssstyle.innerHTML +='  #GPHOTO_CURRENT.move-face { animation-name: move-face;  animation-duration: 20s; }';

  },
  notificationReceived: function(noti, payload, sender) {
    if (noti == "GPHOTO_NEXT") {
      this.updatePhotos()
    }
    if (noti == "GPHOTO_PREVIOUS") {
      this.updatePhotos(-2)
    }
    if (noti == "GPHOTO_UPLOAD") {
      this.sendSocketNotification("UPLOAD", payload)
    }
  },

  updatePhotos: function(dir=0) {
    clearTimeout(this.updateTimer)
    if (this.scanned.length == 0) return
    this.index = this.index + dir
    if (this.index < 0) this.index = 0
    if (this.index >= this.scanned.length) {
      this.index = 0
      if (this.config.sort == "random") {
        for (var i = this.scanned.length - 1; i > 0; i--) {
          var j = Math.floor(Math.random() * (i + 1))
          var t = this.scanned[i]
          this.scanned[i] = this.scanned[j]
          this.scanned[j] = t
        }
      }
    }
    var target = this.scanned[this.index]
    var url = target.baseUrl + `=w${this.config.showWidth}-h${this.config.showHeight}`
    this.ready(url, target)
    this.index++	
		this.sendSocketNotification("GET_IMAGE_AVERAGE_COLOR", url)	   
  },

  ready: function(url, target) {
    var hidden = document.createElement("img")
    hidden.onerror = () => {
      console.log("[GPHOTO] Image load fails.")
      this.sendSocketNotification("IMAGE_LOAD_FAIL", url)
    }
    hidden.onload = () => {
      var back = document.getElementById("GPHOTO_BACK")
      var current = document.getElementById("GPHOTO_CURRENT")
      var dom = document.getElementById("GPHOTO")
      current.style.backgroundImage = `url(${url})`
	  
      var info = document.getElementById("GPHOTO_INFO")
      var album = this.albums.find((a)=>{
        if (a.id == target._albumId) return true
        return false
      })
      if (this.config.autoInfoPosition) {
        var op = (album, target) => {
          var now = new Date()
          var q = Math.floor(now.getMinutes() / 15)
          var r = [
            [0,       'none',   'none',   0     ],
            ['none',  'none',   0,        0     ],
            ['none',  0,        0,        'none'],
            [0,       0,        'none',   'none'],
          ]
          return r[q]
        }
        if (typeof this.config.autoInfoPosition == 'function') {
          op = this.config.autoInfoPosition
        }
        let [top, left, bottom, right] = op(album, target)
        info.style.setProperty('--top', top)
        info.style.setProperty('--left', left)
        info.style.setProperty('--bottom', bottom)
        info.style.setProperty('--right', right)
      }
      info.innerHTML = ""
      var albumCover = document.createElement("div")
      albumCover.classList.add("albumCover")
      albumCover.style.backgroundImage = `url(modules/MMM-GooglePhotos/cache/${album.id})`
      var albumTitle = document.createElement("div")
      albumTitle.classList.add("albumTitle")
      albumTitle.innerHTML = album.title
      var photoTime = document.createElement("div")
      photoTime.classList.add("photoTime")
      photoTime.innerHTML = (this.config.timeFormat == "relative")
        ? moment(target.mediaMetadata.creationTime).fromNow()
        : moment(target.mediaMetadata.creationTime).format(this.config.timeFormat)
      var infoText = document.createElement("div")
      infoText.classList.add("infoText")

      info.appendChild(albumCover)
      infoText.appendChild(albumTitle)
      infoText.appendChild(photoTime)
      info.appendChild(infoText)
      console.log("[GPHOTO] Image loaded:", url)
      this.sendSocketNotification("IMAGE_LOADED", url)
    }
    hidden.src = url
  },	

  getDom: function() {
    var wrapper = document.createElement("div")
    wrapper.id = "GPHOTO"
    var back = document.createElement("div")
    back.id = "GPHOTO_BACK"
	if(this.config.enableNewPhotoEffect == false) {
		back.classList.add("backgroundFilter")
	}
    var current = document.createElement("div")
    current.id = "GPHOTO_CURRENT"
    if (this.data.position.search("fullscreen") == -1) {
      if (this.config.showWidth) wrapper.style.width = this.config.showWidth + "px"
      if (this.config.showHeight) wrapper.style.height = this.config.showHeight + "px"
    }
    current.addEventListener('animationend', ()=>{	  
      current.classList.remove("animated")
    })
    var info = document.createElement("div")
    info.id = "GPHOTO_INFO"
    info.innerHTML = "Loading..."
    var topdiv = document.createElement("div")
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
        if(this.config.enableAnimatedPhotoEffect == true)
          current.classList.remove(this.AnimationEffect);
        this.updatePhotos()				
      }
    })
    wrapper.appendChild(back)
    wrapper.appendChild(current)
    wrapper.appendChild(topdiv)
    wrapper.appendChild(info)	        
    var cssstyle = document.createElement('style');
    cssstyle.id = "cssstyle";
    wrapper.appendChild(cssstyle);
    console.log("updated!")
    return wrapper
  },
})
