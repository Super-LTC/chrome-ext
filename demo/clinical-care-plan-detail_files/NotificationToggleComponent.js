'use strict';

(function(){
	window.clinicalSmartAlerts = window.clinicalSmartAlerts || {};
	var _NS = clinicalSmartAlerts;

	_NS.NotificationToggleComponent = function(store, selector, panel, cssClass) {
		_NS.StatefulComponent.call(this, { store:store, selector: selector });
		this._panel = panel;
		this._initHandlers();
		this._cssClass=cssClass;
	};
	_NS.NotificationToggleComponent.prototype = Object.create(_NS.StatefulComponent.prototype);
	_NS.NotificationToggleComponent.prototype.constructor = _NS.NotificationToggleComponent;
	_NS.NotificationToggleComponent.prototype._initHandlers = function(){
		$(document).on('click', this.selector, function(e) {
			this.store.dispatch({
				type: 'TOGGLE_IS_DRAWER_VISIBLE',
				payload: {
					isDrawerVisible: !this.store.getState().drawer.isVisible
				}
			});
			if (this.store.getState().drawer.isVisible) {
				this.store.dispatch({
					type: 'UPDATE_DRAWER_ALERT_CHECK',
					payload: {
						date: Date.now()
					}
				});
			}

			if (this.store.getState().drawer.isVisible === true) {
				// Update the last seen date so we don't see the dot on the bell again
				this._panel.updateLastDrawerTime();
			}
		}.bind(this));
	};
	_NS.NotificationToggleComponent.prototype.render = function() {
		var state = this.store.getState();
		if (state.hasNewAlerts.all && state.drawer.isVisible === false) {
			$(this.element).addClass(this._cssClass);
		} else {
			$(this.element).removeClass(this._cssClass);
		}
	};
}());