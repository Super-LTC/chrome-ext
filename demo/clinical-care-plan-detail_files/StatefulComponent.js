'use strict';

(function(){
	window.clinicalSmartAlerts = window.clinicalSmartAlerts || {};
	var _NS = clinicalSmartAlerts;

	_NS.StatefulComponent = function(props) {
		this.render = this.render.bind(this) || function() {}.bind(this);
	
		if (props.hasOwnProperty('store')) {
			this.store = props.store;
			this.store.subscribe(this.render);
		}
	
		if (props.hasOwnProperty('selector')) {
			this.selector = props.selector;
			this.element = document.querySelector(props.selector);
		}
	};
}());