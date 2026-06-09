'use strict';

(function(){
	window.clinicalSmartAlerts = window.clinicalSmartAlerts || {};
	var _NS = clinicalSmartAlerts;
		
	_NS.RootReducer = function() {
		var reducer = {};
		reducer.reduce = function(prevState, action) {

		prevState = typeof prevState !== 'undefined' ? prevState : _NS.getInitialState();
		
		switch (action.type) {
			case 'UPDATE_HAS_UNCLEARED_ALERTS':
				var newState = _NS.Utils.deepMergeObject(prevState, {
					hasNewAlerts: {
						all: action.payload.hasNewAlerts,
						excludeClient: action.payload.hasNewAlertsClientExcluded,
						client: action.payload.hasNewAlertsClient
					},
				});
				return newState;
			
			case 'DISMISS_HAS_UNCLEARED_ALERTS':
				var newState = _NS.Utils.deepMergeObject(prevState, {
					hasNewAlerts: {
						all: false,
						client: false,
						excludeClient: null,
					},
				});
				return newState;
				
			case 'TOGGLE_IS_DRAWER_VISIBLE':
				var newState = _NS.Utils.deepMergeObject(prevState, {
					hasNewAlerts: {
						all: false,
						client: false,
						excludeClient: null,
					},
					drawer: {
						isTransitionEnabled: true,
						isVisible:action.payload.isDrawerVisible
					},
				});
				_NS.AppStorage.set(_NS.AppStorage.IS_DRAWER_VISIBLE, action.payload.isDrawerVisible);
				return newState;
			
			case 'TOGGLE_IS_DRAWER_TRANSITION_ENABLED':
				var newState = _NS.Utils.deepMergeObject(prevState, {
					drawer: {
						isTransitionEnabled: action.payload.isDrawerTransitionEnabled
					}
				});
				return newState;

			case 'TOGGLE_IS_FILTER_EXPANDED':
				var newState = _NS.Utils.deepMergeObject(prevState, {
					drawer: {
						isFilterExpanded: action.payload.isFilterExpanded
					}
				});
				_NS.AppStorage.set(_NS.AppStorage.IS_FILTER_EXPANDED, action.payload.isFilterExpanded);
				return newState;

			case 'CHANGE_ALERT_TYPE':
				var newState = _NS.Utils.deepMergeObject(prevState, {
					alerts: {
						type: action.payload.alertType
					},
                    hasNewAlerts: {
                        all: false,
                        client: false,
                        excludeClient: null,
                    },
				});
				if (_NS.moduleProps.clientId && newState.alerts.type === 'all') {
					_NS.AppStorage.set(_NS.AppStorage.FORCE_ALL, _NS.moduleProps.clientId);
				} else {
					_NS.AppStorage.remove(_NS.AppStorage.FORCE_ALL);
				}
				return newState;
				
			case 'UPDATE_FILTER_DATA':
				var newState = _NS.Utils.deepMergeObject(prevState, {
					unitsAndFloors: {
						unitSelected: null,
						floorSelected: null,
						data: action.payload
					},
				});
				_NS.AppStorage.set(_NS.AppStorage.UNITS_AND_FLOORS_DATA, JSON.stringify(action.payload));
				return newState;

			case 'UPDATE_CATEGORY_FILTER_DATA':
				var newState = _NS.Utils.deepMergeObject(prevState, {
					categories: {
						categoriesSelected: null,
						data: action.payload,
						facId: prevState.facId
					},
				});
				_NS.AppStorage.set(_NS.AppStorage.CATEGORY_FILTER_DATA, JSON.stringify(action.payload));
				_NS.AppStorage.set(_NS.AppStorage.CATEGORY_FILTER_FACID, prevState.facId);
				return newState;
				
			case 'CLEAR_FILTER_DATA':
				var newState = _NS.Utils.deepMergeObject(prevState, {
					unitsAndFloors: {
						unitSelected: null,
						floorSelected: null,
						data: null
					}
				});
				_NS.AppStorage.remove(_NS.AppStorage.UNITS_AND_FLOORS_DATA);
				_NS.AppStorage.remove(_NS.AppStorage.UNIT_SELECTED);
				_NS.AppStorage.remove(_NS.AppStorage.FLOOR_SELECTED);
				return newState;

			case 'CLEAR_CATEGORY_FILTER_DATA':
				var newState = _NS.Utils.deepMergeObject(prevState, {
					categories: {
						categoriesSelected: null,
						facId: null,
						data: null
					}
				});
				_NS.AppStorage.remove(_NS.AppStorage.CATEGORIES_SELECTED);
				_NS.AppStorage.remove(_NS.AppStorage.CATEGORY_FILTER_DATA);
				_NS.AppStorage.remove(_NS.AppStorage.CATEGORY_FILTER_FACID);
				return newState;

			case 'UPDATE_FILTER_DROPDOWN':
				var type = action.payload.type,
					obj = {};

				if (action.payload.id) {
					obj[type + 'Selected'] = { id: action.payload.id, label: action.payload.label };
				} else {
					obj[type + 'Selected'] = null;
				}

				var newState = _NS.Utils.deepMergeObject(prevState, {
					unitsAndFloors: obj
				});

				if (obj[type + 'Selected']) {
					_NS.AppStorage.set(_NS.AppStorage[type.toUpperCase() + '_SELECTED'], JSON.stringify(obj[type + 'Selected']));
				} else {
					_NS.AppStorage.remove(_NS.AppStorage[type.toUpperCase() + '_SELECTED']);
				}
				return newState;

			case 'UPDATE_CATEGORY_FILTER_DROPDOWN':
				var newState = _NS.Utils.deepMergeObject(prevState, {
					categories: {
						categoriesSelected: action.payload.data,
					},
				});
				newState.categories.categoriesSelected=JSON.parse(JSON.stringify(action.payload.data));
				_NS.AppStorage.set(_NS.AppStorage.CATEGORIES_SELECTED, JSON.stringify(action.payload.data));
				return newState;

			case 'LOAD_ALERTS_INITIALIZE':
				var newState = _NS.Utils.deepMergeObject(prevState, {
					alerts: {
						isGettingOlderAlerts: action.payload.isGettingOlderAlerts,
						doReplaceExistingAlerts: action.payload.doReplaceExistingAlerts,
					},
					isFirstPageLoad: false,
					isLoading: true
				});
				return newState;
			
			case 'LOAD_ALERTS_COMPLETE':
				var newState = $.extend(true, {}, prevState),
					prevExistingAlerts = $.extend(true, [], prevState.alerts.existingAlerts),
					prevIsGettingOlderAlerts = prevState.alerts.isGettingOlderAlerts,
					existingAlerts,
					newestAlertId = null,
					newestAlertType = null,
					oldestAlertId = null,
					oldestAlertType = null;
				
				newState.alerts.existingAlerts = newState.alerts.lastLoadedAlerts = null;
				
				if (prevState.alerts.doReplaceExistingAlerts === false) {
					if (prevIsGettingOlderAlerts) {
						existingAlerts = prevExistingAlerts && action.payload.data ? prevExistingAlerts.concat(action.payload.data) : (action.payload.data ? action.payload.data : prevExistingAlerts);
					} else {
						existingAlerts = prevExistingAlerts && action.payload.data ? action.payload.data.concat(prevExistingAlerts) : (action.payload.data ? action.payload.data : prevExistingAlerts);
					}
				} else {
					existingAlerts = action.payload.data;
				}
				
				if (existingAlerts && existingAlerts.length) {
					newestAlertId = existingAlerts[0].alertId;
					newestAlertType = existingAlerts[0].alertType;
					oldestAlertId = existingAlerts[existingAlerts.length-1].alertId;					
					oldestAlertType = existingAlerts[existingAlerts.length-1].alertType;					
				}
				
				$.extend(true, newState, {
					alerts: {
						doUpdateUI: true,
						existingAlerts: existingAlerts,
						lastLoadedAlerts: action.payload.data,
						pivotAlerts: {
							newest: {
								id: newestAlertId,
								type: newestAlertType
							},
							oldest: {
								id: oldestAlertId,
								type: oldestAlertType
							}
						}
					},
					isLoading: false,
				});
				return newState;
			
			case 'LOAD_ALERTS_FAILED':
				var newState = _NS.Utils.deepMergeObject(prevState, {
					alerts: {
						doUpdateUI: true
					},
					isLoading: false,
				});
				return newState;
			
			case 'ALERTS_UPDATE_UI_COMPLETE':
				var newState = _NS.Utils.deepMergeObject(prevState, {
					alerts: {
						doReplaceExistingAlerts: false,
						doUpdateUI: false,
						isGettingOlderAlerts: null
					},
				});
				return newState;
			
			case 'SAVE_SCROLLED_TO_ALERT':
				var tabType = action.payload.tabType ? action.payload.tabType : prevState.alerts.type;
				var newState = _NS.Utils.deepMergeObject(prevState, {
					alerts: {
						scrolledToAlert: {
							alertId: action.payload.alertId,
							alertType: action.payload.alertType,
							module: action.payload.module,
							clientId: action.payload.clientId,
							createdTimestamp: action.payload.createdTimestamp,
							tabType: tabType,
						}
					}
				});
				_NS.AppStorage.set(_NS.AppStorage.SCROLLED_TO_ALERT_ID, action.payload.alertId);
				_NS.AppStorage.set(_NS.AppStorage.SCROLLED_TO_ALERT_TYPE, action.payload.alertType);
				_NS.AppStorage.set(_NS.AppStorage.SCROLLED_TO_ALERT_CLIENT_ID, action.payload.clientId);
				_NS.AppStorage.set(_NS.AppStorage.SCROLLED_TO_ALERT_CREATED_TIMESTAMP, action.payload.createdTimestamp);
				_NS.AppStorage.set(_NS.AppStorage.SCROLLED_TO_ALERT_TAB_TYPE, tabType);
				
				return newState;
			
			case 'CLEAR_SCROLLED_TO_ALERT':
				var newState = _NS.Utils.deepMergeObject(prevState, {
					alerts: {
						scrolledToAlert: {
							alertId: null,
							alertType: null,
							module: null,
							clientId: null,
							createdTimestamp: null,
							tabType: null
						}
					},
					isFirstPageLoad: false,
				});
				_NS.AppStorage.remove(_NS.AppStorage.SCROLLED_TO_ALERT_TAB_TYPE);
				_NS.AppStorage.remove(_NS.AppStorage.SCROLLED_TO_ALERT_CLIENT_ID);
				_NS.AppStorage.remove(_NS.AppStorage.SCROLLED_TO_ALERT_MODULE);
				_NS.AppStorage.remove(_NS.AppStorage.SCROLLED_TO_ALERT_CREATED_TIMESTAMP);
				_NS.AppStorage.remove(_NS.AppStorage.SCROLLED_TO_ALERT_TYPE);
				_NS.AppStorage.remove(_NS.AppStorage.SCROLLED_TO_ALERT_ID);

				return newState;

			case 'REMOVE_FROM_EXISTING_ALERTS':
				var newState = $.extend(true, {}, prevState),
					prevExistingAlerts = $.extend(true, [], prevState.alerts.existingAlerts),
					existingAlerts,
					newestAlertId = null,
					newestAlertType = null,
					oldestAlertId = null,
					oldestAlertType = null;
			
				newState.alerts.existingAlerts = null;
				
				existingAlerts = $.grep(prevExistingAlerts, function(alert){
					return alert.alertId === action.payload.alertId && alert.alertType === action.payload.alertType;
				}, true);
				
				if (existingAlerts && existingAlerts.length) {
					newestAlertId = existingAlerts[0].alertId;
					newestAlertType = existingAlerts[0].alertType;
					oldestAlertId = existingAlerts[existingAlerts.length-1].alertId;					
					oldestAlertType = existingAlerts[existingAlerts.length-1].alertType;					
				}
				
				$.extend(true, newState, {
					alerts: {
						existingAlerts: existingAlerts,
						pivotAlerts: {
							newest: {
								id: newestAlertId,
								type: newestAlertType
							},
							oldest: {
								id: oldestAlertId,
								type: oldestAlertType
							}
						}
					},
				});
				return newState;
			
			case 'SAVE_ACTIVE_ALERT':
				var newState = $.extend(true, {}, prevState),
					prevActiveAlerts = $.extend(true, [], prevState.alerts.activeAlerts),
					activeAlerts;
				
				activeAlerts = $.grep(prevActiveAlerts, function(alert){
					return alert.alertId === action.payload.alertId && alert.alertType === action.payload.alertType;
				}, true);
				
				activeAlerts.push({
					alertId: action.payload.alertId,
					alertType: action.payload.alertType,
					isCardExpanded: action.payload.isCardExpanded,
					isDetailsExpanded: action.payload.hasOwnProperty('isDetailsExpanded') ? action.payload.isDetailsExpanded : false,
					isGraphShown: action.payload.isGraphShown
				});
								
				newState.alerts.activeAlerts = activeAlerts;
				
				_NS.AppStorage.set(_NS.AppStorage.ACTIVE_ALERTS, JSON.stringify(newState.alerts.activeAlerts));
				return newState;

			case 'CLEAR_ACTIVE_ALERT':
				var newState = $.extend(true, {}, prevState),
					prevActiveAlerts = $.extend(true, [], prevState.alerts.activeAlerts),
					activeAlerts;
						
				activeAlerts = $.grep(prevActiveAlerts, function(alert){
					return alert.alertId === action.payload.alertId && alert.alertType === action.payload.alertType;
				}, true);
				
				newState.alerts.activeAlerts = activeAlerts;
				
				_NS.AppStorage.set(_NS.AppStorage.ACTIVE_ALERTS, JSON.stringify(newState.alerts.activeAlerts));
				return newState;
				
			case 'CLEAR_ALL_ACTIVE_ALERTS':
				var newState = $.extend(true, {}, prevState);
				newState.alerts.activeAlerts = null;
				
				_NS.AppStorage.remove(_NS.AppStorage.ACTIVE_ALERTS);
				return newState;

			case 'SET_EXISTING_ALERTS_TO_LAST_LOADED_ALERTS':
				var newState = $.extend(true, {}, prevState),
			        lastLoadedAlerts = $.extend(true, [], prevState.alerts.lastLoadedAlerts),
			        newestAlertId = null,
			        newestAlertType = null,
			        oldestAlertId = null,
			        oldestAlertType = null;

				newState.alerts.existingAlerts = null;

				if (lastLoadedAlerts && lastLoadedAlerts.length) {
			        newestAlertId = lastLoadedAlerts[0].alertId;
			        newestAlertType = lastLoadedAlerts[0].alertType;
			        oldestAlertId = lastLoadedAlerts[lastLoadedAlerts.length-1].alertId;
			        oldestAlertType = lastLoadedAlerts[lastLoadedAlerts.length-1].alertType;
				}

				$.extend(true, newState, {
			        alerts: {
		                doReplaceExistingAlerts: true,
		                doUpdateUI: true,
		                existingAlerts: lastLoadedAlerts,
		                pivotAlerts: {
	                        newest: {
	                                id: newestAlertId,
	                                type: newestAlertType
	                        },
	                        oldest: {
	                                id: oldestAlertId,
	                                type: oldestAlertType
	                        }
		                }
			        },
				});
				return newState;
			
			case 'CLEAR_PIVOT_ALERTS':
				var newState = _NS.Utils.deepMergeObject(prevState, {
					alerts: {
						pivotAlerts: {
	                        newest: {
                                id: null,
                                type: null
	                        },
	                        oldest: {
                                id: null,
                                type: null
	                        }
		                }
					},
				});
				return newState;

			case 'LOAD_ALERT_GRAPH_COMPLETE':
				return prevState;

			case 'UPDATE_DRAWER_ALERT_CHECK':
				var newState = _NS.Utils.deepMergeObject(prevState, {
					lastTimeHasAlertsChecked : action.payload.date
				});
				_NS.AppStorage.set(_NS.AppStorage.HAS_ALL_ALERTS, JSON.stringify(newState.hasNewAlerts));
				if (newState.lastTimeHasAlertsChecked)
					_NS.AppStorage.set(_NS.AppStorage.LAST_TIME_HAS_ALERTS_CHECKED, newState.lastTimeHasAlertsChecked);
				else
					_NS.AppStorage.remove(_NS.AppStorage.LAST_TIME_HAS_ALERTS_CHECKED);
				return newState;

			default:
				return prevState;
		}
	};

	reducer.dispatchComplete = function(prevState, action) {
		// Used by QTF to know when an event is complete
		prevState = typeof prevState !== 'undefined' ? prevState : _NS.getInitialState();
		switch (action.type) {
		case 'UPDATE_HAS_UNCLEARED_ALERTS':
			var newState = _NS.Utils.deepMergeObject(prevState, {
				qtfState : {
					bellNotifications : prevState.qtfState.bellNotifications + 1,
				},
			});
			return newState;
		
		case 'TOGGLE_IS_DRAWER_VISIBLE':
			var newState = _NS.Utils.deepMergeObject(prevState, {
				qtfState : {
					drawerOpen :  prevState.qtfState.drawerOpen + 1,
				},
			});
			return newState;

		case 'UPDATE_FILTER_DATA':
			var newState = _NS.Utils.deepMergeObject(prevState, {
				qtfState : {
					filtersUpdated : prevState.qtfState.filtersUpdated + 1,
				},
			});
			return newState;

			case 'UPDATE_CATEGORY_FILTER_DATA':
				var newState = _NS.Utils.deepMergeObject(prevState, {
					qtfState : {
						filtersUpdated : prevState.qtfState.filtersUpdated + 1,
					},
				});
				return newState;

		case 'LOAD_ALERTS_COMPLETE':
			var newState = _NS.Utils.deepMergeObject(prevState, {
				qtfState : {
					alertsLoaded : prevState.qtfState.alertsLoaded + 1,
				},
			});
			return newState;

		case 'LOAD_ALERTS_FAILED':
			var newState = _NS.Utils.deepMergeObject(prevState, {
				qtfState : {
					alertsLoaded : prevState.qtfState.alertsLoaded + 1,
				},
			});
			return newState;

		case 'ALERTS_UPDATE_UI_COMPLETE':
			var newState = _NS.Utils.deepMergeObject(prevState, {
				qtfState : {
					uiComplete : prevState.qtfState.uiComplete + 1,
				},
			});
			return newState;

		case 'REMOVE_FROM_EXISTING_ALERTS':
			var newState = _NS.Utils.deepMergeObject(prevState, {
				qtfState : {
					alertRemoved : prevState.qtfState.alertRemoved + 1,
				},
			});
			return newState;
		case 'DISMISS_HAS_UNCLEARED_ALERTS':
			var newState = _NS.Utils.deepMergeObject(prevState, {
				qtfState : {
					dismissAlerts : prevState.qtfState.dismissAlerts + 1,
				},
			});
			return newState;

		case 'CREATE_PROGRESS_NOTE_COMPLETE':
			var newState = _NS.Utils.deepMergeObject(prevState, {
				qtfState : {
					createProgressNote : prevState.qtfState.createProgressNote + 1,
				},
			});
			return newState;

			case 'GROUPED_ALERT_EXPANDED':
				var newState = _NS.Utils.deepMergeObject(prevState, {
					qtfState : {
						groupedAlertOpened : prevState.qtfState.groupedAlertOpened + 1,
					},
				});
				return newState;

		case 'SAVE_ACTIVE_ALERT':
		case 'CLEAR_ACTIVE_ALERT':
			var newState = _NS.Utils.deepMergeObject(prevState, {
				qtfState : {
					detailsExpanded : prevState.qtfState.detailsExpanded + 1,
				},
			});
			return newState;

		case 'CLEAR_COMPLETE':
			var newState = _NS.Utils.deepMergeObject(prevState, {
				qtfState : {
					alertCleared : prevState.qtfState.alertCleared + 1,
				},
			});
			return newState;

		case 'LOAD_ALERT_GRAPH_COMPLETE':
			var newState = _NS.Utils.deepMergeObject(prevState, {
				qtfState : {
					graphRendered : prevState.qtfState.graphRendered + 1,
				},
			});
			return newState;
			
    case 'FETCH_SUGGESTIONS_COMPLETE':
      var newState = _NS.Utils.deepMergeObject(prevState, {
        qtfState : {
          suggestionsFetched : prevState.qtfState.suggestionsFetched + 1,
        },
      });
      return newState;

		default:
			return prevState;
		}
	};
		
	return reducer;
  };
}());