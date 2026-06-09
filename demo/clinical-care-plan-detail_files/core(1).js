'use strict';

(function(){
	window.clinicalSmartAlerts = window.clinicalSmartAlerts || {};
	var _NS = clinicalSmartAlerts;
	
	_NS.AppStorage = (function() {
		var _STORAGE_PREFIX = 'CLINICAL_SMART_ALERTS.' + _NS.moduleProps.userId + '.';
		
		var _getKey = function(key){
			return _STORAGE_PREFIX + key;
		};
		
		return {
			IS_DRAWER_VISIBLE: 'isDrawerVisible',
            IS_FILTER_EXPANDED: 'isFilterExpanded',
			UNITS_AND_FLOORS_DATA: 'unitsAndFloorsData',
			CATEGORY_FILTER_DATA: 'categoryFilterData',
			UNIT_SELECTED: 'unitSelected',
			FLOOR_SELECTED: 'floorSelected',
			CATEGORIES_SELECTED: 'categoriesSelected',
			CATEGORY_FILTER_FACID: 'categoriesFacId',
			FORCE_ALL: 'forceAll',
			SCROLLED_TO_ALERT_TAB_TYPE: 'scrolledToAlertTabType',
			SCROLLED_TO_ALERT_CLIENT_ID: 'scrolledToAlertClientId',
			SCROLLED_TO_ALERT_CREATED_TIMESTAMP: 'scrolledToAlertCreatedTimestamp',
			SCROLLED_TO_ALERT_TYPE: 'scrolledToAlertType',
			SCROLLED_TO_ALERT_ID: 'scrolledToAlertId',
			SCROLLED_TO_ALERT_MODULE: 'scrolledToAlertModule',
			ACTIVE_ALERTS: 'activeAlerts',
			CACHE_TIMEOUT : 'cacheTimeout',
			HAS_ALL_ALERTS : 'hasAllAlerts',
			LAST_TIME_HAS_ALERTS_CHECKED : 'lastTimeHasAlertsChecked',

			PN_PREFIX: 'PN.',
			
			get: function(key) {
				return sessionStorage.getItem(_getKey(key));
			},
			set: function(key, value) {
				sessionStorage.setItem(_getKey(key), value);
			},
			remove: function(key) {
				sessionStorage.removeItem(_getKey(key));
			},
			removeByPrefix: function(prefix) {
				var items = [];
				for (var i = 0; i < sessionStorage.length; i++){
					var key = sessionStorage.key(i);
					if (key.indexOf(_STORAGE_PREFIX+prefix)===0) {
						items.push(key);
					}
				}
				items.forEach(function(e) {
					sessionStorage.removeItem(e);
				});
			}
		};
	}());
	
	_NS.Store = function(reducer, initialState) {
		var store = {};
		store.state = initialState;
		store.listeners = [];
		
		store.getState = function() {
			return store.state;
		};
		
		store.subscribe = function(listener) {
			store.listeners.push(listener);
		};
		
		store.dispatch = function(action) {
			store.state = reducer.reduce(store.state, action);
			store.listeners.forEach(function(listener) {
				return listener();
			});
			store.state = reducer.dispatchComplete(store.state, action);
		};
		
		return store;
	};
	
	_NS.Polyfill = (function() {
		var _fixRequestAnimationFrame = function(){
			var lastTime = 0;
		    var vendors = ['ms', 'moz', 'webkit', 'o'];
		    for (var x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
		        window.requestAnimationFrame = window[vendors[x]+'RequestAnimationFrame'];
		        window.cancelAnimationFrame = window[vendors[x]+'CancelAnimationFrame'] 
		                                   || window[vendors[x]+'CancelRequestAnimationFrame'];
		    }
		 
		    if (!window.requestAnimationFrame) {
		    	window.requestAnimationFrame = function(callback, element) {
		    		var currTime = new Date().getTime();
		    		var timeToCall = Math.max(0, 16 - (currTime - lastTime));
		    		var id = window.setTimeout(function() { callback(currTime + timeToCall); }, 
		    				timeToCall);
		    		lastTime = currTime + timeToCall;
		    		return id;
		    	};
		    }
		 
		    if (!window.cancelAnimationFrame) {	
		    	window.cancelAnimationFrame = function(id) {
		    		clearTimeout(id);
		    	};
		    }
		};
		
		var _getTransitionEndEvent = function() {
		    var el = document.createElement('div'),
		    	transEndEventNames = {
			    	WebkitTransition: 'webkitTransitionEnd',
			    	MozTransition: 'transitionend',
			    	OTransition: 'oTransitionEnd otransitionend',
			    	transition: 'transitionend'
	    		};

		    for (var name in transEndEventNames) {
		    	if (el.style[name] !== undefined) {
		    		return transEndEventNames[name];
	    		}
		    }
		    return false
		};
		
		var _fixNodeListForEach = function() {
			if (window.NodeList && !NodeList.prototype.forEach) {
				NodeList.prototype.forEach = Array.prototype.forEach;
			}
		};
		
		return {
			init: function() {
				_fixRequestAnimationFrame();
				_fixNodeListForEach();
			},
			tools: {
				getTransitionEndEvent: _getTransitionEndEvent
			}
		};
	}());
	
	_NS.Utils = (function() {
		var debounce = function(func, delay) {
			var inDebounce;
			return function() {
				var context = this;
				var args = arguments;
				clearTimeout(inDebounce);
				inDebounce = setTimeout(function() {
					func.apply(context, args);
				}, delay);
			}
		};
		
		var throttle = function(func, limit) {
			var lastFunc;
			var lastRan;
			
			return function() {
				var context = this;
				var args = arguments;
				if (!lastRan) {
					func.apply(context, args);
					lastRan = Date.now();
				} else {
					clearTimeout(lastFunc);
					lastFunc = setTimeout(function() {
						if (Date.now() - lastRan >= limit) {
							func.apply(context, args);
							lastRan = Date.now();
						}
					}, limit - (Date.now() - lastRan));
				}
			};
		};
		
		var isScrollTopNearBottom = function(elem) {
			return elem.scrollTop + elem.offsetHeight > elem.scrollHeight - 50;
		};
		
		var isScrollTopNearTop = function(elem) {
			return elem.scrollTop < 50;
		};
		
		var convertDateToUTC = function(dateObj) { 
			return new Date(dateObj.getUTCFullYear(), dateObj.getUTCMonth(), dateObj.getUTCDate(), dateObj.getUTCHours(), dateObj.getUTCMinutes(), dateObj.getUTCSeconds()); 
		};
		
		var getLocalizedAndOffsetDateTime = function(dateObj) {
			if(typeof PCC === 'undefined' || !PCC.l10n || !PCC.l10n.dateTime) return dateObj.toISOString();
			return PCC.l10n.dateTime.toUserDateAndTime(dateObj.toMMDDYYYYString(), dateObj.getHours(), dateObj.getMinutes(), dateObj.getSeconds());
		};
		
		var formatToUserDate = function(dateObj) {
			if(typeof PCC === 'undefined' || !PCC.l10n || !PCC.l10n.dateTime) return dateObj.toMMDDYYYYString();
			return PCC.l10n.dateTime.iso8601DateToUserFormat(dateObj.toISOString());
		}
		
		var getMinutesAgo = function(dateObj, dateTimeString) {
			var seconds = Math.floor((Date.now() - dateObj) / 1000),
			interval;
			
			interval = Math.floor(seconds/3600);
			if (interval >= 1) {
				return dateTimeString;
			}
			
			interval = Math.floor(seconds/60);
			return _NS.moduleProps.termMap.minutesAgo.replace(/{{minutes}}/g, Math.max(1, interval));
		};
		
		var isElementInView = function (container, element, doPartial) {
			var contHeight = $(container).height();
			var contTop = $(container).scrollTop();
			var contBottom = contTop + contHeight ;
			
			var elemTop = $(element).offset().top - container.offset().top;
			var elemBottom = elemTop + $(element).height();
			
			var isTotal = (elemTop >= 0 && elemBottom <=contHeight);
			var isPartial = ((elemTop < 0 && elemBottom > 0 ) || (elemTop > 0 && elemTop <= container.height())) && doPartial;
			
			return  isTotal  || isPartial ;
		};
		
		var deepMergeObject = function(oldObj, newObj) {
			var retObj = $.extend(true, {}, oldObj);
			$.extend(true, retObj, newObj);
			return retObj;
		};
		
		return {
			convertDateToUTC: convertDateToUTC,
			debounce: debounce,
			deepMergeObject: deepMergeObject,
			getLocalizedAndOffsetDateTime: getLocalizedAndOffsetDateTime,
			formatToUserDate: formatToUserDate,
			getMinutesAgo: getMinutesAgo,
			isElementInView: isElementInView,
			isScrollTopNearBottom: isScrollTopNearBottom,
			isScrollTopNearTop: isScrollTopNearTop,
			throttle: throttle
		};
	})();
	
	_NS.MoreLessToggle = (function() {
		var _maxDescriptionHeight,
			_moreText,
			_lessText,
			_initialized = false;
		
		var init = function(maxDescriptionHeight, ellipsesText, moreText, lessText) {
			if (_initialized) return;
			_maxDescriptionHeight = typeof maxDescriptionHeight !== 'undefined' ? maxDescriptionHeight : 3;
			_moreText = typeof _moreText !== 'undefined' ? moreText : _NS.moduleProps.termMap.more;
			_lessText = typeof _lessText !== 'undefined' ? lessText : _NS.moduleProps.termMap.less;
			_initialized = true;
			applyToAll();
			_addHandlers();
		};
		
		var applyToAll = function() {
			$('.js-clinical-smart-alerts .js-more-less').each(function(index, elem){
				if(typeof $(elem).data('moreLessApplied') !== 'undefined') return;
				applyToElement($(elem));
			});
		};
		
		var applyToElement = function(jqElem) {
			var content = jqElem.html();
			var fullTextEl = jqElem.find('p:first-child');

			var lineHeight = parseInt(fullTextEl.css('line-height'));
			var height = fullTextEl.height();
			var lines = height/lineHeight;			

			if(lines <= _maxDescriptionHeight) {
				fullTextEl.addClass('c-non-more-less')
				return;
			}

			jqElem.addClass('c-more-less');

			var descriptionContents = jqElem.find('p:first-child').contents();
			var c;
			if(descriptionContents.length == 2) {
				// eInteract Alerts contain description header
				c = _NS.moduleProps.dynamicTags.eInteractHeadingTag.replace('%s', $(descriptionContents[0]).text()) + $(descriptionContents[1]).text();
			} else {
				c = jqElem.find('p:first-child').text()
			}

			var h = content,
			newHtml = [
				'<span class="c-more-less__truncated-text">',
				c,
				'</span>',
				'<span class="js-more-content c-more-less__content">',
				h,
				'</span>',
				'<div><a href="#_" class="js-more-less-btn c-more-less__btn">',
				_moreText,
				'</a></div>'
				].join('');
			
			jqElem
			.data('moreLessApplied', true)
			.html(newHtml);
		};
		
		var _addHandlers = function() {
			$(document).on('click.moreLess', '.js-clinical-smart-alerts .js-more-less-btn', function(e) {
				var moreLink = $(this),
				container = moreLink.closest('.js-more-less'),
				isHidden = !container.hasClass('c-more-less--is-active');
				
				moreLink.text(isHidden ? _lessText : _moreText);
				container.toggleClass('c-more-less--is-active');
				e.preventDefault();

				if(typeof(PccUserAnalytics) != 'undefined') { 
					var cardCat = container.closest(".c-card").find(".c-card__type").text();
					if(typeof(PccUsageAnalytics) != 'undefined'){
						PccUsageAnalytics.trackEvent('core-clinical-alerts-card', {'isHidden':isHidden, 'category':cardCat});
					}
				}
			});
		};
		
		return {
			init: init,
			applyToAll: applyToAll,
			applyToElement: applyToElement
		};
	})();
	
	_NS.ShowHideToggle = (function(){
		var _addHandlers = function(){
			$(document).on('click', '.js-clinical-smart-alerts .js-show-hide-toggle', function(e){
				$(this).closest('.js-show-hide').toggleClass('c-show-hide--is-active');
				if(!$(e.target).is('input')) e.preventDefault();
			});
		};
		
		return {
			init: function(){
				_addHandlers();
			}
		}
	}());
	
	_NS.AlertsLoader = function(store, loadAlertsEndpoint, checkAlertsEndpoint, showFilter) {
		this.store = store;
		this.ALERTS_PER_LOAD = 20;
		this.loadAlertsEndpoint = loadAlertsEndpoint;
		this.checkAlertsEndpoint = checkAlertsEndpoint;
		this.includeUnitsAndFloors = showFilter;
		
	};
	_NS.AlertsLoader.prototype = {
		checkForUnclearedAlerts: function() {
			var state = this.store.getState();
			var lastChecked = state.lastTimeHasAlertsChecked;
			var now = Date.now();
			var cachedAlerts = state.cachedHasAlerts;
			var cacheTimeout = state.cacheTimeout;
			var needToRefreshCache = lastChecked ? (now - lastChecked >= cacheTimeout) : true;
			var drawerOpen = state.drawer.isVisible;
			if (cacheTimeout === 0 || (drawerOpen === false && (needToRefreshCache && (!cachedAlerts || cachedAlerts.all === false))) ||
				(drawerOpen === true)) {
				$.getJSON(this.checkAlertsEndpoint, {
					clientId: _NS.moduleProps.clientId,
					unitId: (this.includeUnitsAndFloors === false || state.unitsAndFloors.unitSelected == null) ? null : state.unitsAndFloors.unitSelected.id,
					floorId: (this.includeUnitsAndFloors === false || state.unitsAndFloors.floorSelected == null) ? null : state.unitsAndFloors.floorSelected.id,
					categories: (state.categories.categoriesSelected == null) ? null : this._toArray(state.categories.categoriesSelected),
				})
				.done(function (data) {
					this.store.dispatch({
						type: 'UPDATE_HAS_UNCLEARED_ALERTS',
						payload: data
					});
					this.store.dispatch({
						type: 'UPDATE_DRAWER_ALERT_CHECK',
						payload : {
							date : now
						}
					});
				}.bind(this));
			} else {
				this.store.dispatch({
					type: 'UPDATE_HAS_UNCLEARED_ALERTS',
					payload: {
						hasNewAlerts : cachedAlerts.all,
						hasNewAlertsClientExcluded : cachedAlerts.excludeClient,
						hasNewAlertsClient : cachedAlerts.client
					}
				});
			}
		},

		_toArray : function(arr) {
			var retval = '';
			arr.forEach(function(elem, idx) {
				retval = retval + elem;
				if (idx < arr.length - 1) {
					retval = retval + ',';
				}
			});
			return retval;
		},
		
		loadAlerts: function() {
			var _self = this;
			var state = this.store.getState(),
			scrolledToAlert = state.alerts.scrolledToAlert,
			isGettingOlderAlerts = state.alerts.isGettingOlderAlerts,
			useCachedScrolledToAlert = state.alerts.doReplaceExistingAlerts === true &&
			(
					(scrolledToAlert.clientId === state.clientId && scrolledToAlert.tabType === 'client') ||
					(scrolledToAlert.tabType === 'all' && state.alerts.type === 'all')
			),
			alertId = null,
			alertType = null,
			module = null;
			
			if (isGettingOlderAlerts) {
				if (useCachedScrolledToAlert) {
					alertId = scrolledToAlert.alertId;
					alertType = scrolledToAlert.alertType;
					module = scrolledToAlert.module;					
				} else {
					var oldestPivotAlert = state.alerts.pivotAlerts.oldest;
					if (oldestPivotAlert.id && state.alerts.doReplaceExistingAlerts === false) {
						alertId = oldestPivotAlert.id;
						alertType = oldestPivotAlert.type;
						module = oldestPivotAlert.module;
					}
				}
			} else {
				var newestPivotAlert = state.alerts.pivotAlerts.newest;
				if (newestPivotAlert.id) {
					alertId = newestPivotAlert.id;
					alertType = newestPivotAlert.type;
					module = newestPivotAlert.module;
				}
			}
			
			$.getJSON(this.loadAlertsEndpoint, {
				alertId: alertId,
				alertType: alertType,
				module: module,
				getold: isGettingOlderAlerts,
				includePivotAlert: useCachedScrolledToAlert,
				clientId: state.alerts.type === 'all' ? null : _NS.moduleProps.clientId,
				unitId: (this.includeUnitsAndFloors === false  || state.unitsAndFloors.unitSelected == null || state.alerts.type === 'client') ? null : state.unitsAndFloors.unitSelected.id,
				floorId: (this.includeUnitsAndFloors === false  || state.unitsAndFloors.floorSelected == null  || state.alerts.type === 'client') ? null : state.unitsAndFloors.floorSelected.id,
				categories: (state.categories == null || state.categories.categoriesSelected == null || state.facId !== state.categories.facId) ? 'All' : _self._toArray(state.categories.categoriesSelected),
			}).done(function(data){
				var smartAlerts = data.smartAlertList && data.smartAlertList.length ? data.smartAlertList : null;
				this.store.dispatch({
					type: 'LOAD_ALERTS_COMPLETE',
					payload: {
						data: smartAlerts
					}
				});
				if (!isGettingOlderAlerts) {
					this.store.dispatch({ type: 'CLEAR_SCROLLED_TO_ALERT' });
				}
			}.bind(this))
			.fail(function(){
				this.store.dispatch({
					type: 'LOAD_ALERTS_FAILED'
				});
			}.bind(this));
		}
	};
	
	_NS.Carousel = function (element) {
	  this.element = element;
	  this.items = this.element.querySelectorAll(".js-carousel-item");
	  this.index = 0;
	  this._isMoving = false;
	  this.setHeight();
	}

	_NS.Carousel.prototype._addTranslateXToItems = function() {
	  var xPos = -this.index * 100;
	  this.items.forEach(function(item) {
		item.style.visibility = 'visible';
		item.style.height = 'auto';
		// IE is off a few per cent
	    item.style.msTransform = 'translateX(' + xPos + 4 + '%)';
	    item.style.transform = 'translateX(' + xPos + '%)';
	  });
	};
	
	_NS.Carousel.prototype._moveItems = function (isPrevious, callback) {
		if (this._isMoving) return;
		this._isMoving = true;
				
		var isPrevious = typeof isPrevious !== 'undefined' ? isPrevious : false,
			transitionEndEventName = _NS.Polyfill.tools.getTransitionEndEvent();
		
		this.element.style.height = this.items[this.index].scrollHeight + 'px';
				
		requestAnimationFrame(function () {
			this.index = isPrevious ? Math.max(this.index - 1, 0) : Math.min(this.index + 1, this.items.length - 1);
			
			this._addTranslateXToItems();
			this.element.style.height = this.items[this.index].scrollHeight + 'px';
			
			if(!transitionEndEventName) {
				this.setHeight();
				this._isMoving = false;
				setTimeout(function(){ if(callback && !this._isMoving) callback(); }, 250);
			}
						
			$(this.items[0]).one(transitionEndEventName, function(e){
				this.setHeight();
				this._isMoving = false;
				setTimeout(function(){ if(callback && !this._isMoving) callback(); }, 250);
			}.bind(this));
		}.bind(this));
	};

	_NS.Carousel.prototype.next = function (callback) {
		var callback = typeof callback !== 'undefined' ? callback : null;
		this._moveItems(false, callback);
	};

	_NS.Carousel.prototype.previous = function (callback) {
		var callback = typeof callback !== 'undefined' ? callback : null;
		this._moveItems(true, callback);
	};

	_NS.Carousel.prototype.setHeight = function () {
		this.items.forEach(function(item, index) {
			item.style.visibility = this.index === index ? 'visible' : 'hidden';
			item.style.height = this.index === index ? 'auto' : 0;
		}.bind(this));
		this.element.style.height = 'auto';
	};
}());
