'use strict';

(function(){
	window.clinicalSmartAlerts = window.clinicalSmartAlerts || {};
	var _NS = clinicalSmartAlerts;

  const calculateDrawerTop = function (mainHeader) {
    let additionalVerticalOffset = 0;
    if(mainHeader.classList.contains('emarHeader')){
      additionalVerticalOffset = 12; // extra spacing for eMAR header (to match core bottom margin)
    }
    // mainHeader might be wrapped in a header element
    let drawerContainer = mainHeader;
    if (mainHeader.parentElement.tagName === 'HEADER') {
      drawerContainer = mainHeader.parentElement;
    }
    // take into account the margins of the drawer container
    const style = window.getComputedStyle(drawerContainer);
    const navbarVerticalMargins = (parseInt(style.marginTop) + parseInt(style.marginBottom));
    return drawerContainer.offsetTop + additionalVerticalOffset + drawerContainer.offsetHeight + navbarVerticalMargins - window.pageYOffset;
  };

	_NS.DrawerComponent = function(store, selector, mainHeaderSelector) {
		_NS.StatefulComponent.call(this, { store:store, selector: selector });
		this._mainHeader = document.querySelector(mainHeaderSelector);
		this._setHeightDebounced = this._setHeightDebounced.bind(this);
	};
	_NS.DrawerComponent.prototype = Object.create(_NS.StatefulComponent.prototype);
	_NS.DrawerComponent.prototype.constructor = _NS.DrawerComponent;
	_NS.DrawerComponent.prototype._setHeightDebounced = _NS.Utils.debounce(function() {
		if (!this.store.getState().drawer.isTransitionEnabled) {
			this.store.dispatch({
				type: 'TOGGLE_IS_DRAWER_TRANSITION_ENABLED',
				payload: {
					isDrawerTransitionEnabled: true
				}
			});
		}
		if (window.pageYOffset < this._mainHeader.offsetHeight) {
			const posY = calculateDrawerTop(this._mainHeader);
			this.element.style.top = posY + 'px';
			this.element.style.height = window.innerHeight - posY + 'px';
		} else {
			this.element.style.top = 0;
			this.element.style.height = '100%';
		}
	}, 150);
	_NS.DrawerComponent.prototype.render = function() {
		var jqElem = $(this.element),
			state = this.store.getState(),
			CLASS_HIDDEN = 'c-drawer--is-hidden',
			CLASS_IE_HIDDEN = 'c-filter--ie-hidden',
			CLASS_NO_TRANSITION = 'u-no-transition',
			tabs = jqElem.find("ul.js-tabs"),
			filterPanel = jqElem.find("div.js-filters");

		if (jqElem.hasClass(CLASS_NO_TRANSITION) && state.drawer.isTransitionEnabled) jqElem.removeClass(CLASS_NO_TRANSITION);

		if (state.drawer.isVisible === true) {
			jqElem.removeClass(CLASS_HIDDEN);
			tabs.removeClass(CLASS_IE_HIDDEN);
			filterPanel.removeClass(CLASS_IE_HIDDEN);
			window.addEventListener('load', this._setHeightDebounced, false);
			window.addEventListener('scroll', this._setHeightDebounced, false);
			window.addEventListener('resize', this._setHeightDebounced, false);

			if(typeof(PccUsageAnalytics) != 'undefined'){
				var view = 'Alerts ' + (state.alerts.type === 'all' ? 'All' : 'Resident');
				PccUsageAnalytics.trackEvent('clinical-smart-alerts-drawer', {'view': view});
			}
		} else {
			jqElem.addClass(CLASS_HIDDEN);

			// Only add the IE hidden class if the tabs element is in the fixed position. Child elements require css transition/transform to be
			// applied explicitly. However, if the element is position relative, including a css transition/transform on a child element will result
			// in undesirable behavior. As this element will switch between position fixed and relative, we need to handle both cases.
			if (tabs.hasClass("c-tabs--is-sticky")) {
				tabs.addClass(CLASS_IE_HIDDEN);
				filterPanel.addClass(CLASS_IE_HIDDEN);
			}

			window.addEventListener('load', this._setHeightDebounced, false);
			window.removeEventListener('scroll', this._setHeightDebounced, false);
			window.removeEventListener('resize', this._setHeightDebounced, false);
		}
	};

	_NS.sendEventIfEnabled = function(category, action, label) {
		if(typeof(PccUsageAnalytics) != 'undefined'){
			PccUsageAnalytics.trackEvent('core-clinical-alerts', {'category':category, 'action':action, 'label':label});
		}
	}
}());