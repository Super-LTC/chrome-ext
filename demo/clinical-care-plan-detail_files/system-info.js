'use strict';
function getSystemInfo(){
	var ua = navigator.userAgent;
	var systemInfo = {};
	systemInfo.ua = ua;
	var osInfo = getOperatingSystemInfo(ua);
	//merge in props (ES5)
	for(var att in osInfo){
		systemInfo[att] = osInfo[att];
	}
	var browserInfo = getWebBrowserInfo(ua, systemInfo.os);
	//merge in props (ES5)
	for(var att in browserInfo){
		systemInfo[att] = browserInfo[att];
	}
	systemInfo.screenSize = screen.width + 'x' + screen.height;
	systemInfo.browserSize = $(window).width() + 'x' + $(window).height();
	return systemInfo;
}

function getOperatingSystemInfo(ua){
	var os = 'Unknown';
	var browserBitness = '';
	var osBitness = '';
	//Check for versions of Windows first
	if(ua.indexOf('Windows NT') != -1){
		//2000, XP/XP64, 2003, Vista, 7, 8, 8.1, 10
		if(ua.indexOf('Windows NT 10.0') != -1){
			os = 'Windows 10';
		} else if(ua.indexOf('Windows NT 6.3') != -1){
			os = 'Windows 8.1';
		} else if(ua.indexOf('Windows NT 6.2') != -1){
			os = 'Windows 8.0';
		} else if(ua.indexOf('Windows NT 6.1') != -1){
			os = 'Windows 7';
		} else if(ua.indexOf('Windows NT 6.0') != -1){
			os = 'Windows Vista';
		} else if(ua.indexOf('Windows NT 5.2') != -1){
			os = 'Windows 2003 or XP64';
		} else if(ua.indexOf('Windows NT 5.1') != -1){
			os = 'Windows XP';
		} else if(ua.indexOf('Windows NT 5.0.1') != -1){
			os = 'Windows 2000';
		}
		browserBitness = '32bit';//default
		osBitness = '32bit';//default
		if(ua.indexOf('Win64') != -1){
			browserBitness = '64bit';
			osBitness = '64bit';
		} else if(ua.indexOf('WOW64') != -1){
			browserBitness = '32bit';
			osBitness = '64bit';
		}
	} else if(ua.indexOf('Windows 9') != -1){
		//95,98,ME
		if(ua.indexOf('Windows 98; Win 9x 4.90') != -1){
			os = 'Windows ME';
		} else if(ua.indexOf('Windows 98') != -1){
			os = 'Windows 98';
		} else if(ua.indexOf('Windows 95') != -1){
			os = 'Windows 95';
		}
	} else if(ua.indexOf('Windows Phone') != -1){
		os = 'Windows Phone';
	} else if(ua.indexOf('Macintosh') != -1){
		os = 'Mac OS ';
		if(ua.indexOf('OS X') != -1){
			os = ua.substr(ua.indexOf('OS X')).split(')')[0];
		}
	} else if(ua.indexOf('CrOS') != -1){
		os = 'Chrome OS';
	} else if(ua.indexOf('Android') != -1){
		os = 'Android';
	} else if(ua.indexOf('iPad') != -1){
		os = 'iPad/iOS';
	} else if(ua.indexOf('iPhone') != -1){
		os = 'iPhone/iOS';
	} else if(ua.indexOf('iPod') != -1){
		os = 'iPod/iOS';
	} else if(ua.indexOf('PlayBook') != -1){
		os = 'BlackBerry PlayBook';
	} else if(ua.indexOf('BB10') != -1){
		os = 'BlackBerry 10';
	} else if(ua.indexOf('BlackBerry') != -1){
		os = 'BlackBerry';//9900, Bold, etc.
	} else if(ua.indexOf('Nintendo WiiU') != -1){
		os = 'Nintendo WiiU';
	} else if(ua.indexOf('Nintendo 3DS') != -1){
		os = 'Nintendo 3DS';
	} else if(ua.indexOf('wOSBrowser') != -1){
		os = 'HP/Web OS';
	} else if(ua.indexOf('PlayStation') != -1){
		os = 'PlayStation';
		if(ua.indexOf('PlayStation Vita') != -1){
			os = 'PlayStation Vita';
		}
	} else if(ua.indexOf('AQUOSBrowser') != -1){
		os = 'Sharp/Espial DTV';
	} else if(ua.indexOf('SMART-TV') != -1){
		os = 'SMART TV';
	} else if(ua.indexOf('Linux') != -1){
		os = 'Linux';
	}
	var osInfo = {
		'os':os,
		'browserBitness':browserBitness,
		'osBitness':osBitness
	};
	return osInfo;
}

