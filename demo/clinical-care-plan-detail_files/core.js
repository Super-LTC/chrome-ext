//Globals
var lastMouseX;
var lastMouseY;
var curPopupWindow = null;
var datePopupWindow = null;
var helpWindow = null;
var resHeaderPage = false;

//==========================//
// DATES                    //
//==========================//
Date.prototype.toDDMMYYString = function(){
  return "" + zeropad2places(this.getDate()) + zeropad2places(this.getMonth() + 1) + zeropad2places(this.getYear());
};
Date.prototype.toMDYString = function(){
  return (this.getMonth() + 1) + "/" + this.getDate() + "/" + this.getFullYear();
};
Date.prototype.toMMDDYYYYString = function(){
  return zeropad2places(this.getMonth() + 1) + "/" + zeropad2places(this.getDate()) + "/" + this.getFullYear();
};

function formatDateCYMD(date){//Expecting MM/DD/CCYY
  var dateArr = date.split("/");

  // if it is not expected format just return the parameter
  if(dateArr.length != 3){
    return date;
  }
  var m = dateArr[0].length == 1 ? "0" + dateArr[0] : dateArr[0];
  var d = dateArr[1].length == 1 ? "0" + dateArr[1] : dateArr[1];
  var y = dateArr[2];

  return y + "/" + m + "/" + d;
}

function dateToMMDDYYYY(date){
  var d = date.getDate();
  var m = date.getMonth()+1;
  var y = date.getFullYear();
  return '' + (m<=9?'0'+m:m) + (d<=9?'0'+d:d) + y;
}

function dateMMDDYYYY(date){
  var d = date.getDate();
  var m = date.getMonth()+1;
  var y = date.getFullYear();
  return '' + (m<=9?'0'+m:m) + '/'+ (d<=9?'0'+d:d) + '/' + y;
}

function dateFormatMMDDYYYY(date){//Expecting MM/DD/CCYY
  var dateArr = date.split("/");
  // if it is not expected format just return the parameter
  if(dateArr.length != 3){
    return date;
  }
  var m = dateArr[0].length == 1 ? "0" + dateArr[0] : dateArr[0];
  var d = dateArr[1].length == 1 ? "0" + dateArr[1] : dateArr[1];
  var y = dateArr[2];
  return m + "/" + d + "/" + y;
}

//==========================//
// STRINGS                  //
//==========================//
//Prototype Extensions
if(typeof(String.prototype.trim) == 'undefined'){
  //For IE8
  String.prototype.trim = function(){
    return this.replace(/^\s+|\s+$/g, '');
  }
}

//Formatting functions
function trim(str){
  return str.replace(/^\s+|\s+$/g, "");
}

function LTrim(obj){
  var val = obj.value;
  var w_space = String.fromCharCode(32);
  if(val.length < 1){
    return "";
  }
  var strTemp = "";
  var iTemp = 0;
  while(iTemp < val.length){
    if(val.charAt(iTemp) != w_space){
      strTemp = val.substring(iTemp,val.length);
      break;
    }
    iTemp = iTemp + 1;
  }
  return strTemp;
}

function RTrim(obj){
  var val = obj.value;
  var w_space = String.fromCharCode(32);
  var strTemp = "";
  if(val.length < 0){
    return "";
  }
  var iTemp = val.length -1;
  while(iTemp > -1){
    if(val.charAt(iTemp) != w_space){
      strTemp = val.substring(0,iTemp +1);
      break;
    }
    iTemp = iTemp-1;
  }
  return strTemp;
}
//TODO: re-case this method and all references
function zeropad2places(val){
  if(val < 10){
    val = '0' + val;
  }
  return val;
}

