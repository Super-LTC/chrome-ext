'use strict';
(function(){
	window.helpFileMappings = {};
	function getHelpType(){
		var healthType = window.facilityHealthType;
		var helpType = 'SNF';
		if(healthType == 'ALF' || healthType == 'ILF'){
			helpType = 'SL';
		}
		return helpType;
	}
	function getRegion(){
		var region = window.facilityRegion;
		if(region == "HK"){
			region = "CA";
		} else if(region == "GB"){
			region = "US";
		}
		return region;
	}
	function getHelpRef(){
		var helpRef = null;
		var helpRefMetaValue = $("meta[name='help-ref']").attr('content');
		if(helpRefMetaValue != null && helpRefMetaValue.trim() != ''){
			helpRef = helpRefMetaValue;
		}
		return helpRef;
	}
	function getModuleByScreen(){
		//determine the base module
		var path = location.pathname;
		var search = location.search;
		var module = 'home';
		if(path.indexOf('/home/') == 0){

		} else if(path.indexOf('/admin/') == 0){
			//is it really admin? or clinical?
			module = 'admin';
			if(search.toLowerCase().indexOf('esoltabtype=c') != -1 || path.indexOf('/cp_') != -1 || path.indexOf('/clinical') != -1){
				module = 'clinical';
			}
		} else if(path.indexOf('/clinical/') == 0 || path.indexOf('/care/') == 0){
			module = 'clinical';
		} else if(path.indexOf('/profile/') == 0){
			//TODO: /profile/collections/collectiondisplay.xhtml is ADMIN
			if(path.indexOf('admin') != -1){
				module = 'admin';
			} else {
				module = 'clinical';
			}
		} else if(path.indexOf('/upload/adminfilesdisplay') == 0){
			module = 'admin';
		} else if(path.indexOf('/upload/filesdisplay') == 0){
			module = 'clinical';
		} else if(path.indexOf('/documentmanager/') == 0){
			module = 'documentmanager';
			if(path.indexOf('admin') != -1){
				module = 'admin';
			} else if(path.indexOf('clinical') != -1){
				module = 'clinical';
			}
		} else if(path.indexOf('/glap/') == 0){
			module = 'glap';
		} else if(path.indexOf('/scrm/') == 0 || path.indexOf('/crm/') == 0){
			module = 'crm';
		} else if(path.indexOf('/enterprisereporting/') == 0){
			module = 'enterprisereporting';
		}
		return module;
	}
	function getHelpPage(helpRef, region, helpType){
		//find the mapped page based on the past reference key
		var mappedUrl = null;
		if(helpRef != null){
			mappedUrl = getMappedHelpUrl(helpRef, region, helpType);
		}
		//did we get a mappedUrl? if not, find the best matching page
		if(mappedUrl == null){
			var module = getModuleByScreen();
			var moduleKey = null;
			if(module == 'admin'){
				moduleKey = 'Admin_Main_Page';
			} else if(module == 'clinical'){
				moduleKey = 'Clinical_Main_Page';
			} else if(module == 'crm'){
				moduleKey = 'CRM_Main_Page';
			} else if(module == 'documentmanager'){
				moduleKey = 'Document_Manager_Main_Page';
			} else if(module == 'glap'){
				moduleKey = 'GLAP_Main_Page';
			} else {
				//we don't know what to show, so let's jump into the basics
				moduleKey = 'The_Basics_Overview';
			}
			mappedUrl = getMappedHelpUrl(moduleKey, region, helpType);
			if(!mappedUrl){
				//if no mapped url can be determined, provide a default
				if(region == "CA"){
					mappedUrl = 'using-the-pointclickcarehelp-centre.html';
				} else {
					mappedUrl = 'using-the-pointclickcarehelp-center.html';
				}
			}
		}
		return mappedUrl;
	}
	function getMappedHelpUrl(helpRef, region, helpType){
		var helpUrl = null;
		var helpFileMappingKey = region.toLowerCase() + '-' + helpType.toLowerCase();
		if(typeof(window.helpFileMappings[helpFileMappingKey]) == 'undefined'){
			//JIT-load them
			var helpJsonUrl = '/assets/core/help/js/help-mappings-' + helpFileMappingKey + '.json';
			$.ajaxSetup({'async':false});
			var helpJSONResponse = $.getJSON(helpJsonUrl);
			$.ajaxSetup({'async':true});
			if(helpJSONResponse && helpJSONResponse.status == 200){
				window.helpFileMappings[helpFileMappingKey] = JSON.parse(helpJSONResponse.responseText);
			} else {
				console.error('Error loading help file: ' + helpJsonUrl);
			}
		}
		if(window.helpFileMappings[helpFileMappingKey]){
			helpUrl = window.helpFileMappings[helpFileMappingKey][helpRef];
		}
		return helpUrl;
	}
	window.openContextSensitiveHelp = function(helpPage){
		var helpType = getHelpType();
		var region = getRegion();
		var helpRef = getHelpRef();
		// In most cases, helpPage will be null and we will find the appropriate page based on helpRef
		// However, if helpPage is provided, we will use that directly
		if(typeof(helpPage) == 'undefined' || helpPage == null || helpPage.trim() == ''){
			helpPage = getHelpPage(helpRef, region, helpType);
		}
		var langToken = 'en';
		var helpUrl = "";
		if(typeof(window['facilityPersonManagementEnabled']) != 'undefined' && window.facilityPersonManagementEnabled){
			helpUrl = "/help/resorgmanagement/" + langToken + "/" + helpPage;
		}
		else {
			helpUrl = "/help/online/" + langToken + "/" + helpType + "/" + langToken + "/" + helpPage;
		}
		var screenWidth = screen.width;
		var screenHeight = screen.height;
		var windowOffset = 50;
		window.open(helpUrl, '_blank', 'height=' + (screenHeight - windowOffset) + ',bookmarks=1,left=' + windowOffset + ',location=1,menubar=1,personalbar=1,resizable=1,scrollbars=1,status=1,titlebar=1,toolbar=1,top=' + windowOffset + ',width=' + (screenWidth - windowOffset));
	};
	window.setContextSensitiveHelp = function(helpRef){
		if($("meta[name='help-ref']").length == 0){
			$('head').append('<meta name="help-ref"/>');
		}
		$("meta[name='help-ref']").attr('content', helpRef);
	};
	//listen for the applicable Help Hotkey
	var ua = navigator.userAgent;
	if(ua.indexOf('Windows') != -1){
		if('onhelp' in window){
			window.onhelp = function(){
				openContextSensitiveHelp();
				return false;
			}
		} else {
			document.onkeydown = function(e){
				if(e.keyCode == 112){
					openContextSensitiveHelp();
					return false;
				}
			};
		}
	} else if(ua.indexOf('Macintosh') != -1){
		window.addEventListener('keydown', function(e){
			if(e.metaKey && e.key == '/'){
				e.stopPropagation();
				e.cancelBubble = true;
				e.returnValue = false;
				openContextSensitiveHelp();
				return false;
			}
		});
	} else {
		window.addEventListener('keydown', function(e){
			if(e.ctrlKey && e.key == '/'){
				e.stopPropagation();
				e.cancelBubble = true;
				e.returnValue = false;
				openContextSensitiveHelp();
				return false;
			}
		});
	}
}());