function getWebBrowserInfo(ua, os){
	var browser = 'Unknown';
	var browserVersion = 'Unknown';
	if(ua.indexOf('Edge') != -1){
		browser = 'Microsoft Edge';
		browserVersion = ua.substr(ua.indexOf('Edge/')+5);
		browserVersion = Number(browserVersion.substr(0, browserVersion.indexOf('.')));
	} else if(ua.indexOf('Edg/') != -1){
		browser = 'Microsoft Edge (Dev)';
		browserVersion = ua.substr(ua.indexOf('Edg/')+4);
		browserVersion = Number(browserVersion.substr(0, browserVersion.indexOf('.')));
	} else if(ua.indexOf('Vivaldi/') != -1){
		browser = 'Vivaldi Browser';
		browserVersion = ua.substr(ua.indexOf('Vivaldi/')+8);
		browserVersion = parseFloat(browserVersion);
	} else if(ua.indexOf('OPR/') != -1){
		browser = 'Opera Browser';
		browserVersion = ua.substr(ua.indexOf('OPR/')+4);
		browserVersion = Number(browserVersion.substr(0, browserVersion.indexOf('.')));
	} else if(ua.indexOf('Opera/') != -1){
		browser = 'Opera Browser';//Opera on Android/iOS
		browserVersion = parseFloat(browserVersion);
	} else if(ua.indexOf('Chrome/') != -1){
		browser = 'Google Chrome';
		browserVersion = ua.substr(ua.indexOf('Chrome/')+7);
		browserVersion = parseFloat(browserVersion);
	} else if(ua.indexOf('CriOS/') != -1){
		browser = 'Google Chrome';//Chrome on iOS
		browserVersion = ua.substr(ua.indexOf('CriOS/')+6);
		browserVersion = parseFloat(browserVersion);
	} else if(ua.indexOf('Firefox/') != -1){
		browser = 'Mozilla Firefox';
		browserVersion = Number(ua.substr(ua.indexOf('Firefox/')+8));
	} else if(ua.indexOf('FxiOS/') != -1){
		browser = 'Mozilla Firefox';
		browserVersion = parseFloat(ua.substr(ua.indexOf('FxiOS/')+6));
	} else if(ua.indexOf('BB10') != -1){
		browser = 'BlackBerry 10 Browser';
		browserVersion = 10;
	} else if(ua.indexOf('PlayBook') != -1){
		browser = 'BlackBerry PlayBook Browser';
		browserVersion = 10;
	} else if(ua.indexOf('Silk/') != -1 && ua.indexOf('PlayStation') == -1){
		browser = 'Amazon Silk Browser';
	} else if(os == 'Android' && ua.indexOf('AppleWebKit/') != -1){
		browser = 'Android WebKit Browser';//default Android browser
	} else if(os == 'Nintendo WiiU'){
		browser = 'Nintendo Browser';
	} else if(ua.indexOf('Safari/') != -1 && (os != 'Unknown')){
		browser = 'Apple Safari';
		browserVersion = ua.substr(ua.indexOf('Safari/')+7);
		browserVersion = parseFloat(browserVersion);//gives 500-600+
		if(browserVersion >= 602){
			//Apple updated their UA to include a "Version/XX.X" string for some version 10+ agents
			browserVersion = 10;//default
			if(ua.indexOf('Version/') != -1){
				browserVersion = ua.substr(ua.indexOf('Version/')+8);
				browserVersion = parseFloat(browserVersion);//gives 10.x,11.x,12.x+
			}
		} else if(browserVersion >= 601){
			browserVersion = 9;
		} else if(browserVersion >= 538){
			browserVersion = 8;
		} else if(browserVersion >= 537){
			browserVersion = 7;
		} else if(browserVersion >= 536){
			browserVersion = 6;
		} else if(browserVersion >= 533){
			browserVersion = 5;
		} else {
			browserVersion = 4;
		}
	} else if(ua.indexOf('Focus/') != -1){
		browser = 'Firefox Focus';
		browserVersion = ua.substr(ua.indexOf('Focus/')+6);
		browserVersion = parseFloat(browserVersion);
	} else if(ua.indexOf('AppleWebKit/') != -1){
		browser = 'WebKit Browser';
		browserVersion = 0;
	}
	var browserInfo = {
		'browser':browser,
		'browserVersion':browserVersion
	}
	return browserInfo;
}