'use strict';

(function(){
	window.clinicalSmartAlerts = window.clinicalSmartAlerts || {};
	var _NS = clinicalSmartAlerts;

	_NS.Cards = undefined;

	_NS.App = (function() {
		var defaultOptions={
				cssClassNotificationToggleHasAlerts:'c-notification-toggle--has-alerts',
				loadAlertsEndpoint:'/clinical/alerts/smart/getsmartalerts.xhtml',
				checkAlertsEndpoint:'/clinical/alerts/smart/checkunclearedalerts.xhtml',
				showFilter: true,
				mainHeaderSelector:'#mainPageHeader',
		}
		
		var _store,
			_alertsLoader,
			_options=defaultOptions;
		
		var _initStore = function() {
			_store = new _NS.Store(new _NS.RootReducer(), _NS.getInitialState());
		};
		
		var _initComponents = function() {

			_alertsLoader = new _NS.AlertsLoader(_store, _options.loadAlertsEndpoint, _options.checkAlertsEndpoint, _options.showFilter);

			var drawer = new _NS.DrawerComponent(_store, '.js-clinical-smart-alerts .js-drawer',_options.mainHeaderSelector );
			var panel = new _NS.PanelComponent(_store, '.js-clinical-smart-alerts .js-panel', _alertsLoader);
			var notificationToggle = new _NS.NotificationToggleComponent(_store, '.js-clinical-smart-alerts .js-notification-toggle', panel, _options.cssClassNotificationToggleHasAlerts);
			var filters = new _NS.FilterComponent(_store, '.js-clinical-smart-alerts .js-filters ', panel, _alertsLoader, _options.showFilter);

			_NS.MoreLessToggle.init(3);
			_NS.ShowHideToggle.init();
			
			if (typeof Map != 'undefined') {
				_NS.Cards = new Map();
			}
			notificationToggle.render();
			drawer.render();
			panel.render();
			filters.render();
		};
		
		var _initEventHandlers = function() {
			$(document).on('webapp/user/logout', function(e){
				_resetAppStorage();
			});
		};
				
		var _resetAppStorage = function() {
			_NS.AppStorage.remove(_NS.AppStorage.IS_DRAWER_VISIBLE);
            _NS.AppStorage.remove(_NS.AppStorage.IS_FILTER_EXPANDED);
			_NS.AppStorage.remove(_NS.AppStorage.UNITS_AND_FLOORS_DATA);
			_NS.AppStorage.remove(_NS.AppStorage.UNIT_SELECTED);
			_NS.AppStorage.remove(_NS.AppStorage.FLOOR_SELECTED);
			_NS.AppStorage.remove(_NS.AppStorage.CATEGORY_FILTER_DATA);
			_NS.AppStorage.remove(_NS.AppStorage.CATEGORY_FILTER_FACID);
            _NS.AppStorage.remove(_NS.AppStorage.CATEGORIES_SELECTED);
			_NS.AppStorage.remove(_NS.AppStorage.FORCE_ALL);
			_NS.AppStorage.remove(_NS.AppStorage.SCROLLED_TO_ALERT_TAB_TYPE);
			_NS.AppStorage.remove(_NS.AppStorage.SCROLLED_TO_ALERT_CLIENT_ID);
			_NS.AppStorage.remove(_NS.AppStorage.SCROLLED_TO_ALERT_CREATED_TIMESTAMP);
			_NS.AppStorage.remove(_NS.AppStorage.SCROLLED_TO_ALERT_TYPE);
			_NS.AppStorage.remove(_NS.AppStorage.SCROLLED_TO_ALERT_ID);
			_NS.AppStorage.remove(_NS.AppStorage.SCROLLED_TO_ALERT_MODULE);
			_NS.AppStorage.remove(_NS.AppStorage.ACTIVE_ALERTS);
			_NS.AppStorage.remove(_NS.AppStorage.HAS_ALL_ALERTS);
			_NS.AppStorage.remove(_NS.AppStorage.LAST_TIME_HAS_ALERTS_CHECKED);
			_NS.AppStorage.removeByPrefix(_NS.AppStorage.PN_PREFIX);
		};

		return {
			init: function(options){
				//_options={...defaultOptions, ...options}  // it doesn't work on IE 10,11
				$.extend(_options, options)
				_NS.Polyfill.init();
				_initStore();
				_initComponents();
				_initEventHandlers();
				_alertsLoader.checkForUnclearedAlerts(_options.checkAlertEndpoint);
			},
			getState : function() {
				return _store.getState();
			}
		};
	}());
}());
