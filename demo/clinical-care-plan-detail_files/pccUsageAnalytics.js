'use strict';
(function(){
	if(!window.PccUsageAnalytics){
		var PccUsageAnalytics = {};
		PccUsageAnalytics.version = "1.4";
		PccUsageAnalytics.config = {};
		PccUsageAnalytics.queuedEvents = [];
		PccUsageAnalytics.commonEventAttributes = {};
		PccUsageAnalytics.mergeAttributes = function(obj1, obj2){
			var obj3 = {};
			var att;
			for(att in obj1){obj3[att] = obj1[att];}
			for(att in obj2){obj3[att] = obj2[att];}
			return obj3;
		};
		PccUsageAnalytics.init = function(){};
		PccUsageAnalytics.updateMetadata = function(userMetadata, optionalAccountMetaData){};
		PccUsageAnalytics.loadGuides = function(){};
		PccUsageAnalytics.stopGuides = function(){};
		PccUsageAnalytics.trackEvent = function(eventName, eventAttributes){};
		window.PccUsageAnalytics = PccUsageAnalytics;
	}
}());