function escapeHTML(value){
  function replaceChars(ch){
    switch(ch){
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case "'":
        return "&#39;";
      case '"':
        return "&quot;";
    }
    return "?";
  };
  return String(value).replace(/[<>"']/g, replaceChars);
}

function escapeJavaScript(str)
{
  // Escapes string so that it can be included in a JavaScript expression.
  // Escapes backslashes, double quotes, and single quotes.
  //
  // Example:
  //   input string: She's said "Okay!"
  //   output string: She\'s said \"Okay!\"
  //
  // Returns string with escaped values, null if null string input.
  if (str == null)
  {
    return null;
  }
  str = str.replace("\\", "\\\\");
  str = str.replace("'", "\\\'");
  str = str.replace('"', "\\\"");
  return str;
}

//==========================//
// POPUPS                   //
//==========================//
/* DEPRECATED */
function openPopup(url, name, pWidth, pHeight, features, snapToLastMousePosition){
  if (snapToLastMousePosition) {
    if (lastMouseX - pWidth < 0) {
      lastMouseX = pWidth;
    }
    if (lastMouseY + pHeight > screen.height) {
      lastMouseY -= (lastMouseY + pHeight + 50) - screen.height;
    }
    lastMouseX -= pWidth;
    lastMouseY += 10;
    features += "screenX=" + lastMouseX + ",left=" + lastMouseX + "screenY=" + lastMouseY + ",top=" + lastMouseY + ",width=" + pWidth + ",height=" + pHeight;
  }
  closePopup();
  curPopupWindow = window.open(url, name, features);
}

function closePopup(){
  try{
    if(curPopupWindow != null){
      if(!curPopupWindow.closed){
        curPopupWindow.close();
      }
      curPopupWindow = null;
    }
  } catch(e){}
}

function openLookup(baseURL){
  openPopup(baseURL, "lookup", 350, 300, "width=450,height=350,toolbar=no,status=no,directories=no,menubar=no,resizable=yes", false);
}

function openLookup2(baseURL,name,scrollbars){
  openPopup(baseURL, name, 350, 300, "width=450,height=350,toolbar=no,status=no,directories=no,menubar=no,resizable=yes,"+scrollbars, false);
}

/* DEPRECATED */
function openSizedLookup(baseURL,pwidth,pheight){
  var top = (screen.height-pheight)/2;
  var left = (screen.width-pwidth)/2;
  openPopup(baseURL, "lookup", pwidth, pheight,"top="+top+",left="+left+",width="+pwidth+",height="+pheight+",toolbar=no,status=no,directories=no,menubar=no,resizable=yes", false);
}

/* DEPRECATED */
function openSizedLookup2(url, name, width, height, scrollbars){
  var w = window;
  width = width || 500;
  height = height || 400;
  var bX,bY,bW,bH;
  if(typeof(w.screenX) != 'undefined'){
    bX = w.screenX;
    bY = w.screenY;
    bW = w.outerWidth;
    bH = w.outerHeight;
  } else {//IE
      bX = w.screenLeft;
      bY = w.screenTop - 70;//adjust for IE chrome/toolbars
      try{
        bW = w.document.body.clientWidth;
        bH = w.document.body.clientHeight + 70;//adjust for IE chrome/toolbars
      } catch(e) {
        bW = screen.width;
        bH = screen.height;
      }
  }
  var pX = bX + (bW / 2) - (width / 2);
  var pY = bY + (bH / 2) - (height / 2);
  openPopup(url, name, width, height, "left="+pX+",top="+pY+",width="+width+",height="+height+",toolbar=no,status=no,directories=no,menubar=no,resizable=yes,"+scrollbars, false);
}

function openSizedLookup2WithPost(url,name,width,height,options,params){
    openSizedLookup2("about:blank",name,width,height,options);
    
    var form = document.createElement("form");
    form.method = "post";
    form.action = url;
    form.target = name;

    for (var i in params)
    {
      if (params.hasOwnProperty(i))
      {
        var input = document.createElement('input');
        input.type = 'hidden';
        input.name = i;
        input.value = params[i];
        form.appendChild(input);
      }
    }

    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);
}

//Opens a popup window without returning for a href="javascript:openWinPopupWin..." usage in IE
function openPopupWinNR(url, name, width, height, features){
  openPopupWin(url, name, width, height, features);
}

//Opens a popup window centered over the active window, returning the window handle
function openPopupWin(url, name, width, height, features){
  var w = window;
  var pName = name + 'Win';
  var bH,bL,bT,bW = 0;
  if(typeof(w.screenX) != 'undefined'){
    bL = w.screenX;
    bT = w.screenY;
    bW = w.outerWidth;
    bH = w.outerHeight;
  } else if(typeof(w.screenLeft) != 'undefined'){
    bL = w.screenLeft - 2;
    bT = w.screenTop - 70;//adjust for IE chrome/toolbars
    bW = w.document.body.clientWidth;
    bH = w.document.body.clientHeight;
  }
  var pL = bL + (bW / 2) - (width / 2);
  var pT = bT + (bH / 2) - (height / 2);
  var f = features + ',';
  f += 'top=' + pT + ',';
  f += 'left=' + pL + ',';
  f += 'width=' + width + ',';
  f += 'height=' + height + ',';
  if(typeof(w[pName]) != 'undefined' && w[pName] != null && !w[pName].closed){
    w[pName].close();
  }
  w[pName] = open(url, name, f);
  return w[pName];
}

function closePopupIfOpen(popupName){
  if(typeof(window[popupName]) != 'undefined' && window[popupName] != null && !window[popupName].closed){
    window[popupName].close();
  }
}

function pccPopup(url, name, width, height, features){
  var _features = {toolbar:0,location:0,status:0,directories:0,menubar:0,resizable:1,scrollbars:0};
  if(features instanceof Object){
    for(var x in features){
      _features[x] = features[x];
    }
  } else if(typeof(features) == 'string'){
    var re = /([^,]+)=([^,]+)/g;
    var match;
    while((match = re.exec(features)) !== null){
      _features[match[1].trim()] = match[2].trim();
    }
  }
  if(!('popupWindows' in window)){
    window.popupWindows = {};
  }
  var w = window;
  width = width || 500;
  height = height || 400;
  var bX, bY, bW, bH;
  if(typeof(w.screenX) != 'undefined'){
    bX = w.screenX;
    bY = w.screenY;
    bW = w.outerWidth;
    bH = w.outerHeight;
  } else {//IE
    bX = w.screenLeft;
    bY = w.screenTop - 70;//adjust for IE chrome/toolbars
    try {
      bW = w.document.body.clientWidth;
      bH = w.document.body.clientHeight + 70;//adjust for IE chrome/toolbars
    } catch(e){
      bW = screen.width;
      bH = screen.height;
    }
  }
  var pX = bX + (bW / 2) - (width / 2);
  var pY = bY + (bH / 2) - (height / 2);

  var featureStr = '';
  for(var f in _features){
    featureStr += f + '=' + _features[f] + ',';
  }
  featureStr += 'top=' + pY + ',';
  featureStr += 'left=' + pX + ',';
  featureStr += 'width=' + width + ',';
  featureStr += 'height=' + height;

  name = name || '__unnamed_popup__';
  pccClosePopup(name);
  w.popupWindows[name] = open(url, name, featureStr);
  /*
    Newer versions of Edge execute the open() call without waiting for a valid window handle to continue.
    Ensure we have a good window handle before returning our popup handle (where possible)
  */
  var uaLC = navigator.userAgent.toLowerCase();
  if(uaLC.indexOf('edge') != -1){
    var popup = w.popupWindows[name];
    var docReadyState = null;
    var waitForDocReadyState = false;
    try {
      docReadyState = popup.document.readyState;
      waitForDocReadyState = true;
    } catch(ex){
      //likely a PDF or similar non HTML file
    }
    if(waitForDocReadyState){
      var startTime = new Date().getTime();
      var nowTime;
      while('complete|interactive|loaded'.indexOf(popup.document.readyState) == -1){
        nowTime = new Date().getTime();
        if((nowTime - startTime) >= 30000){
          break;//Emergency bail out after 30 seconds
        }
      }
    }
  }
  return w.popupWindows[name];
}

function pccClosePopup(name){
  name = name || '__unnamed_popup__';
  if(typeof(window.popupWindows[name]) != 'undefined' && window.popupWindows[name] != null && !window.popupWindows[name].closed){
    window.popupWindows[name].close();
  }
}

function openHelp(url) {
  if (helpWindow != null) helpWindow.close();
  var w = window.open(url, "Help", "width=500,height=400,toolbar=no,status=no,directories=no,menubar=no,resizable=yes,screenX=" + window.screenX + ",left=" + window.screenX + "screenY=" + window.screenY + ",top=" + window.screenY);
    w.focus();
  helpWindow = w;
}

function openHelpWindow(url,height,width){
  if (helpWindow != null) helpWindow.close();
  var w = window.open(url, "Help", "width=" + width + ",height=" + height + ",toolbar=no,status=no,directories=no,menubar=no,resizable=yes,screenX=" + window.screenX + ",left=" + window.screenX + "screenY=" + window.screenY + ",top=" + window.screenY);
  w.focus();
  helpWindow = w;
}

function popWin(url){
  closePopup();
  curPopupWindow = window.open(url,"win","toolbar=0,location=0,directories=0,status=0,menubar=0,scrollbars=1,resizable=0,width=550,height=300");
}

function printWin(url){
  closePopup();
  curPopupWindow = window.open(url,"win","toolbar=1,location=1,directories=0,status=1,menubar=1,scrollbars=1,resizable=1,width=705,height=400");
}

function printWin2(url, name){
  closePopup();
  curPopupWindow = window.open(url,name,"toolbar=1,location=1,directories=0,status=1,menubar=1,scrollbars=1,resizable=1,width=705,height=400,top="+(parseInt(name)*50+50));
}

function resizePopup(wpx,hpx){
  var tpx = parseInt((screen.height - hpx) / 2);
  var lpx = parseInt((screen.width - wpx) / 2);
  window.moveTo(lpx,tpx);
  window.resizeTo(wpx,hpx);
}

function closeIframeOverlay(){
  $('._iframe-overlay-container').remove();
  $('._iframe-overlay-container-mask').remove();
}

function openIframeOverlay(url, options){
  /*
    options:
             frameId: (string) a value to assign as the id attribute on the iframe
           frameName: (string) a value to assign as the name attribute on the iframe
               width: (css distance units) Width to render overlay (number in: px, %, vw, vh)
              height: (css distance units) Height to render overlay (number in: px, %, vw, vh CSS units)
             padding: (css distance units) Padding to apply to overlay content (default is none)
           scrolling: (boolean) Default=true, If true, enables scrollbars on the iframe
           
           preLoadOptions: An object of optional options to use before loading the actual app in iframe
           preLoadOptions.isSpinnerEnabled: (boolean) To enable loading spinner before iframe loads
           preLoadOptions.errorMessage: (string) An error message if anything goes wrong before loading the iframe
           preLoadOptions.closeButtonValue: (string) Value of the close button
    includeCloseIcon: TODO: (true|false) def=false, ('X' in the top right corner)
       closeOnEscape: TODO: (true|false) def=false, (pressing ESC closes overlay)
  */
  if(!url || url == ''){
    return;
  }
  options = options || {};
  var clientWidth = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
  var clientHeight = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
  var width = options.width || '75vw';
  var height = options.height || '85vh';
  var padding = options.padding || 0;
  var frameId = options.frameId;
  var frameName = options.frameName;
  var preLoadOptions = options.preLoadOptions;
  var isSpinnerEnabled = null;
  var errorMessage = null;
  var closeButtonValue = null;

  var messageToSendToIframe = {};
  messageToSendToIframe.TIMESTAMP = Date.now();
  
  if(preLoadOptions){
	isSpinnerEnabled = preLoadOptions.isSpinnerEnabled;
    errorMessage = preLoadOptions.errorMessage;
	closeButtonValue = preLoadOptions.closeButtonValue;
  }

  var widthDiff = 0;
  var heightDiff = 0;
  var widthAsString = '' + width;
  var heightAsString = '' + height;
  if(widthAsString.indexOf('px') != -1){
    widthDiff = clientWidth - parseFloat(width);
  } else {
    widthDiff = clientWidth - (clientWidth * (parseFloat(width) / 100));
  }
  if(heightAsString.indexOf('px') != -1){
    heightDiff = clientHeight - parseFloat(height);
  } else {
    heightDiff = clientHeight - (clientHeight * (parseFloat(height) / 100));
  }
  var scrollLeft = $(window).scrollLeft() || 0;
  var scrollTop = $(window).scrollTop() || 0;

  var iframeScrolling = true;
  if(typeof(options.scrolling) != 'undefined' && options.scrolling == false){
    iframeScrolling = false;
  }
  closeIframeOverlay();//we only ever want 1 overlay, remove any existing overlay

  var overlayMask = $('<div class="_iframe-overlay-container-mask overlay-mask-background"></div>');
  $('body').append(overlayMask);
  var iframeContainerDiv = $('<div class="_iframe-overlay-container overlay-container" style="height:' + height + ';width:' + width + ';transform:translate(' + (scrollLeft + (widthDiff/2)) + 'px, ' + (scrollTop + (heightDiff/2)) + 'px);"></div>');
  var iframeContainerContentDiv = $('<div class="overlay-content"></div>');
  
  if(padding){
    iframeContainerContentDiv.attr('style', 'padding:' + padding + ';');
  }
  var iframe = $('<iframe src="' + url + '"' + (iframeScrolling ? '' : ' scrolling="no"') + '></iframe>');
  
  // When iframe redirects, the load event is triggered again and we only need to know about this event,
  // so we need this counter to make sure to act only when the actual app is loaded (on second event).
  var redirectCounter = 0;
  iframe.on('load', function(event) {
	if (redirectCounter) {
	  $('#iframePreLoadingSpinner').hide();
	  var iframe = $(this);
	  
	  // When iframe is loaded, this message will be sent to the app, then the app in the
	  // iframe has to post a message back to parent to verify app is loaded successfully.
	  this.contentWindow.postMessage("isAppLoaded", '*');
	  this.contentWindow.postMessage(messageToSendToIframe, '*');
	  
	  // Event handler to verify the message sent from the app in the iframe on successful load
	  var successfulLoadHandler = function(event) {
	    if (typeof event.data === 'object') {
	      if (event.data.IFRAME_APP_LOADED === true) {
	    	iframe.show();
	    	$('#iframeFailSafeButton').hide();
	    	$('#iframeLoadingErrorMessage').hide();
	    	window.removeEventListener('message', successfulLoadHandler);
	      }
	    }
	  }
	  
	  // Event listener for message sent from the app in the iframe on successful load
	  window.addEventListener('message', successfulLoadHandler);
	  
	  iframe.hide();
	  $('#iframeLoadingErrorMessage').fadeIn(100);
	}
	redirectCounter++;
  });
  
  if(frameId){
    iframe.attr('id', frameId);
  }
  if(frameName){
    iframe.attr('name', frameName);
  }
  if(isSpinnerEnabled){
	var preIframeLoadingSpinner = $('<div id="iframePreLoadingSpinner" class="pccBusy"></div>');
    iframeContainerContentDiv.append(preIframeLoadingSpinner);
  }
  if(errorMessage){
    var iframeLoadingError = $('<div id="iframeLoadingErrorContainer"><h3 id="iframeLoadingErrorMessage" style="display: none;">' + errorMessage + '</h3></div>');
    iframeContainerContentDiv.append(iframeLoadingError);
  }
  if(closeButtonValue){
	var iframeFailSafeButton = $('<div id="iframeFailSafeButtonContainer"><input id="iframeFailSafeButton" type="button" class="pccButton" value="' + closeButtonValue + '" onclick="closeIframeOverlay();"></div>');
	iframeContainerContentDiv.append(iframeFailSafeButton);
  }
  
  iframeContainerContentDiv.append(iframe);
  iframeContainerDiv.append(iframeContainerContentDiv);
  $('body').append(iframeContainerDiv);
}

/* To be merged with openIframOverlay in core.js */
function openIframeOverlayCopy(url, options){
  /*
    options:
             frameId: (string) a value to assign as the id attribute on the iframe
           frameName: (string) a value to assign as the name attribute on the iframe
               width: (css distance units) Width to render overlay (number in: px, %, vw, vh)
              height: (css distance units) Height to render overlay (number in: px, %, vw, vh CSS units)
             padding: (css distance units) Padding to apply to overlay content (default is none)
           scrolling: (boolean) Default=true, If true, enables scrollbars on the iframe

           preLoadOptions: An object of optional options to use before loading the actual app in iframe
           preLoadOptions.isSpinnerEnabled: (boolean) To enable loading spinner before iframe loads, default=true
           preLoadOptions.errorMessage: (string) An error message if anything goes wrong before loading the iframe
           preLoadOptions.closeButtonValue: (string) Value of the close button
    includeCloseIcon: TODO: (true|false) def=false, ('X' in the top right corner)
       closeOnEscape: (true|false) def=false, (pressing ESC closes overlay)
       closeCallback: function to call when the iframe is closed (either by the close button, or the close icon, or the ESC key)
  */
  if(!url || url == ''){
    return;
  }
  options = options || {};
  var clientWidth = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
  var clientHeight = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
  var width = options.width || '75vw';
  var height = options.height || '85vh';
  var padding = options.padding || 0;
  var frameId = options.frameId;
  var frameName = options.frameName;
  var preLoadOptions = options.preLoadOptions;
  var isSpinnerEnabled = null;
  var errorMessage = null;
  var closeButtonValue = null;
  var closeCallback = options.closeCallback || null;
  var includeCloseIcon = options.includeCloseIcon || null;
  var closeOnEscape = options.closeOnEscape || false;

  if(preLoadOptions){
    isSpinnerEnabled = preLoadOptions.isSpinnerEnabled || false;
    errorMessage = preLoadOptions.errorMessage || null;
    closeButtonValue = preLoadOptions.closeButtonValue || null;
  }

  var widthDiff = 0;
  var heightDiff = 0;
  var widthAsString = '' + width;
  var heightAsString = '' + height;
  if(widthAsString.indexOf('px') != -1){
    widthDiff = clientWidth - parseFloat(width);
  } else {
    widthDiff = clientWidth - (clientWidth * (parseFloat(width) / 100));
  }
  if(heightAsString.indexOf('px') != -1){
    heightDiff = clientHeight - parseFloat(height);
  } else {
    heightDiff = clientHeight - (clientHeight * (parseFloat(height) / 100));
  }
  var scrollLeft = $(window).scrollLeft() || 0;
  var scrollTop = $(window).scrollTop() || 0;

  var iframeScrolling = true;
  if(typeof(options.scrolling) != 'undefined' && options.scrolling == false){
    iframeScrolling = false;
  }

  var closeIframeFunction;
  if(closeCallback){
    closeIframeFunction = function(){
      closeIframeOverlay();
      closeCallback({'frameId':frameId, 'frameName': frameName});
    }
  } else {
    closeIframeFunction = function(){
      closeIframeOverlay();
    }
  }

  closeIframeOverlay();//we only ever want 1 overlay, remove any existing overlay

  var overlayMask = $('<div class="_iframe-overlay-container-mask overlay-mask-background"></div>');
  $('body').append(overlayMask);
  var iframeContainerDiv = $('<div class="_iframe-overlay-container overlay-container" style="height:' + height + ';width:' + width + ';transform:translate(' + (scrollLeft + (widthDiff/2)) + 'px, ' + (scrollTop + (heightDiff/2)) + 'px);"></div>');
  var iframeContainerContentDiv = $('<div class="overlay-content"></div>');

  if(padding){
    iframeContainerContentDiv.attr('style', 'padding:' + padding + ';');
  }
  var iframe = $('<iframe src="' + url + '"' + (iframeScrolling ? '' : ' scrolling="no"') + '></iframe>');

  if(frameId){
    iframe.attr('id', frameId);
  }
  if(frameName){
    iframe.attr('name', frameName);
  }
  //if(includeCloseIcon){
  //  var closeIcon = $('<div id="iframeCloseIcon">X</div>');
  //  closeIcon.click(closeIframeFunction);
  //  iframeContainerContentDiv.append(closeIcon);
  //}
  if(isSpinnerEnabled){
    var preIframeLoadingSpinner = $('<div id="iframePreLoadingSpinner" class="pccBusy"></div>');
    iframeContainerContentDiv.append(preIframeLoadingSpinner);
  }
  if(errorMessage){
    var iframeLoadingError = $('<div id="iframeLoadingErrorContainer"><h3 id="iframeLoadingErrorMessage" style="display:none;">' + errorMessage + '</h3></div>');
    iframeContainerContentDiv.append(iframeLoadingError);
  }
  if(closeButtonValue){
    var iframeActionBarContainer = $('<div id="iframeActionBarContainer"></div>');
    var iframeActionButtonsContainer = $('<div id="iframeActionButtonsContainer"></div>');
    var iframeFailSafeButton = $('<input id="iframeFailSafeButton" type="button" class="pccEvergreenButton" value="' + closeButtonValue + '">');
    iframeFailSafeButton.click(closeIframeFunction);
    iframeActionButtonsContainer.append(iframeFailSafeButton);
    iframeActionBarContainer.append(iframeActionButtonsContainer);
    iframeContainerContentDiv.append(iframeActionBarContainer);
  }
  iframeContainerContentDiv.append(iframe);
  iframeContainerDiv.append(iframeContainerContentDiv);

  if(closeOnEscape){
    var escapeKeyHandler = function(e){
      //was the ESC key pressed?
      if(e.which == 27){//Escape key (key returns "Esc" in IE, "Escape" in all other browsers)
        var activeElement = e.target;
        if(activeElement){
          var activeElementNodeName = activeElement.nodeName;
          //only self-dismiss if ESC was NOT pressed in a form field
          if(activeElementNodeName != 'INPUT' && activeElementNodeName != 'SELECT' && activeElementNodeName != 'TEXTAREA'){
            //remove the event listener
            $(document).unbind('keyup', escapeKeyHandler);
            closeIframeFunction();
          }
        }
      }
    };
    //add keypup listener (keypress won't capture the ESC key)
    $(document).bind('keyup', escapeKeyHandler);
  }
  $('body').append(iframeContainerDiv);
}


/**********************************************************************
* Function to resize a window vertically to fit page content.
*
* @param canShrink
*   If true, the window can be made smaller if necessary.  If false,
*   the window will not be resized smaller than its current height.
* @param margin
*   The height of margin to allow at bottom of page body.
**********************************************************************/
function adjustHeightToFit(canShrink, margin)
{
  var ch = document.body.clientHeight;
  var dh = document.body.scrollHeight;
  if (!margin && !(margin == 0)) margin = 10;
  if (margin > 0) dh = dh + margin;
  if (ch < dh) window.resizeBy(0,dh-ch);
  else if (canShrink && ch > dh) window.resizeBy(0,dh-ch);
}

/******************************************************************************
* Method to open popup for spell checking.  It ensures that the text is posted
* and not passed through the url.
*
*  See /care/chart/ipn/newipn.jsp for use
*
* @param id
*   The id of the textarea in the opener that contains the text to be checked.
******************************************************************************/
function checkSpelling(id)
{
  var text = document.getElementById(id).value;

  var form = document.forms["frmSpell"];
  if (form && text != null && text.length > 0)
  {
    //save the current form settings
    var tmpAction = form.action;
    var tmpTarget = form.target;

    //open the help window popup
    openSizedLookup2("about:blank","spellcheckpopup",680,335,"");

    //set the text to be checked
    if (form.ESOLtext)
    {
      form.ESOLtext.value = text;
    }

    //set the form settings for info popup
    form.action = "/tools/spellcheckpopup.jsp?ESOLtextid="+id;
    form.target = "spellcheckpopup";

    //submit the form the the popup
    form.submit();

    //reset the form settings
    form.action = tmpAction;
    form.target = tmpTarget;
  }
}

//==========================//
// UTILITIES                //
//==========================//

function isUndefined(obj){
  return (typeof(obj) == 'undefined');
}

function isObjectEmpty(obj){
  for(var prop in obj){
    return false;
  }
  return true;
}

function isArray(v){
   return Object.prototype.toString.apply(v) === '[object Array]';
}

function isObject(v){
   return v && typeof v == "object";
}

function isEmpty(str){
  return !str || str.replace(/^\s+|\s+$/g, "").length == 0;
}

function isInteger(sText){
  return isNumeric(sText, true);
}

function isNumeric(sText, ignoreDecimal){
  var validChars = "0123456789.";
  var validSigns = "+-";
  var isNumber = true;
  var character;

  if(ignoreDecimal && ignoreDecimal == true){
    validChars = "0123456789";
  }
  for(var i=0;i<sText.length && isNumber == true;i++){
    character = sText.charAt(i);
    if(validChars.indexOf(character) == -1){
      if((i == 0 && validSigns.indexOf(character) == -1) || i > 0){
        isNumber = false;
      }
    }
  }
  return isNumber;
}

function isPositiveInteger(sText){
  return isPositiveNumeric(sText, true);
}

function isPositiveNumeric(sText, ignoreDecimal)
{
  var validChars = "0123456789.";
  var isNumber = true;
  var character;

  if(ignoreDecimal && ignoreDecimal == true){
    validChars = "0123456789";
  }
  for(var i=0;i<sText.length && isNumber == true;i++){
    character = sText.charAt(i);
    if(validChars.indexOf(character) == -1){
      isNumber = false;
    }
  }

  //test for multiple decimal points - return false if more than 1 exists
  if(ignoreDecimal == false){
    var matchesArray = sText.match(/\./gi);
    if(matchesArray != null && matchesArray.length > 1){
      isNumber = false;
    }
  }
  return isNumber;
}

//==========================//
// EVENTS                   //
//==========================//

//Runs an event; any other event passed in during the timeout will not be run
//TODO: rename this function
function addThrottledEventHandler(eventName, ms, handler){
	if(typeof(this.events) == 'undefined'){
	   this.events = {};
	}
	if(typeof(this.events[eventName]) == 'undefined'){
	   this.events[eventName] = 0;
	}
	if(this.events[eventName] != 1){
	   this.events[eventName] = 1;
	   handler();
	   setTimeout(function(){
		  this.events[eventName] = 0;
	   }, ms);
	}
}

// Returns a function, that, as long as it continues to be invoked, will not
// be triggered. The function will be called after it stops being called for
// `wait` milliseconds. If `immediate` is passed, trigger the function on the
// leading edge, instead of the trailing.
function debounce(func, wait, immediate){
  var timeout;
  return function(){
    var context = this, args = arguments;
    var later = function(){
      timeout = null;
      if (!immediate) func.apply(context, args);
    };
    var callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func.apply(context, args);
  };
}

//==========================//
// DOM                      //
//==========================//

function setElements(formName, list)
{
  var form = document.forms[formName];
  for(var i=0;i<list.length;i+=2){
    if(form.elements[list[i]]){
      form.elements[list[i]].value = list[i + 1];
    }
  }
}

function getSelectedRadioValue(radioElements){
  for(var i=0;i<radioElements.length;i++){
    if(radioElements[i].checked){
      return radioElements[i].value;
    }
  }
  return "";
}

//TODO: This should be replaceable with: radioSetName.value = value;
function selectRadio(radioElements, value){
  for(var i=0;i<radioElements.length;i++){
    if(radioElements[i].value == value){
      radioElements[i].checked = true;
      break;
    }
  }
}

function toArray(elements){
  if(elements == null){
    return new Array();
  } else if(elements.length === undefined){
    return new Array(elements);
  } else {
    return elements;
  }
}

function disable(elements){
  var elementArray = toArray(elements);

  for(var i=0;i<elementArray.length;i++){
    elementArray[i].disabled = true;
  }
}


/**********************************************************************
* Function to get the table row when no row handler is
* set. This method will start from any element within the row and move
* back until it finds the table row tag (TR).
*
* @param el *REQUIRED*
*   The element contained within the table row.
*
* @return
*   The element if contained within TR tags, null otherwise.
**********************************************************************/
function getTableRow(el)
{
  if (el != null)
  {
    el = (typeof el == "string" ? document.getElementById(el) : typeof el == "object" ? el : null);
    if (el) //check if element exists
    {
      while (el != null && el.tagName != "TR")
        el = el.parentNode; //IE4 use parentElement
      if (el == null || el.tagName != "TR")
        el = null;
    }
  }
  return el;
}

/**********************************************************************
* Function to set the visibility of a table row either by
* row handler or by specifying an element within.
*
* EXAMPLE USAGE:
* - HTML CODE (on page, TR has no ID field):
*   <tr>
*     <td>Field Label:</td>
*     <td><input type="text" name="thenameofthisfield" value=""></td>
*   </tr>
*  - JavaScript CALL:
*   setTableRowVisibility(frmData.thenameofthisfield,true);
*
* @param el *REQUIRED*
*   The element contained within the table row
* @param show *REQUIRED*
*   The visibility flag, true to show, false to hide.
**********************************************************************/
function setTableRowVisibility(el,show){
  el = getTableRow(el);
  if(el != null){
    el.style.display = show ? "" : "none";
  }
}

/**********************************************************************
* Function to determine if a table row is visible either
* by row handler or by specifying an element within.
*
* EXAMPLE USAGE:
* - HTML CODE (on page, TR has no ID field):
*   <tr>
*     <td>Field Label:</td>
*     <td><input type="text" name="thenameofthisfield" value=""></td>
*   </tr>
*  - JavaScript CALL:
*   if (getTableRowVisibility(frmData.thenameofthisfield))
*      alert("this is visible");
*   else
*      alert("this is hidden");
*
* @param el *REQUIRED*
*   The element contained within the table row.
* @param show *REQUIRED*
*   The visibility flag, true to show, false to hide.
*
* @return
*   True - if currently visible.
* @return
*   False - otherwise.
**********************************************************************/
function getTableRowVisibility(el){
  var flag = false;
  el = getTableRow(el);
  if(el != null && el.style.display != "none"){
    flag = true;
  }
  return flag;
}

/**********************************************************************
* Function to set the background color of a table row
* when no row handler is set and where the specified element exists
* within.
*
* EXAMPLE USAGE:
* - HTML CODE (on page, TR has no ID field):
*   <tr>
*     <td>Field Label:</td>
*     <td><input type="text" name="thenameofthisfield" value=""></td>
*   </tr>
*  - JavaScript CALL:
*   setTableRowBackground(frmData.thenameofthisfield,"#EFEFEF");
*
* @param el *REQUIRED*
*   The element contained within the table row.
* @param color *REQUIRED*
*  The color to set the row.
**********************************************************************/
function setTableRowBackground(el,color){
  el = getTableRow(el);
  if(el != null){
    el.style.backgroundColor = color;
  }
}

/**********************************************************************
* Function will:
* - only affect checkbox field which are not disabled
* - call the onclick method of the checkbox
*
* @param fld
*   The checkbox field.
* @param flag
*   The flag indicating if checking all:
*   true - check all,
*   false - clear all
**********************************************************************/
function setCheckAll(fld,flag)
{
  if (fld)
  {
    //if only one, put in an array
    if (!fld.length)
      fld = new Array(fld);

    //set all to checked
    for (var i = 0; i < fld.length; i++)
    {
      var obj = fld[i];
      if (!obj.disabled && obj.checked != flag)
      {
        obj.checked = flag;
        if (obj.onclick)
          obj.onclick();
      }
    }
  }
}

/**********************************************************************
* Function to determine if at least one checkbox is checked.
*
* @param fld *REQUIRED*
*  The checkbox field.
*
* @return
*  True - if at least one is checked,
* @return
*   False - otherwise.
**********************************************************************/
function isChecked(fld){
  var result = false;
  if(fld){
    //if only one, put in an array
    if(!fld.length){
      fld = new Array(fld);
    }
    //check if at least one is checked
    for(var i=0;i<fld.length && !result;i++){
      result = fld[i].checked;
    }
  }
  return result;
}

/**********************************************************************
* Function to return the number of checkboxes which are checked.
*
* @param fld *REQUIRED*
*  The checkbox field.
*
* @return
*   The number of checkbox fields that are checked.
**********************************************************************/
function getCheckedCount(fld){
  var result = 0;
  if(fld){
    //if only one, put in an array
    if(!fld.length){
      fld = new Array(fld);
    }

    //count the ones that are checked
    for(var i=0;i<fld.length;i++){
      if(fld[i].checked){
        result++;
      }
    }
  }
  return result;
}

/*********************************************************************/
// MISCELLANEOUS
/*********************************************************************/


function pick(form,field,val){
  document.forms[form].elements[field].value = val;
  closePopup();
  return false;
}

function chooseLocationSearchPopup(eventName, searchVal)
{
    var handler;
    if (eventName == "getProvStatePopup")
        handler = function(){provstateSearch('setProvState',searchVal);};
    else if (eventName == "getProvStateRemitPopup")
        handler = function(){remitProvstateSearch('setRemitProvState',searchVal);};
    else if (eventName == "getProvStateUBPopup")
      handler = function(){provstateSearchUB('setProvStateUB',searchVal);};
    else if (eventName == "getCountryPopup")
        handler = function(){countrySearch('setCountry',searchVal);};
    else if (eventName == "getCountryRemitPopup")
        handler = function(){remitCountrySearch('setRemitCountry',searchVal);};
    else if (eventName == "getCountryUBPopup")
      handler = function(){countrySearch('setCountryUB',searchVal);};
    else if (eventName == "getCountyPopup")
      handler = function(){countySearch('setCounty',searchVal);};
    else if (eventName == "getAddressSearchPopup")
        handler = function(){searchAddress('setAddress',searchVal);};
    else
    {
        return false;
    }
    addThrottledEventHandler(eventName, 50, handler);
}

function countySearch(callback, searchVal){
  var url = "/tools/countypopup.jsp?ESOLcallback=" + callback;

  if(searchVal != ""){
    url += "&ESOLcounty=" + searchVal;
  }
  var tabType = document.getElementsByTagName("body").className;
  if(tabType !== undefined){
    url += "&ESOLtabType=" + tabType;
  }
  var countryCode = $("input[name=country_id]").val();
  if(countryCode){
    url += "&ESOLcountryCode=" + countryCode;
  }

  openSizedLookup(url, 575, 380);
}

function addressSearch(callback, postalCode){
  postalCode.value = trim(postalCode.value);
  var url = "/tools/address_search.jsp?ESOLpostalCode=" + postalCode.value + "&ESOLcallback=" + callback;
  var tabType = document.getElementsByTagName("body")[0].className;

  if(tabType !== undefined){
    var newTabType = tabType.split(" ");
    if(newTabType.length > 1 ){
      url += "&ESOLtabType=" + newTabType[1];
    } else {
      url += "&ESOLtabType=" + tabType;
    }
  }
  openSizedLookup(url, 300, 300);
}

function closeDatePopup(){
  if(datePopupWindow != null){
    if(!datePopupWindow.closed){
      datePopupWindow.close();
    }
    datePopupWindow = null;
  }
}

function openCalendar(op, index, callbackFunction){
  var url = '/tools/calendar.jsp?ESOLopen=' + op;
  if(index != null){
    url += '&ESOLindex=' + index;
  }
  if(callbackFunction != null){
    url += '&ESOLcallback=' + callbackFunction;
  }
  datePopupWindow = openPopupWin(url, "Calendar", 220, 160, "toolbar=0,location=0,directories=0,status=0,menubar=0,scrollbars=0,resizable=1");
}


function getClientIdIfAvailable()
{
  var cid="-1";
  if (document.client && client != null && client.ESOLclientid != null ) { // if coming from client detail, get clientid and return
    if (client.ESOLclientid.length !== undefined && client.ESOLclientid.length > 0) {
      cid = client.ESOLclientid[0].value;
    } else {
      cid = client.ESOLclientid.value;
    }
  } else if(typeof currentResidentId != 'undefined' && currentResidentId != null){
    cid = currentResidentId;
  }
  return cid;
}



/**********************************************************************
* Function to open the QuickUsADT popup screen.
*
* @param returl
*   The URL to return.
* @param cid
*   The client identifier.
**********************************************************************/
function showQuickADT(returl,cid,facType,tabType)
{
  var cid = getClientIdIfAvailable() != '-1' ? getClientIdIfAvailable() : cid;
  if (cid != "" && cid != null && cid != "-1") {
    pccPopup('/admin/client/quick_adt.jsp?ESOLclientid='+cid+'&ESOLsearchflag=N&ESOLquickflag=Y&ESOLtabtype=' + tabType + '&retURL='+returl,"quickadtedit",840,400,"scrollbars=yes");
  } else {
    pccPopup('/admin/client/quick_adt.jsp?ESOLsearchflag=S&ESOLquickflag=Y&ESOLactionname=&ESOLtabtype=' + tabType + '&retURL='+returl,"quickadtedit",840,300,"scrollbars=yes");
  }
}

/**********************************************************************
* Method to open the info popup dialog.
* The field ESOLquestion must be defined in the frmData form.
*
* @param text *REQUIRED*
*    The text to display in the information popup.
* @param form *OPTIONAL*
*   The form name as a string if different from 'frmData'.
* @param width *OPTIONAL*
*   The width of the new window to open.
* @param height *OPTIONAL*
*   The height of the new window to open.
**********************************************************************/
function openInfoPopup(text, formName, width, height)
{
  var dX = (width != null) ? width:500;
  var dY = (height != null) ? height:350;

  var form = document.forms[formName == null ? "frmData" : formName];
  if (form && text != null && text.length > 0)
  {
    //save the current form settings
    var tmpAction = form.action;
    var tmpTarget = form.target;

    //open the help window popup
    openSizedLookup2("about:blank", "infopopup", dX, dY, "scrollbars");

    //set the text to the question field
    if(form.ESOLquestion){
      form.ESOLquestion.value = text;
    }

    //set the form settings for info popup
    form.action = "/tools/infopopup.jsp";
    form.target = "infopopup";

    //submit the form the the popup
    form.submit();

    //reset the form settings
    form.action = tmpAction;
    form.target = tmpTarget;
  }
}

function setSelectionValues(formName, fieldMap){
  var formObj = document.forms[formName];
  if(formObj){
    var formField;
    for(var fieldName in fieldMap){
      formField = formObj[fieldName];
      if(formField){
        formField.value = fieldMap[fieldName];
      }
    }
  }
  lookupPickBeforeClose();
  closePopup();
}


//DEPRECATED - DO NOT USE (use the above setSelectionValues function instead)
function lookupPick(fld1,data1,fld2,data2,fld3,data3,fld4,data4,fld5,data5,fld6,data6,fld7,data7,fld8,data8,fld9,data9)
{
  // Accepts a variable number of arguments(up to 9 pairs), validates target field and sets value

  if (fld1 != null && eval("document." + fld1) )
    eval("document." + fld1 + ".value = " + "\'" + data1 +"\'");
  if (fld2 != null && eval("document." + fld2 ))
    eval("document." + fld2 + ".value = " + "\'" + data2 +"\'");
  if (fld3 != null && eval("document." + fld3 ))
    eval("document." + fld3 + ".value = " + "\'" + data3 +"\'");
  if (fld4 != null && eval("document." + fld4 ))
    eval("document." + fld4 + ".value = " + "\'" + data4 +"\'");
  if (fld5 != null && eval("document." + fld5 ))
    eval("document." + fld5 + ".value = " + "\'" + data5 +"\'");
  if (fld6 != null && eval("document." + fld6 ))
    eval("document." + fld6 + ".value = " + "\'" + data6 +"\'");
  if (fld7 != null && eval("document." + fld7 ))
    eval("document." + fld7 + ".value = " + "\'" + data7 +"\'");
  if (fld8 != null && eval("document." + fld8 ))
    eval("document." + fld8 + ".value = " + "\'" + data8 +"\'");
  if (fld9 != null && eval("document." + fld9 ))
    eval("document." + fld9 + ".value = " + "\'" + data9 +"\'");
  lookupPickBeforeClose();
  closePopup();
}

function lookupPickBeforeClose(){}



function lookupPickEscape()
{
  // Uses eval to set the given document fields to the given values,
  // then closes the window that was opened with the last openPopup call.
  // Calls lookupPickBeforeClose() before closing popup which is firstly
  // defined to do nothing.
  //
  // Note: Identical functionality to lookupPick() except that it a) calls
  // escapeJavaScript on it's value arguments and b) requires the document
  // field to be there.
  //
  // Parameters: fieldName1, value1, fieldName2, value2, ...
  // Throws: Error If there are not an even number of arguments or if any of the
  //         field names are null.
  // Throws: TypeError If there is no such document field.
  if (arguments.length % 2 != 0)
  {
    throw new Error("Arguments must be sets of field names and values, "
                    +"therefore an even number, not "+arguments.length);
  }
  for (var i=0; i < arguments.length; i+=2)
  {
    if (arguments[i] == null)
    {
      throw new Error("Field name "+i+" must not be null");
    }
    var escaped = escapeJavaScript(arguments[i+1]);
    eval("document."+arguments[i]+".value = "+"\'"+escaped+"\'");
  }
  lookupPickBeforeClose();
  closePopup();
}


function setFocus(){
  var search;
  for(var frm=0;frm<document.forms.length;frm++){
    for(var fld=0;fld<document.forms[frm].elements.length;fld++){
      var elt = document.forms[frm].elements[fld];
      // skip buttons, radio, or check-boxes
      // to skip "select" types, remove from if statement
      if((elt.type == "text") || (elt.type == "textarea")){
        if(elt.name == "substring"){
          search = elt;
        }
        if(elt.name != "substring" && elt.name != "searchtype" && elt.name.indexOf("owner") != 0){
          elt.focus();
          // select text in text field or textarea
          if(elt.type == "text"){
            elt.select();
          }
          return true;
        }
      }
    }
  }

  if(search != null){
     search.focus();
  }
  return true;
}

function dc(){
    return window.confirm('Are you sure?');
}

function confirmDelete(href){
  if(dc()){
    location.replace(href);
  }
}

function submitForm()
{
  var f = document.forms['frmData'];
  f.elements['ESOLsaveflag'].value = "S";
  f.submit();
  top.resizeTo(450, 298);
}

var A_Key=65;
var Z_Key=90;
window.quickKeysEnabled = true;
// handles quick-key functions
function handleQuickKeyPress(){
	if(typeof(event) != "undefined"){
		if(window.quickKeysEnabled && event.ctrlKey && event.shiftKey && event.keyCode>=A_Key && event.keyCode<=Z_Key){
			var letter = String.fromCharCode(event.keyCode).toLowerCase(); // convert key code to lower case letter
			try{
				if(typeof(window[letter+'KeyPressed']) == 'function'){
					addThrottledEventHandler('keyPressHandler', 750, function(){
						var params = {"key":letter, "page":location.href};
						$.get('/tools/emptyresponse.jsp', params, function(){});
						window[letter+'KeyPressed']();//will run JS function (e.g. sKeyPressed()) if found on page for any alpha character keyed with CTRL-SHIFT
					});
					event.returnValue = false;
				}
			} catch(errorObject){}
		}
		return true;
	}
}

function enableQuickKeys(value){
  window.quickKeysEnabled = value;
}

var initialProcMsg = 'Processing ';
var procInterval;
var procMsgIDList;
var procMsgWithDots;

function deactivateProcMsg()
{
  clearInterval(procInterval);

  var remainingIDs = procMsgIDList;
  var more = true;
  var nextID;

  while(more)
  {
    if(remainingIDs && remainingIDs.indexOf(",")>=0)
    {
      nextID = remainingIDs.substring(0,remainingIDs.indexOf(","));
      remainingIDs = remainingIDs.substring(remainingIDs.indexOf(",")+1,remainingIDs.length);
    }
    else
    {
      nextID = remainingIDs;
      more = false;
    }
    if(eval(nextID)){
      eval(nextID).innerHTML="";
    }
  }
}

function startProcess(id, msg)
{
  enableQuickKeys(false);
  var html = document.getElementById(id).innerHTML;
  startProcMsg(id, msg);
  return html;
}

function stopProcess(id, html)
{
  clearInterval(window.procInterval);
  document.getElementById(id).innerHTML = html;
  enableQuickKeys(true);
}




// Examples
//startProcMsg('msg1,msg2', 'Saving');
//startProcMsg('buttons');
// note: will change css class for TD if not already assigned one

function startProcMsg(idList, initialMessage)
{
  // override default message if specified
  if (initialMessage)
    initialProcMsg = initialMessage + ' ';

  procMsgWithDots = initialProcMsg;
  procMsgIDList = idList;

  var remainingIDs = idList;
  var more = true;
  var nextID;

  while (more)
  {
    if (remainingIDs.indexOf(",")>=0)
    {
      nextID = remainingIDs.substring(0,remainingIDs.indexOf(","));
      remainingIDs = remainingIDs.substring(remainingIDs.indexOf(",")+1,remainingIDs.length);
    }
    else
    {
      nextID = remainingIDs;
      more = false;
    }
    if (eval(nextID))
    {
      eval(nextID).innerHTML = initialProcMsg;
      if(eval(nextID).className == "")
        eval(nextID).className = "processingMsgNormal";
    }
  }
  procInterval = setInterval("updateProcMsg(procMsgIDList)",300);
}

function updateProcMsg(idList)
{
  if(procMsgWithDots.length > 25){
    procMsgWithDots = initialProcMsg;
  }
  procMsgWithDots = procMsgWithDots + '.';

  var remainingIDs = idList;
  var more = true;
  var nextID;

  // expect a comma delimited list of IDs
  while(more)
  {
    if(remainingIDs.indexOf(",")>=0)
    {
      nextID = remainingIDs.substring(0,remainingIDs.indexOf(","));
      remainingIDs = remainingIDs.substring(remainingIDs.indexOf(",")+1,remainingIDs.length);
    }
    else
    {
      nextID = remainingIDs;
      more = false;
    }
    if(eval(nextID)){
      eval(nextID).innerHTML = procMsgWithDots;
    }
  }
}


/***************************************************************************
* Function that starts a loading/processing message within the specified
* container.
*
* @param  paramContainerId
*         HTML container ID where message will be displayed.
* @param  paramLoadingText
*         Text String. Parameter can be blank if no text is required.
* @param  paramClassName
*         CSS Class to be applied to the container.
* @param  paramImageType
*         NONE      - For no image.
*         CIRCLE    - For loading circle.
*
***************************************************************************/
function startLoadingMessage(paramContainerId, paramLoadingText, paramClassName, paramImageType){
  var loadingContainer = document.getElementById(paramContainerId);
  var loadingImageType = "NONE";

  if(paramClassName != "" && paramClassName != null && paramClassName != "undefined"){
    loadingContainer.className = paramClassName;
  }
  if(paramImageType != "" && paramImageType != null && paramImageType != "undefined"){
    loadingImageType = paramImageType.toUpperCase();
  }
  if(loadingImageType == "CIRCLE"){
	loadingContainer.innerHTML = '<img src="/images/loading-circle.gif"/> ' + paramLoadingText;
  } else if(loadingImageType == "NONE"){
    loadingContainer.innerHTML = ' ' + paramLoadingText;
  }
}

function stopLoadingMessage(paramContainerId){
  var loadingContainer = document.getElementById(paramContainerId);
  loadingContainer.innerHTML = "";
}

/*******************************************************************************
* Function to show/hide a loading message.  This function will create a
* translucent Glasspane over the entire screen and will display the message
* in a centered box along with an animated indicator GIF.
*
* @param  messageText
*         The message to display in the Glasspane.  Use null to hide the
*         Glasspane, otherwise any non-empty string to display the Glasspane.
*******************************************************************************/
function glassPane(messageText)
{
  var IS_IE = (navigator.appName.indexOf("Microsoft") != -1);
  var elementGlass = null; //the glass pane
  var elementInner = null; //the inner container
  var elementLabel = null; //the message label container
  var elementImage = null; //the preloader image
  var screenWidth  = 0;    //width of the screen
  var screenHeight = 0;    //height of the screen

  elementGlass = document.getElementById("glasspane");
  if (elementGlass)
  {
    elementInner = elementGlass.firstChild;
    elementLabel = elementInner.firstChild;
    elementImage = elementInner.lastChild;
  }
  else
  {
	screenHeight = $(document).height();
    if (document.body.clientWidth)
    {
      screenWidth  = document.body.clientWidth;
    }
    else if (document.body.offsetWidth)
    {
      screenWidth  = document.body.offsetWidth;
    }
    else if (window.innerWidth)
    {
      screenWidth  = window.innerWidth;
    }
    else if (window.outerWidth)
    {
      screenWidth  = window.outerWidth;
    }

    elementGlass = document.createElement("div");
    elementGlass.setAttribute("id", "glasspane");
    elementGlass.style.visibility      = "hidden";
    elementGlass.style.position        = "absolute";
    elementGlass.style.zIndex          = "99999";
    elementGlass.style.top             = "0px";
    elementGlass.style.left            = "0px";
    elementGlass.style.height          = "100%";
    elementGlass.style.width           = "100%";
    if(IS_IE){
      elementGlass.style.backgroundImage = "url('/images/checker_mask.gif')";
      elementGlass.style.backgroundPosition = "left top";
      elementGlass.style.backgroundRepeat = "repeat";
    } else {
      elementGlass.style.backgroundColor = "#ffffff";
      elementGlass.style.opacity         = ".75";
    }
    document.body.appendChild(elementGlass);

    elementInner = document.createElement("div");
    elementInner.style.position        = "absolute";
    elementInner.style.top             = ((screenHeight - 80) / 2)+"px";
    elementInner.style.left            = ((screenWidth - 320) / 2)+"px";
    elementInner.style.width           = "320px";
    elementInner.style.height          = "80px";
    elementInner.style.backgroundColor = "#efefff";
    elementInner.style.border          = "2px solid #000000";
    elementInner.style.textAlign       = "center";
    elementGlass.appendChild(elementInner);

    elementLabel = document.createElement("span");
    elementLabel.style.display         = "block";
    elementLabel.style.paddingTop      = "16px";
    elementLabel.style.width           = "100%";
    elementLabel.style.font            = "bold 14px verdana";
    elementLabel.style.color           = "#000000";
    elementInner.appendChild(elementLabel);
  }

  if (messageText == null || typeof(messageText) == "undefined")
  {
    elementGlass.style.visibility = "hidden";
  }
  else
  {
    elementGlass.style.visibility = "visible";
    elementLabel.innerHTML = messageText;
  }
}

function checkClearAll(obj, yn){
  if(obj != undefined && obj != null){
    var checkIt = false;
    if(yn){
      checkIt = true;
    }
    if(obj.length){
      for(var i=0;i<obj.length;i++){
        obj[i].checked = checkIt;
      }
    } else {
      obj.checked = checkIt;
    }
  }
}

function areAllCheckboxesChecked(object) {
  if (object) {
    if ("length" in object) {
      if (object.length > 0) {
        return Array.prototype.every.call(object, function (value) {
            return value.checked;
        });
      }
    } else {
      return object.checked;
    }
  }
  return false;
}

//Validation functions
function validNum(obj)
{
  var val = obj.value;
  var bag = "0123456789";
  var strippedVal = ESOLDontStripCharsInBag(val, bag);
  if (strippedVal.length == 0)
  {
    alert("Invalid entry. Please enter integer value.");
    obj.focus();
    return false;
  }
  else
  {
    return true;
  }
}

//TODO: Migrate to include only on the pages that need it
function changeTabColour(tabName, type, newStyle)
{
  var doc = document.getElementById(tabName);

  if(jsPrevTbSel!=tabName)
  {
    doc.className = newStyle;
  }
  doc.style.cursor = 'pointer';
}

function glassPanePanel(id, messageText)
{
  if(!id){
    alert("Id is required.");
    return false;
  }

  var elementGlass = null; //the glass pane
  var elementInner = null; //the inner container
  var elementLabel = null; //the message label container
  var elementImage = null; //the preloader image

  elementGlass = document.getElementById("glasspanePanel");
  if (elementGlass)
  {
    elementInner = elementGlass.firstChild;
    elementLabel = elementInner.firstChild;
    elementImage = elementInner.lastChild;
  }
  else
  {
    elementGlass = document.createElement("div");
    elementGlass.setAttribute("id", "glasspanePanel");
    elementGlass.style.visibility      = "hidden";
    elementGlass.style.position        = "absolute";
    elementGlass.style.zIndex          = "99999";
    elementGlass.style.height          = "100%";
    elementGlass.style.width           = "100%";
    elementGlass.style.backgroundColor = "#FFFFFF";
    elementGlass.style.opacity         = ".75";
    elementGlass.style.filter          = "alpha(opacity=75)";
    document.getElementById(id).appendChild(elementGlass);

    elementInner = document.createElement("div");
    elementInner.style.position        = "absolute";
    elementInner.style.top             = ((document.getElementById(id).offsetHeight - 80) / 2)+"px";
    elementInner.style.left            = ((document.getElementById(id).offsetWidth - 320) / 2)+"px";
    elementInner.style.width           = "320px";
    elementInner.style.height          = "80px";
    elementInner.style.backgroundColor = "#EFEFFF";
    elementInner.style.border          = "2px solid #000000";
    elementInner.style.textAlign       = "center";
    elementGlass.appendChild(elementInner);

    elementLabel = document.createElement("span");
    elementLabel.style.display         = "block";
    elementLabel.style.paddingTop      = "16px";
    elementLabel.style.width           = "100%";
    elementLabel.style.font            = "bold 14px verdana";
    elementLabel.style.color           = "#000000";
    elementInner.appendChild(elementLabel);

    elementImage = document.createElement("img");
    elementImage.setAttribute("src", "/images/glasspane-loader.gif");
    elementImage.setAttribute("alt", "Loading...");
    elementImage.setAttribute("width", "32");
    elementImage.setAttribute("height", "32");
    elementInner.appendChild(elementImage);
  }

  if (messageText == null || typeof(messageText) == "undefined")
  {
    document.getElementById(id).removeChild(elementGlass);
  }
  else
  {
    elementGlass.style.visibility = "visible";
    elementLabel.innerHTML = messageText;
  }
}


//TODO: move this file to a specific file/include
function updatePreviewLabel(orgCode, specPreferredName, isNotSchedulable)
{
    var prefix = $('#fileFormatPrefix').val();
	var extension = $("#fileFormatSuffix").size() > 0 ? $("#fileFormatSuffix").val() : "ps";
	var dateOptionVal = $("#datePattern option:selected").val();

	// determine the spec name if it is not given
	var specType = "exporttype";
	if (specPreferredName) {
	    specType = specPreferredName;
	} else {
	    var selectedSpec = $("#privateStatementExportSpecificationId option:selected");
	    if(selectedSpec.size() == 0)
	    {
	        selectedSpec = $("#specificationId option:selected");
	    }
	    specType = selectedSpec.size() > 0 ? selectedSpec.text().split(' ')[0] : "exporttype";
	}

	var curDate = new Date();
	var dateString = "";
	if(dateOptionVal == "1")
	{
	    // first day of the billing month
		curDate.setDate(1);
		if (!isNotSchedulable) {
		    if($("input.priorMonthOption:eq(0)").attr("checked"))
		    {
		        curDate.setMonth(curDate.getMonth() - 1);
		    }
		}
		dateString = dateToMMDDYYYY(curDate);
	}
	else
	{
	    //current date
	    var hours = curDate.getHours();
	    if (hours < 10) hours = '0' + hours;
	    var mins = curDate.getMinutes();
	    if (mins < 10) mins = '0' + mins;
	    dateString = dateToMMDDYYYY(curDate) + '_' + hours + mins;
	}

	var fileName = (prefix == '' ? '' : prefix + '_' )+ orgCode + '_' + dateString + '_' + specType + '.' + extension;
	$('#preview').text(fileName);
}
//TODO: rename function to match its actual behavior (and migrate)
function checkFilePrefixFormat(elem, pattern)
{
	var val = elem.value;
	val = val.replace(pattern, '');
	elem.value = val;
}

if(typeof(window.$) != 'undefined'){
    $(document).on('click', 'a.pccActionMenu', function(){
       var actionMenu = $(this).next();
       if(actionMenu.is(':visible')){
          actionMenu.hide();
       } else {
          $('ul.pccMenuWrapper').hide();
          actionMenu.show();
       }
    });
    //wire up menu hide...
    $(document).on('click', 'a.pccActionMenu, ul.pccMenuWrapper', function(e){
      e.stopPropagation();//stop click event from reaching document
    });
    $(document).on('click', 'ul.pccMenuWrapper', function(e){
      $(this).hide();
    });
    $(document).click(function(){
      $('ul.pccMenuWrapper').hide();//click was not in any menu, close them all
    });
    //wire up dropDownButton menus...
    $(document).on('click', 'div.dropDownButtonContainer, td.dropDownButtonContainer', function(e){
      e.stopPropagation();//stop click event from reaching document
      var button = $(this).find('.pccButton');
      if(button.length && button.prop('disabled')){return;}
      var menu = $(this).find('.dropDownMenu');
      if(menu.css('display') == 'none'){
        menu.css('display', 'block');
      } else {
        menu.css('display', 'none');
      }
    });
    $(document).on('mouseleave', 'div.dropDownButtonContainer, td.dropDownButtonContainer', function(e){
      $(this).find('.dropDownMenu').hide();
    });
    $(window).resize(function(){
      //hide menus on resize as they disconnect from their owners
      addThrottledEventHandler('onResizeCloseDropDownMenus', 1000, function(){$('div.dropDownMenu').css('display', 'none');});
    });
}