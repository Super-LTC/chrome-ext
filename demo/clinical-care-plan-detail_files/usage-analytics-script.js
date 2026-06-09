(function(){
	if(window.PccUsageAnalytics){
		//redefine init() stub function
		window.PccUsageAnalytics.init = function(){
			//Only continue if we have a configuration set
			if(!PccUsageAnalytics.config){
				return;
			}
			var USER_ID = (PccUsageAnalytics.config['user-id'] || '').toLowerCase();
			var ACCOUNT_ID = (PccUsageAnalytics.config['account-id'] || '').toLowerCase();
			var blacklistedParamsList = PccUsageAnalytics.config['blacklisted-params-list'] || null;
			var additionalUserAttributes = PccUsageAnalytics.config['additional-user-attributes'] || null;
			var commonCustomEventAttributes = PccUsageAnalytics.config['common-custom-event-attributes'];
			var disableGuides = false;
			if(typeof(PccUsageAnalytics.config['disable-guides']) != 'undefined' && PccUsageAnalytics.config['disable-guides'] == true){
				disableGuides = true;
			}
			if(commonCustomEventAttributes){
				PccUsageAnalytics.commonEventAttributes = commonCustomEventAttributes;
			}
			//Vendor specific IDs
			var PENDO_PRIMARY_ID = PccUsageAnalytics.config['pendo-primary-subscription-id'] || null;
			var PENDO_ADDITIONAL_IDS = PccUsageAnalytics.config['pendo-additional-subscription-ids'] || null;
			//Pendo primary ID is required
			if(!PENDO_PRIMARY_ID){
				return;
			}
			var visitorAttributes = {};
			if(additionalUserAttributes){
				visitorAttributes = additionalUserAttributes;
			}
			visitorAttributes["id"] = USER_ID;
			var pendoInitializeConfig = {};
			pendoInitializeConfig.visitor = visitorAttributes;
			pendoInitializeConfig.account = {id: ACCOUNT_ID};
			if(PENDO_ADDITIONAL_IDS && PENDO_ADDITIONAL_IDS.length >= 1){
				pendoInitializeConfig.additionalApiKeys = PENDO_ADDITIONAL_IDS;
			}
			if(blacklistedParamsList && blacklistedParamsList.length >= 1){
				var pipeDelimitedParamsStr = blacklistedParamsList.join('|');
				var blacklistParamRegex = new RegExp('(&)(' + pipeDelimitedParamsStr + ')(=)([^&#]*)', 'gi');
				var stripParam = function(match, p1, p2){return '';};
				pendoInitializeConfig.sanitizeUrl = function(url){
					var queryIndex = url.indexOf('?');
					if(queryIndex == -1){
						return url;
					} else {
						var base = url.substr(0, queryIndex);
						var query = '&' + url.substr(queryIndex + 1);
						var newUrl = base;
						var newQuery = query.replace(blacklistParamRegex, stripParam);
						if(newQuery.length > 1){
							newUrl += '?' + newQuery.substr(1);
						}
						return newUrl;
					}
				};
			}
			if(disableGuides){
				pendoInitializeConfig.disableGuides = true;
			}
			(function(apiKey){
				(function(p,e,n,d,o){var v,w,x,y,z;o=p[d]=p[d]||{};o._q=[];
					v=['initialize','identify','updateOptions','pageLoad'];for(w=0,x=v.length;w<x;++w)(function(m){
						o[m]=o[m]||function(){o._q[m===v[0]?'unshift':'push']([m].concat([].slice.call(arguments,0)));};})(v[w]);
					y=e.createElement(n);y.async=!0;y.src='https://cdn.pendo.io/agent/static/'+apiKey+'/pendo.js';
					z=e.getElementsByTagName(n)[0];z.parentNode.insertBefore(y,z);})(window,document,'script','pendo');
				pendo.initialize(pendoInitializeConfig);
			})(PENDO_PRIMARY_ID);
			//Note: The events object inside pendo.initialize() does not work, and it actually blocks visitor attributes from being sent to Pendo (e.g. a bug), thus we must handle this ourselves
			(function(){
				var checkCount = 0;
				function processQueuedEventsWhenPendoReady(){
					checkCount++;
					if(typeof(pendo) != 'undefined' && typeof(pendo.track) == 'function'){
						//Pendo has initialized, send queued events
						clearInterval(processQueuedEventsWhenPendoReadyInterval);
						while(PccUsageAnalytics.queuedEvents.length > 0){
							var queuedEvent = PccUsageAnalytics.queuedEvents.shift();
							var eventName = queuedEvent.eventName;
							var eventAttributes = queuedEvent.eventAttributes;
							pendo.track(eventName, PccUsageAnalytics.mergeAttributes(PccUsageAnalytics.commonEventAttributes, eventAttributes));
						}
					}
					if(checkCount >= 10){
						clearInterval(processQueuedEventsWhenPendoReadyInterval);//bail out
					}
				}
				var processQueuedEventsWhenPendoReadyInterval = setInterval(processQueuedEventsWhenPendoReady, 250);
			})();
		};
		//Extend our stub to track events & update metadata in Pendo
		(function(){
			var origTrackEvent = PccUsageAnalytics.trackEvent;
			PccUsageAnalytics.trackEvent = function(eventName, eventAttributes){
				if(typeof(pendo) != 'undefined' && typeof(pendo.track) == 'function'){
					pendo.track(eventName, PccUsageAnalytics.mergeAttributes(PccUsageAnalytics.commonEventAttributes, eventAttributes));
				} else {
					PccUsageAnalytics.queuedEvents.push({'eventName':eventName, 'eventAttributes':eventAttributes});
				}
				origTrackEvent(eventName, eventAttributes);
			};
			PccUsageAnalytics.updateMetadata = function(userMetadata, optionalAccountMetaData){
				if(typeof(pendo) != 'undefined' && typeof(pendo.updateOptions) == 'function'){
					var metadata = {};
					metadata['visitor'] = userMetadata
					if(typeof(optionalAccountMetaData) != 'undefined' && optionalAccountMetaData != null){
						metadata['account'] = optionalAccountMetaData
					}
					pendo.updateOptions(metadata);
				}
			};
			function isPendoGuideMethodsReady(){
				if(document.readyState == 'complete' &&
					typeof(pendo) != 'undefined' &&
					typeof(pendo.stopGuides) == 'function' &&
					typeof(pendo.isReady) == 'function' &&
					pendo.isReady() &&
					typeof(pendo.setGuidesDisabled) == 'function'){
						return true;
				} else {
					return false;
				}
			}
			var stopGuidesCheckCount = 0;
			function invokePendoStopGuidesWhenReady(){
				stopGuidesCheckCount++;
				if(isPendoGuideMethodsReady()){
					clearInterval(invokePendoStopGuidesWhenReadyInterval);
					pendo.setGuidesDisabled(true);
					pendo.stopGuides();
				}
				if(stopGuidesCheckCount >= 120){
					clearInterval(invokePendoStopGuidesWhenReadyInterval);
				}
			}
			PccUsageAnalytics.stopGuides = function(){
				invokePendoStopGuidesWhenReadyInterval = setInterval(invokePendoStopGuidesWhenReady, 250);
			};
			var loadGuidesCheckCount = 0;
			function invokePendoLoadGuidesWhenReady(){
				loadGuidesCheckCount++;
				if(isPendoGuideMethodsReady()){
					clearInterval(invokePendoLoadGuidesWhenReadyInterval);
					pendo.setGuidesDisabled(false);
					pendo.loadGuides();
				}
				if(loadGuidesCheckCount >= 15){
					clearInterval(invokePendoLoadGuidesWhenReadyInterval);
				}
			}
			PccUsageAnalytics.loadGuides = function(){
				invokePendoLoadGuidesWhenReadyInterval = setInterval(invokePendoLoadGuidesWhenReady, 250);
			};
		})();
	}
})();