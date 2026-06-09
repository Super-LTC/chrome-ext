'use strict';

(function(){
	window.clinicalSmartAlerts = window.clinicalSmartAlerts || {};
	var _NS = clinicalSmartAlerts;

	_NS.FilterComponent = function(store, selector, panel, alertsLoader, showUnitsAndFloors) {
		_NS.StatefulComponent.call(this, { store:store, selector: selector });
		this.unitsFilter = null;
		this.floorsFilter = null;
		this.categoriesFilter = null;
		this._showUnitAndFloorsFilter = showUnitsAndFloors;
		this._panel = panel;
		this._getData();
		this._getAdditionalFilterData();
		this._applyFilters = this._applyFilters.bind(this);
		this._initFilters = this._initFilters.bind(this);
		this._onScroll = this._onScroll.bind(this);
		this._onScrollEnd = this._onScrollEnd.bind(this);
		this._initCategoryFilter = this._initCategoryFilter.bind(this);
		this._initHandlers();
		this._alertsLoader = alertsLoader;
	};

	_NS.FilterComponent.prototype = Object.create(_NS.StatefulComponent.prototype);
	_NS.FilterComponent.prototype.constructor = _NS.FilterComponent;

	_NS.FilterComponent.prototype._initHandlers = function() {
		var _self = this;
		var element = $(_self.element);
		element.on('click', '.js-filter-apply', function(e) {
			_self._applyFilters();
			_self._filterIcon();
		});
		
		$('#smartalerts-filter-toggle').on('click', function(e) {
			var CLASS_HIDDEN = 'u-hidden';

			if($('#smart-alert-filter').hasClass(CLASS_HIDDEN)) {
				_self.expandPanel();
			}
			else {
				_self.collapsePanel(_self.store);
			}
		}
		);


		// delegate scrolling to parent panel by faking out mouse wheel events
		element.on('mousewheel', this._onScroll)
			.on('mousewheel', this._onScrollEnd);

		// Firefox does not have mousewheel but DOMMouseScroll
		element.on('DOMMouseScroll', this._onScroll)
			.on('DOMMouseScroll', this._onScrollEnd);
	};

	_NS.FilterComponent.prototype._onScroll = function(e) {
		if (this.categoriesFilter.isMSFilterExpanded() === true){
			return;
		}
        e.preventDefault();
	};

	_NS.FilterComponent.prototype._onScrollEnd = function(e) {
        if (this.categoriesFilter.isMSFilterExpanded() !== true) {
            e.preventDefault();
        }
	};


	_NS.FilterComponent.prototype._getData = function() {
		var state = this.store.getState(),
			data = state.unitsAndFloors.data;
		if (!data || data.facId !== state.facId) {
			this.store.dispatch({
				type: 'CLEAR_FILTER_DATA'
			});
			
			$.getJSON('/clinical/alerts/smart/getunitsandfloors.xhtml')
				.done(function(data) {
					this.store.dispatch({
						type: 'UPDATE_FILTER_DATA',
						payload: data
					});
				}.bind(this));
		}
	};

	_NS.FilterComponent.prototype._filterIcon = function() {
		var state = this.store.getState(),
			unitSelected = state.unitsAndFloors.unitSelected,
			floorSelected = state.unitsAndFloors.floorSelected,
			categoriesSelected = state.categories.categoriesSelected;

		if ((categoriesSelected == null || (categoriesSelected.length === 1 && categoriesSelected[0] === "All"))
			&& (this._showUnitAndFloorsFilter === false  || (unitSelected == null && floorSelected == null))) {
			$("#smartalerts-filter-toggle").attr("src", "/images/smartalert/smartalert_filter_opener.svg");
		}
		else {
			$("#smartalerts-filter-toggle").attr("src", "/images/smartalert/smartalert_filter_applied.svg");
		}
	};

	_NS.FilterComponent.prototype._getAdditionalFilterData = function() {
		var state = this.store.getState(),
			data = state.categories.data;

		if (!data ||  state.categories.facId !== state.facId) {
			this.store.dispatch({
				type: 'CLEAR_CATEGORY_FILTER_DATA'
			});

			$.getJSON('/clinical/alerts/smart/getPermittedCategories.xhtml')
				.done(function(data) {
					this.store.dispatch({
						type: 'UPDATE_CATEGORY_FILTER_DATA',
						payload: data
					});
				}.bind(this));
		}
	};

	_NS.FilterComponent.prototype._initFilters = function() {
		var state = this.store.getState(),
			unitAndFloorsData = state.unitsAndFloors.data;
		if (unitAndFloorsData.sessionDefaultUnitDesc != null) {
			this.unitsFilter.setValue(unitAndFloorsData.sessionDefaultUnitId, unitAndFloorsData.sessionDefaultUnitDesc);
			this.store.dispatch({
				type: 'UPDATE_FILTER_DROPDOWN',
				payload: {
					type: 'unit',
					id: unitAndFloorsData.sessionDefaultUnitId,
					label: unitAndFloorsData.sessionDefaultUnitDesc
				}
			});
		} else {
			this.store.dispatch({
				type: 'UPDATE_FILTER_DROPDOWN',
				payload: {
					type: 'unit',
				}
			});
			this.unitsFilter.reset();
		}

		if (unitAndFloorsData.sessionDefaultFloorDesc != null) {
			this.floorsFilter.setValue(unitAndFloorsData.sessionDefaultFloorId, unitAndFloorsData.sessionDefaultFloorDesc);
			this.store.dispatch({
				type: 'UPDATE_FILTER_DROPDOWN',
				payload: {
					type: 'floor',
					id: unitAndFloorsData.sessionDefaultFloorId,
					label: unitAndFloorsData.sessionDefaultFloorDesc
				}
			});
		} else {
			this.store.dispatch({
				type: 'UPDATE_FILTER_DROPDOWN',
				payload: {
					type: 'floor',
				}
			});
			this.floorsFilter.reset();
		}
	}

	_NS.FilterComponent.prototype._initCategoryFilter = function() {
		var state = this.store.getState(),
		categoriesData = state.categories.data;
		this.categoriesFilter.selectValues(categoriesData);
		this.store.dispatch({
			type: 'UPDATE_CATEGORY_FILTER_DROPDOWN',
			payload : {
				data : this.categoriesFilter.getValue()
			}
		});
	}

	_NS.FilterComponent.prototype._applyFilters = function () {
		this.store.dispatch({
			type: 'UPDATE_FILTER_DROPDOWN',
			payload: {
				type: 'unit',
				id: this.unitsFilter.getValue().id,
				label: this.unitsFilter.getValue().label
			}
		});

		this.store.dispatch({
			type: 'UPDATE_FILTER_DROPDOWN',
			payload: {
				type: 'floor',
				id: this.floorsFilter.getValue().id,
				label: this.floorsFilter.getValue().label
			}
		});

		this.store.dispatch({
			type: 'UPDATE_CATEGORY_FILTER_DROPDOWN',
			payload : {
				data: this.categoriesFilter.getValue()

			}
		});

		this.store.dispatch({ type: 'CLEAR_SCROLLED_TO_ALERT' });
		this.store.dispatch({ type: 'CLEAR_ALL_ACTIVE_ALERTS' });
		this.store.dispatch({
			type: 'LOAD_ALERTS_INITIALIZE',
			payload: {
				doReplaceExistingAlerts: true,
				isGettingOlderAlerts: true
			}
		});
		this._alertsLoader.loadAlerts();

		_NS.sendEventIfEnabled('Filter', 'Apply Filter');
	};

	_NS.FilterComponent.prototype.collapsePanel = function (store) {
		$('#smart-alert-filter-label').hide();
		$('#smart-alert-filter').addClass('u-hidden');
		if (store.getState().drawer.isFilterExpanded === true) {
			store.dispatch({
				type: 'TOGGLE_IS_FILTER_EXPANDED',
				payload: {
					isFilterExpanded: false
				}
			});
		}

	};

	_NS.FilterComponent.prototype.expandPanel = function () {
		var state = this.store.getState(),
		CLASS_HIDDEN = 'u-hidden',
		CLASS_DISPLAY_NONE = 'u-display-none';

		if (this._showUnitAndFloorsFilter === false || state.alerts.type === 'client') {
			$(this.unitsFilter.element).addClass(CLASS_HIDDEN);
			$(this.floorsFilter.element).addClass(CLASS_HIDDEN);
			$('.j-unitfloor-label').addClass(CLASS_HIDDEN)
			$('.js-unit-and-floor-filter').addClass(CLASS_DISPLAY_NONE)
		}
		else {
			$(this.unitsFilter.element).removeClass(CLASS_HIDDEN);
			$(this.floorsFilter.element).removeClass(CLASS_HIDDEN);
            $('.j-unitfloor-label').removeClass(CLASS_HIDDEN)
			$('.js-unit-and-floor-filter').removeClass(CLASS_DISPLAY_NONE)
		}
		$('#smart-alert-filter-label').show();
		$(this.element).removeClass(CLASS_HIDDEN);
		if (this.store.getState().drawer.isFilterExpanded !== true) {
			this.store.dispatch({
				type: 'TOGGLE_IS_FILTER_EXPANDED',
				payload: {
					isFilterExpanded: true
				}
			});
		}

	};

	_NS.FilterComponent.prototype.render = function() {
		var state = this.store.getState(),
			obj = {},
			unitSelected = state.unitsAndFloors.unitSelected,
			floorSelected = state.unitsAndFloors.floorSelected,
			unitAndFloorsData = state.unitsAndFloors.data,
			categoriesData = state.categories.data,
			categoriesSelected = state.categories.categoriesSelected,
			CLASS_HIDDEN = 'u-hidden';

        if (!unitAndFloorsData || !categoriesData) {
            $(this.element).addClass(CLASS_HIDDEN);
            return;
        }

		if (state.isLoading  ) {
			$(this.element).on('click.stopPropagation', function(e){
				e.stopPropagation();
			});
		} else {
			$(this.element).off('click.stopPropagation');
		}

		if (state.facId !== unitAndFloorsData.facId || !this.unitsFilter || !this.floorsFilter) {
			this.unitsFilter = new _NS.DropdownComponent('.js-clinical-smart-alerts .js-dropdown-unit', unitAndFloorsData.units);
			this.floorsFilter = new _NS.DropdownComponent('.js-clinical-smart-alerts .js-dropdown-floor', unitAndFloorsData.floors);
			if(_NS.moduleProps.isNewLogin === true && (!unitSelected || !floorSelected)) {
				this._initFilters();
			}
			else {
				if (unitSelected) this.unitsFilter.setValue(unitSelected.id, unitSelected.label);
				if (floorSelected) this.floorsFilter.setValue(floorSelected.id, floorSelected.label);
			}
		}

		if (!this.categoriesFilter) {
			this.categoriesFilter = new _NS.MultiSelectFilterDropdownComponent('.js-clinical-smart-alerts .js-dropdown-category', categoriesData);
			if(_NS.moduleProps.isNewLogin === true && !categoriesSelected) {
				this._initCategoryFilter();
			}
			else {
				if (categoriesSelected) {
					this.categoriesFilter.selectValues(categoriesSelected);
				} else if(categoriesSelected === null) {
					//should technically never get here.
					this.categoriesFilter.selectValues(categoriesData);
				}

			}
		}

		if (state.drawer.isFilterExpanded === true) {
			this.expandPanel();
		}
		
        this._filterIcon();
	};

}());