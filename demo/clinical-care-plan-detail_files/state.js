'use strict';

(function(){
	window.clinicalSmartAlerts = window.clinicalSmartAlerts || {};
	var _NS = clinicalSmartAlerts;
	
	_NS.getInitialState = function(){
		return ({
			alerts: {
				activeAlerts: _NS.AppStorage.get(_NS.AppStorage.ACTIVE_ALERTS) ? JSON.parse(_NS.AppStorage.get(_NS.AppStorage.ACTIVE_ALERTS)) : null,
				doReplaceExistingAlerts: false,
				doUpdateUI: false,
				existingAlerts: null,
				isGettingOlderAlerts: null,
				lastLoadedAlerts: null,
				pivotAlerts: {
					newest: {
						id: null,
						type: null,
						module: null
					},
					oldest: {
						id: null,
						type: null,
						module: null
					}
				},
				scrolledToAlert: {
					clientId: _NS.AppStorage.get(_NS.AppStorage.SCROLLED_TO_ALERT_CLIENT_ID) ? _NS.AppStorage.get(_NS.AppStorage.SCROLLED_TO_ALERT_CLIENT_ID) : null,
					createdTimestamp: _NS.AppStorage.get(_NS.AppStorage.SCROLLED_TO_ALERT_CREATED_TIMESTAMP) ? _NS.AppStorage.get(_NS.AppStorage.SCROLLED_TO_ALERT_CREATED_TIMESTAMP) : null,
					tabType: _NS.AppStorage.get(_NS.AppStorage.SCROLLED_TO_ALERT_TAB_TYPE) ? _NS.AppStorage.get(_NS.AppStorage.SCROLLED_TO_ALERT_TAB_TYPE) : null,
					alertType: _NS.AppStorage.get(_NS.AppStorage.SCROLLED_TO_ALERT_TYPE) ? _NS.AppStorage.get(_NS.AppStorage.SCROLLED_TO_ALERT_TYPE) : null,
					alertId: _NS.AppStorage.get(_NS.AppStorage.SCROLLED_TO_ALERT_ID) ? _NS.AppStorage.get(_NS.AppStorage.SCROLLED_TO_ALERT_ID) : null,
					module: _NS.AppStorage.get(_NS.AppStorage.SCROLLED_TO_ALERT_MODULE) ? _NS.AppStorage.get(_NS.AppStorage.SCROLLED_TO_ALERT_MODULE) : null
				},
				type: (!_NS.moduleProps.clientId || _NS.AppStorage.get(_NS.AppStorage.FORCE_ALL) === _NS.moduleProps.clientId) ? 'all' : 'client'
			},
			clientId: _NS.moduleProps.clientId ? _NS.moduleProps.clientId : null,
			drawer: {
				isTransitionEnabled: false,
				isVisible: _NS.AppStorage.get(_NS.AppStorage.IS_DRAWER_VISIBLE) == 'true' ? true : false,
				isFilterExpanded: _NS.AppStorage.get(_NS.AppStorage.IS_FILTER_EXPANDED) == 'true' ? true : false
			},
			facId: _NS.moduleProps.facId ? _NS.moduleProps.facId : null,
			hasNewAlerts: {
				all: false,
				client: false,
				excludeClient: false
			},
			isFirstPageLoad: true,
			isLoading: false,
			unitsAndFloors: {
				unitSelected: _NS.AppStorage.get(_NS.AppStorage.UNIT_SELECTED) ? JSON.parse(_NS.AppStorage.get(_NS.AppStorage.UNIT_SELECTED)) : null,
				floorSelected: _NS.AppStorage.get(_NS.AppStorage.FLOOR_SELECTED) ? JSON.parse(_NS.AppStorage.get(_NS.AppStorage.FLOOR_SELECTED)) : null,
				data: _NS.AppStorage.get(_NS.AppStorage.UNITS_AND_FLOORS_DATA) ? JSON.parse(_NS.AppStorage.get(_NS.AppStorage.UNITS_AND_FLOORS_DATA)) : null
			},
			categories : {
				categoriesSelected: _NS.AppStorage.get(_NS.AppStorage.CATEGORIES_SELECTED) ? JSON.parse(_NS.AppStorage.get(_NS.AppStorage.CATEGORIES_SELECTED)) : null,
				data:  _NS.AppStorage.get(_NS.AppStorage.CATEGORY_FILTER_DATA) ? JSON.parse(_NS.AppStorage.get(_NS.AppStorage.CATEGORY_FILTER_DATA)) : null,
				facId: _NS.AppStorage.get(_NS.AppStorage.CATEGORY_FILTER_FACID) ? JSON.parse(_NS.AppStorage.get(_NS.AppStorage.CATEGORY_FILTER_FACID)) : null,
			},
			qtfState : {
				bellNotifications: 0,
				drawerOpen: 0,
				alertsLoaded: 0,
				filtersUpdated : 0,
				uiComplete : 0,
				alertRemoved : 0,
				dismissAlerts : 0,
				createProgressNote : 0,
				detailsExpanded : 0,
				alertCleared : 0,
				graphRendered : 0,
				suggestionsFetched: 0,
				groupedAlertOpened: 0
			},
			cacheTimeout : _NS.AppStorage.get(_NS.AppStorage.CACHE_TIMEOUT) ? parseInt(_NS.AppStorage.get(_NS.AppStorage.CACHE_TIMEOUT), 10) * 3  : 900000,
			cachedHasAlerts : _NS.AppStorage.get(_NS.AppStorage.HAS_ALL_ALERTS) ? JSON.parse(_NS.AppStorage.get(_NS.AppStorage.HAS_ALL_ALERTS)) : null,
			lastTimeHasAlertsChecked : _NS.AppStorage.get(_NS.AppStorage.LAST_TIME_HAS_ALERTS_CHECKED),
		});
	};
}());
