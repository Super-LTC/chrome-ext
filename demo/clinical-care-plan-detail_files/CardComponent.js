'use strict';

(function(){
	window.clinicalSmartAlerts = window.clinicalSmartAlerts || {};
	var _NS = clinicalSmartAlerts;
		
	_NS.CardComponent = function(store, element, clearAlertCardCallback, dsiRootId, dsiFeedbackData) {
		this.smartAlertSaveActionVOFactory = _NS.SmartAlertSaveActionVOFactory;

		_NS.StatefulComponent.call(this, { store:store, selector: element.id });
		this.element = element;
		this._clearAlertCardCallback = clearAlertCardCallback;
		this._flipElement = $(this.element).find('.flipcard');
		this._graphElement = $(this.element).find('.trendgraph');
		this._tableElement = $(this.element).find('.js-alert-details-table');
		this._disabled = false;
		this._graphData = undefined;
		this._GRAPH_LOADER = 'js-graph-loader c-loader c-loader--center';
		this._dsiRootId = dsiRootId;
		this._dsiFeedbackData = dsiFeedbackData;
		this._renderedDSI = false;

		this._suggestionsSubComponent = new _NS.SuggestionsSubComponent(store, '#' + element.id + ' div.js-show-hide.js-card-expander.c-show-hide.c-card-expander', this);

		this._initHandlers();
		if (_NS.Cards) {
			_NS.Cards.set(this.element.id, this);
		}

		this._suggestionsSubComponent.toggleSaveCancelButtons(false);
	};

	_NS.CardComponent.prototype = Object.create(_NS.StatefulComponent.prototype);
	_NS.CardComponent.prototype.constructor = _NS.CardComponent;
	
	_NS.CardComponent.prototype._clearAlert = function(alertId, groupedAlertIds, alertType, module) {
		var _self = this;
		$.post('/clinical/alerts/smart/clearalert.xhtml', {
			alertId: alertId,
			alertType : alertType,
			groupedAlertIds : groupedAlertIds || '',
			module : module
			})
		.success(function(data, textStatus, jqXhr){
			_self._clearFromUI();
			_self.store.dispatch({
				type: 'CLEAR_COMPLETE',
				payload: {
					id: alertId,
					type: alertType,
				}
			});
		})
		.fail(function(data, textStatus, jqXhr) {
			//Todo: figure out what to do for failing situation
			_self.store.dispatch({
				type: 'CLEAR_COMPLETE',
				payload: {
					id: alertId,
					type: alertType,
				}
			});
		});
	};

	_NS.CardComponent.prototype._getGroupedAlertsDesc = function(element) {
		var _self = this,
			element = $(_self.element),
			groupedAlertIds = element.data("groupedAlertIds"),
			alertId = element.data('alertId'),
			alertType = element.data('alertType'),
			expander = element.find('#grouped-alerts-indicator'),
			groupedAlertDesc = element.find('.js-grouped-alerts-desc');

		function showError() {
			groupedAlertDesc.find('.alert-details-error-message-box').removeClass('u-hidden');
			expander.addClass('js-grouped-alert-has-error');
		}

		expander.prop('disabled', true)
		$.getJSON('/clinical/alerts/smart/getgroupalerts.xhtml', {
			groupedAlertIds: groupedAlertIds,
			alertType: alertType
		})
			.success(function (data) {
				_self._createGroupedAlertsDesc(data, element);
			})
			.fail(function (data) {
				showError();
			})
			.always(function (data){
				element.find('div.js-grouped-alerts-desc').removeClass('u-hidden');
				element.find('div.c-card__content').toggleClass('c-grouped-alert-is-expanded');

				_self.store.dispatch({
					type: 'GROUPED_ALERT_EXPANDED',
					payload: {
						alertId: alertId,
						alertType: alertType
					}
				});
				expander.prop('disabled', false)
			})
	};

	_NS.CardComponent.prototype._createGroupedAlertsDesc = function(data, element) {
		var _self = this,
			element = $(_self.element);

		var alertId = element.data('alertId'),
			alertType = element.data('alertType'),
			groupedAlertIds = element.data("groupedAlertIds");

		var groupedDescDiv = $(element.find('#grouped-alerts')),
			groupedDescIndicator = $(element.find('#grouped-alerts-indicator'));

		groupedDescDiv.attr('id', '#grouped-alerts-' + alertType + '-' + alertId);

		var alertDescTitle = $(document.createElement('div')),
			alertDateTitle = $(document.createElement('div')),
			alertTitle = $(document.createElement('div'));

		if(alertType === 'VITALEXCEPTION') {
			alertDescTitle.text(_NS.moduleProps.termMap.value);
		} else {
			alertDescTitle.text(_NS.moduleProps.termMap.alertsDescription);
		}
		alertDateTitle.text(_NS.moduleProps.termMap.effectiveDate);
		alertDateTitle.addClass('c-grouped-alert-date-title');
		alertDescTitle.addClass('c-grouped-alert-desc-title');
		alertTitle.append(alertDescTitle);
		alertTitle.append(alertDateTitle);
		alertTitle.addClass('c-grouped-alert');
		groupedDescDiv.append(alertTitle);

		for (var i = 0; i < data.length; i++) {
			var alertDesc = $(document.createElement('div')),
				alertDate = $(document.createElement('div')),
				alert = $(document.createElement('div'));


			if (typeof groupedAlertIds == 'number') {
				var groupAlertIdArray = [groupedAlertIds];
			}
			else {
				var groupAlertIdArray = groupedAlertIds.replace(/\s+/g, '').split(",");
			}

			alertDesc.text(data[i].description);
			alertDesc.attr('id', '#grouped-alerts-desc-' + alertType + '-' + groupAlertIdArray[i]);
			alertDesc.addClass('c-grouped-alert-desc');
			var effectiveDate = _NS.Utils.getLocalizedAndOffsetDateTime(new Date(data[i].effectiveTimeStamp));
			alertDate.text(effectiveDate);
			alertDate.attr('id', '#grouped-alerts-date-' + alertType + '-' + groupAlertIdArray[i]);
			alertDate.addClass('c-grouped-alert-date');
			alert.append(alertDesc);
			alert.append(alertDate);
			alert.addClass('c-grouped-alert');
			alert.attr('id', '#grouped-alerts-detail-' + alertType + '-' + groupAlertIdArray[i]);
			groupedDescIndicator.addClass('js-grouped-alert-loaded');
			groupedDescDiv.append(alert);
		}
	};

	_NS.CardComponent.prototype._getPnKey = function(alertType, wvType, pnId) {
		return _NS.AppStorage.PN_PREFIX + alertType + '#' + wvType + '#' + pnId;
	};

	_NS.CardComponent.prototype._putPnStructureInCache = function(alertType, wvType, pnId, data) {
		return _NS.AppStorage.set(this._getPnKey(alertType, wvType, pnId), data);
	};

	_NS.CardComponent.prototype._getPnStructureFromCache = function(alertType, wvType, pnId) {
		return _NS.AppStorage.get(this._getPnKey(alertType, wvType, pnId));
	};

	_NS.CardComponent.prototype._removePnStructureFromCache = function(alertType, wvType, pnId) {
		return _NS.AppStorage.remove(this._getPnKey(alertType, wvType, pnId));
	};

	_NS.CardComponent.prototype._initHandlers = function() {
		var _self = this;

		if (_NS.moduleProps.canAddPN) {
			var element = $(_self.element);
			element
				.on('click','.smart-alert-card-link,input[type=checkbox], .c-card-expander, .c-more-less__btn, .flipcard-chevron-container' , function(e) {
					// Save this as the "scrolled alert" when clicking link so we will keep the alert in view
					// Trick the code into thinking it is the same tab by setting
					// the appropriate tab type
					var clientId = element.data('clientId');
					var tabType = 'client';
					if (_NS.AppStorage.get(_NS.AppStorage.FORCE_ALL) === clientId)
						tabType = 'all';
					_self.store.dispatch({
						type: 'SAVE_SCROLLED_TO_ALERT',
						payload: {
							alertId: element.data('alertId'),
							alertType: element.data('alertType'),
							clientId: element.data('clientId'),
							createdTimestamp: element.data('createdTimestamp'),
							tabType : tabType,
						}
					});

					if($(this).hasClass('smart-alert-card-link')) {
						_self._recordSuggestionsEvent(element, this.text);
					}
				});
		}

		$(this.element)
			.on('click.clearAlert', '.js-alert-card-clear', function(e) {
				var element = $(_self.element);
				if(_self.store.getState().isLoading) return;
				_self._clearAlert(
						element.data('alertId'),
						element.data('groupedAlertIds'),
						element.data('alertType'),
						element.data('module')
				);				
				_self._recordCardEvent(element,'Clear');
			})
			.on('click.saveCardExpanderStatus', '.js-card-expander-toggle', function(e) {
				var element = $(_self.element);
				setTimeout(function(){

					if ($(this).closest('.js-show-hide').hasClass('c-show-hide--is-active')) {

						if (element.data('alertType') === "CLINICAL" || element.data('alertType') === "EINTERACT_CLINICAL") {
							if (!($(_self.element).attr('data-is-suggestions-retrieved') === 'true')) {
								_self._suggestionsSubComponent.addSuggestions();
							}
						}
						_self.store.dispatch({
							type: 'SAVE_ACTIVE_ALERT',
							payload: {
								alertId: element.data('alertId'),
								alertType: element.data('alertType'),
								isCardExpanded: true
							}
						});

						//log expand action

						$.post('/clinical/alerts/smart/logAlertViewed.xhtml', {
							alertId: element.data('alertId'),
							alertType: element.data('alertType'),
							clientId: element.data('clientId'),
							alertTitle: element.find(".c-card__type").text()
						})

						if (!_self._pendingPatientInfoData && element.data('alertType') === "PENDING_PATIENT") {
							_self._loadPendingPatientInfo(element.data('pendingPatientId'));
						}
						
						if (!_self._inboundAlertDetailsData && element.data('alertType') === "INBOUND_CLINICAL_DATA") {
							_self._loadInboundAlertDetails(element.data('groupedAlertIds'));
						}
						_self._renderDSIComponent();
					} else {

						_self.store.dispatch({ 
							type: 'CLEAR_ACTIVE_ALERT',
							payload: {
								alertId: element.data('alertId'),
								alertType: element.data('alertType')
							}
						});	
					}
				}.bind(this), 10);
				_self._recordCardEvent(element,'Expand');
			})
			.on('click.saveAlertDetailsExpanderStatus', '.js-alert-details-expander-toggle', function(e) {
				var element = $(_self.element);
				setTimeout(function(){
					if ($(this).closest('.js-show-hide').hasClass('c-show-hide--is-active')) {
						_self.store.dispatch({
							type: 'SAVE_ACTIVE_ALERT',
							payload: {
								alertId: element.data('alertId'),
								alertType: element.data('alertType'),
								isCardExpanded: true,
								isDetailsExpanded: true,
								isGraphShown: true // meaning chart is shown
							}
						});
						if (!_self._graphData) {
							_self._loadGraph();
						}
					} else {
						_self.store.dispatch({
							type: 'SAVE_ACTIVE_ALERT',
							payload: {
								alertId: element.data('alertId'),
								alertType: element.data('alertType'),
								isCardExpanded: true,
								isDetailsExpanded: false,
								isGraphShown : true
							}
						});
						_self.selectFlipCard(true);
						_self.store.dispatch({ type: 'LOAD_ALERT_GRAPH_COMPLETE'});
					}
				}.bind(this), 10);
				_self._recordCardEvent(element,'Alert Details');
			})
			.on('click.flipCard', '.flipcard-chevron-container', function() {
				var element = $(_self.element);
				var isGraphShown = element.find('.flipcard-side-front').hasClass('flipcard-is-active');
				_self._flipCards();
				setTimeout(function(){
					_self.store.dispatch({
						type: 'SAVE_ACTIVE_ALERT',
						payload: {
							alertId: element.data('alertId'),
							alertType: element.data('alertType'),
							isCardExpanded: true,
							isDetailsExpanded: true,
							isGraphShown: !isGraphShown
						}
					});
					if (!_self._graphData) {
						_self._loadGraph();
					}
				}.bind(this), 10);
				_self._recordCardEvent(element,'Alert List View');
				return false;
			})
			.on('click.deletePendingPatientsButton', '.js-delete-pending-patients-button', function() {
				var element = $(_self.element);
				_self._recordSuggestionsEvent(element, 'Delete Pending Patients');
			})
			.on('click.acceptPendingPatientsButton', '.js-accept-pending-patients-button', function() {
				var element = $(_self.element);
				_self._recordSuggestionsEvent(element, 'Accept Pending Patients');
			})
			.on('click.deleteYesPendingPatients', '.js-delete-yes-pending-patients', function() {
				var element = $(_self.element);
				_self._recordSuggestionsEvent(element, 'Delete Yes Pending Patients');
			})
			.on('click.deleteNoPendingPatients', '.js-delete-no-pending-patients', function() {
				var element = $(_self.element);
				_self._recordSuggestionsEvent(element, 'Delete No Pending Patients');
			})
			.on('click.expandGroupAlertsDesc', '.js-grouped-alerts-div', function() {
				var element = $(_self.element);
				if (!($(this).hasClass('js-grouped-alert-loaded') ^ $(this).hasClass('js-grouped-alert-has-error'))){ //XNOR
					_self._getGroupedAlertsDesc(element);
				}
				else {
					_self._showHideGroupedAlertDesc();
				}
			});
	};

	_NS.CardComponent.prototype._showHideGroupedAlertDesc = function() {
		var _self = this,
			element = $(_self.element);

		var groupedAlertDesc = element.find('div.js-grouped-alerts-desc'),
			groupedAlertIndicator = element.find('a.js-grouped-alerts-div');

		//If there is an error with the Ajax call
		if(groupedAlertIndicator.hasClass('js-grouped-alert-has-error')) {
			groupedAlertIndicator.removeClass('js-grouped-alert-has-error');
			groupedAlertDesc.find('.alert-details-error-message-box').addClass('u-hidden')
		}

		if(groupedAlertDesc.hasClass('u-hidden')) {
			groupedAlertDesc.removeClass('u-hidden');
		}
		else {
			groupedAlertDesc.addClass('u-hidden');
		}

		element.find('div.c-card__content').toggleClass('c-grouped-alert-is-expanded');

		_self.store.dispatch({
			type: 'GROUPED_ALERT_EXPANDED',
			payload: {
				alertId: element.data('alertId'),
				alertType: element.data('alertType'),
			}
		});
	};
	
	_NS.CardComponent.prototype._recordEvent = function(e, category, action) {
		var cardCat = e.find(".c-card__type").text();
		_NS.sendEventIfEnabled(category, action, cardCat);
	};

	_NS.CardComponent.prototype._recordCardEvent = function(e, action) {
		this._recordEvent(e,'Card', action);
	};

	_NS.CardComponent.prototype._recordSuggestionsEvent = function(e, action) {
		this._recordEvent(e,'Suggestions', action);
	};
	
	_NS.CardComponent.prototype._clearFromUI = function() {
		var card = this.element,
			alertId = $(card).data('alertId'),
			alertType = $(card).data('alertType'),
			transitionEndEventName = _NS.Polyfill.tools.getTransitionEndEvent();
		
		if($(card).data('disabled')) return;
		
		$(card)
			.data('disabled', true)
			.addClass('u-transition-scale-down-bounce');
		
		this._transitionHeightToZero();
		
		if (!transitionEndEventName){
			if (_NS.Cards) {
				_NS.Cards.delete(this.element.id);
			}
			$(card).remove();
			this._clearAlertCardCallback(alertId, alertType);
			return;
		}
		
		$(card).one(transitionEndEventName, function(e){
			if (_NS.Cards) {
				_NS.Cards.delete(this.element.id);
			}
			$(card).remove();
			this._clearAlertCardCallback(alertId, alertType);
		}.bind(this));
	};
	
	_NS.CardComponent.prototype._transitionHeightToZero = function() {
		var sectionHeight = this.element.scrollHeight;
		
		var elementTransition = this.element.style.transition;
		this.element.style.transition = '';

		requestAnimationFrame(function() {
			this.element.style.height = sectionHeight + 'px';
			this.element.style.transition = elementTransition;
			
			requestAnimationFrame(function() {
				this.element.style.height = 0 + 'px';
			}.bind(this));
    }.bind(this));
	};
	
	_NS.CardComponent.prototype.getAlertId = function() {
		return $(this.element).data('alertId');
	};
	
	_NS.CardComponent.prototype.getAlertType = function() {
		return $(this.element).data('alertType');
	};

	_NS.CardComponent.prototype.getClientId = function() {
		return $(this.element).data('clientId');
	};

	_NS.CardComponent.prototype._renderDSIComponent = function() {
		if (this._dsiFeedbackData && !this._renderedDSI && $(this.element).find('#' + this._dsiRootId).length > 0) {
			addDsiFeedback(this._dsiRootId, this._dsiFeedbackData);
			this._renderedDSI = true;
		}
	}

	_NS.CardComponent.prototype.expandCard = function() {
		var type = $(this.element).data('alertType')
		if ( type === "CLINICAL" || type === "EINTERACT_CLINICAL" ) {
			this._suggestionsSubComponent.addSuggestions();
		}
		this._renderDSIComponent();
		$(this.element).find('.js-card-expander').addClass('c-show-hide--is-active');
	};

	_NS.CardComponent.prototype.expandAlertDetails = function() {
		$(this.element).find('.js-alert-details-expander').addClass('c-show-hide--is-active');
		this._loadGraph();
	};
	
	

	_NS.CardComponent.prototype._disableInputsAndButtons = function(parentElement, focusedElement) {
		this._disabled = true;
		$(parentElement)
			.find('input').prop('disabled', true)
			.end()
			.find('textarea').prop('disabled', true)
			.end()
			.find('button').prop('disabled', true)
			.end()
			.find('select').prop('disabled', true)
			.end()
			.find('option').prop('disabled', true)
			.end()
			.find('.chzn-drop').hide()
			.end()
			.find('label.c-custom-checkbox')
			.removeClass('c-custom-checkbox')
			.addClass('c-custom-checkbox__disabled')
			.end();

		if(focusedElement) {
			$(focusedElement).addClass('c-button--has-loader');
		}
	};
	
  _NS.CardComponent.prototype.enableUnactionedInputsAndButtons = function(parentElement, focusedElement) {
  
    $(focusedElement).removeClass('c-button--has-loader');
    this._disabled = false;
    
    // don't enable already actioned items
    $(parentElement)
      .find('label.c-custom-checkbox__disabled:not([dontenable]):not([actioned])')
      .removeClass('c-custom-checkbox__disabled')
      .addClass('c-custom-checkbox')
      .end()
      .find('input').parent(':not([dontenable]):not([actioned])').find('input').prop('disabled', false);
    
    $(parentElement)
      .find('textarea').prop('disabled', false)
      .end()
      .find('button').prop('disabled', false)
      .end()
      .find('select').prop('disabled', false)
      .end()
      .find('option').prop('disabled', false)
      .end()
      .find('.chzn-drop').show()
      .end();
  };
	
	_NS.CardComponent.prototype.render = function() {};

	_NS.CardComponent.prototype._showGraphLoading = function() {
		this._flipElement.addClass(this._GRAPH_LOADER);
	};

	_NS.CardComponent.prototype._hideGraphLoading = function() {
		this._flipElement.removeClass(this._GRAPH_LOADER);
	};
	
	_NS.CardComponent.prototype._renderPendingPatientInfo = function(data) {
		this._pendingPatientInfoData = data;
		var element = $(this.element);
		var alertId = element.data('alertId');
		var alertType = element.data('alertType');
		var partialIdString = "#" + alertType + "-" + alertId + "-";
		var dob = _NS.Utils.formatToUserDate(new Date(data.dateOfBirth));
		
		element.find(partialIdString + "first-name").text(data.firstName);
		element.find(partialIdString + "middle-name").text(data.middleName);
		element.find(partialIdString + "surname").text(data.lastName);
		element.find(partialIdString + "gender").text(data.gender);
		element.find(partialIdString + "dob").text(dob);
		element.find(partialIdString + "ssn").text(data.socialBeneficiaryId);
		element.find(partialIdString + "medicare").text(data.medicareNum);
		element.find(partialIdString + "medicaid").text(data.medicaidNum);
	};
	
	_NS.CardComponent.prototype._renderInboundClinicalAlertDetails = function(data) {
		this._inboundAlertDetailsData = data;
		var element = $(this.element);
		for(var i = 0; i < data.length; i++) {
			element.find(".c-inbound-list").append("<p>" + data[i] + "</p>");
		}
	};
	
	_NS.CardComponent.prototype._deletePendingPatient = function() {
		var _self = this;
		var confirmationSection = $(_self.element).find('.pending-patient-delete-confirmation-section');
		var pendingPatientId = $(_self.element).data('pendingPatientId');
		var pendingPatientUrl = '/admin/client/pendingpatient.xhtml';
		confirmationSection.addClass('pccBusy');
		
		function showErrorMessage() {
			var errorElement = $(_self.element).find('.pending-patient-delete-alert-error-message-box');
			confirmationSection.removeClass('pccBusy');
	 		confirmationSection.find('.js-button-hide-delete-pending-patient-section').click();
			errorElement.fadeIn(200).delay(3000).fadeOut(200);  
		}
		
		if (pendingPatientId) {
			$.ajax({
		 		url: pendingPatientUrl + '?pendingPatientId=' + pendingPatientId,
		 		type: "DELETE",
		 		dataType: "json"
		 	}).done(function(result) {
				if ("0" === result.callStatus) {
					_self._clearFromUI();
					if (pendingPatientUrl.includes(location.pathname)) {
						location.reload();
					}
				} else {
					showErrorMessage();
				}
		 	}).fail(function(result) {
		 		showErrorMessage();
		 	});
		} else {
			showErrorMessage();
		}
	 };

	_NS.CardComponent.prototype._renderGraph = function(data) {
		this._graphData = data;
		var vitalType = $(this.element).data('vitalType'),
			chartOpts,
			baseLineOpts = [],
			localChartOpts = {},
			maxValue = -99999,
			minValue = 99999;

		if (vitalType >= 0 && vitalType < _NS.moduleProps.chartOpts.length) {
			localChartOpts = _NS.moduleProps.chartOpts[vitalType];
		}

		chartOpts = $.extend(true, {}, localChartOpts, _NS.moduleProps.defaultChartOpts);
		
		if (data.baseline) {
			baseLineOpts.push.apply(baseLineOpts, [{
			    value : data.baseline,
			    class: 'pccChartBaselineSystolic'}, 
				{ value : data.baseline, 
				text : vitalType === 3 ? _NS.moduleProps.termMap.systolicBaseline : _NS.moduleProps.termMap.baseline,
				position : 'start',
				class: 'pccChartBaselineSystolic',
			}]);
			maxValue = Math.max(maxValue, data.baseline);
			minValue = Math.min(minValue, data.baseline);
		}

		if (data.diastolicBaseline) { // Should only be true when vitalType === 3 (Blood Pressure)
			baseLineOpts.push.apply(baseLineOpts, [{
			    value : data.diastolicBaseline,
			    class: 'pccChartBaselineDiastolic'},
				{ value : data.diastolicBaseline,
				text : _NS.moduleProps.termMap.diastolicBaseline,
				position : 'start',
				class: 'pccChartBaselineDiastolic',
			}]);
			maxValue = Math.max(maxValue, data.diastolicBaseline);
			minValue = Math.min(minValue, data.diastolicBaseline);			
		}

		data.vitalList.forEach(function(elem) {
			chartOpts.data.columns[0].push(elem.value);
			maxValue = Math.max(maxValue, elem.value);
			minValue = Math.min(minValue, elem.value);
			if (vitalType === 3) {
				 // Blood pressure also has the diastolicValue
				chartOpts.data.columns[1].push(elem.diastolicValue);
				maxValue = Math.max(maxValue, elem.diastolicValue);
				minValue = Math.min(minValue, elem.diastolicValue);				
			}
		});

		chartOpts.axis.y = {
				min : minValue,
				max : maxValue,
		};

		if (!this._chart) {
			this._chart = this._graphElement.pccGenerateChart(chartOpts, _NS.moduleProps.termMap.trend, undefined, '');
			this._createTable(data, vitalType);
		}

		// Need to remove inline position style - it conflicts with the chart-flipping style
		$(this.element).find('.pccChartWrapper').css('position', '');

		this._chart.load({columns : chartOpts.data.columns});

		if (baseLineOpts.length > 0) {
			this._chart.ygrids(baseLineOpts);
		}

		// Wait until the chart gets fully rendered
		// to resize 
		var _self = this;
		setTimeout(function() {
			_self._resizeChart();
		}, 500);
	};

	_NS.CardComponent.prototype._createTable = function(data, vitalType) {
		var tableOptions = _NS.moduleProps.chartOpts[vitalType].data;
		var tableBody = $(this.element).find('.js-alert-details-table').find('tbody');
		var tableHeaderRow = document.createElement('tr');

		tableHeaderRow.appendChild(document.createElement('th')); // Empty Header
		for(var i = 0; i < tableOptions.columns.length; i++) {
			var headerColumn = document.createElement('th');
			headerColumn.textContent = tableOptions.columns[i][0];
			tableHeaderRow.appendChild(headerColumn);
		}
		for(var i = 0; i < data.vitalList.length && i < _NS.moduleProps.maxVitalsInChart; i++) {
			var row = document.createElement('tr');
			var rowDate = document.createElement('td');
			var rowDateValue = new Date(data.vitalList[i].date);
			var minutes = (rowDateValue.getMinutes() < 10) ? '0' + rowDateValue.getMinutes() : rowDateValue.getMinutes();
			rowDate.textContent = _NS.moduleProps.months[rowDateValue.getMonth()] + ' ' + rowDateValue.getDate() + ' ' + rowDateValue.getHours() + ':' + minutes;
			row.appendChild(rowDate);

			for(var j = 0; j < tableOptions.columns.length; j++) {
				// Blood Pressure/Respiration/Pain Level is integer, everything else is float
				var rowVitalData = (_NS.moduleProps.chartOpts[vitalType].isInteger === true) ? parseInt(data.vitalList[i][tableOptions.columnKeys[j]], 10) : data.vitalList[i][tableOptions.columnKeys[j]];

				var tempColumn = document.createElement('td');

				if(data.vitalList[i].exceptionDescriptors != null && 0 < data.vitalList[i].exceptionDescriptors.length) {
					if(_NS.moduleProps.chartOpts[vitalType].data.columnKeys.indexOf(tableOptions.columnKeys[j]) >= 0)
					{

						// special logic for Blood Pressure
						if((vitalType === 3 && this._isValidBloodPressureException(data.vitalList[i], tableOptions.columnKeys[j]))
							|| vitalType !== 3
						)
						{
							$(tempColumn).addClass('has-error');
							var warningImage = document.createElement('img');
							$(warningImage).attr('src', '/images/clinical/wv_warning.png');
							tempColumn.appendChild(warningImage);

							var warningLabel = document.createElement('div');
							warningLabel.textContent = rowVitalData;
							$(tempColumn).prepend(warningLabel);
						}
						else {
							tempColumn.textContent = rowVitalData;
						}
					}
					else {
						tempColumn.textContent = rowVitalData;
					}
				} else {
					tempColumn.textContent = rowVitalData;
				}				
				row.appendChild(tempColumn);
			}
			
			if(i % 2 === 0) {
				$(row).addClass('highlighted-row');
			}
			tableBody.prepend(row);
		}
		tableBody.prepend(tableHeaderRow);
	};

	_NS.CardComponent.prototype._isValidBloodPressureException = function(vitalException, columnKey) {
		return this._isSystolic(vitalException) && columnKey === _NS.moduleProps.chartOpts[3].data.columnKeys[0]
			|| this._isDiastolic(vitalException) && columnKey === _NS.moduleProps.chartOpts[3].data.columnKeys[1];
	};

	_NS.CardComponent.prototype._isSystolic = function(vital) {
		for(var i = 0; i < vital.exceptionDescriptors.length; i++) {
			if(vital.exceptionDescriptors[i].stdVitalsId === '3' && (vital.exceptionDescriptors[i].itemType === 'H' || vital.exceptionDescriptors[i].itemType === 'L')) {
				return true;
			}
		}
		return false;
	};

	_NS.CardComponent.prototype._isDiastolic = function(vital) {
		for(var i = 0; i < vital.exceptionDescriptors.length; i++) {
			if(vital.exceptionDescriptors[i].stdVitalsId === '4' || vital.exceptionDescriptors[i].itemType === 'P') {
				return true;
			}
		}
		return false;
	};
	
	_NS.CardComponent.prototype._loadPendingPatientInfo = function(pendingPatientId) {
		var _self = this;
		var element = $(_self.element);
		var userInfo = element.find('.pending-patient-user-info-section');
		userInfo.addClass('pccBusy');
		
		function showError() {
			var parentElementId = '#js-csa-alert-card-details-PENDING_PATIENT-' + element.data('alertId');
			var childErrorElementClass = '.alert-details-error-message-box';
			element.find(parentElementId + '>' + childErrorElementClass).show();
			userInfo.find('table').hide();
			userInfo.removeClass('pccBusy');
		}
		
		$.getJSON('/admin/client/getpendingpatient.xhtml?pendingPatientId=' + pendingPatientId)
		.done(function (data) {
			if (data) {
				_self._renderPendingPatientInfo(data);
				userInfo.removeClass('pccBusy');
			} else {
				showError()
			}
		})
		.fail(function (data) {
			showError()
		});
	};
	
	_NS.CardComponent.prototype._loadInboundAlertDetails = function(groupedAlertIds) {
		var _self = this;
		var element = $(_self.element);
		var inboundDetailElement = element.find('.c-inbound-list');
		inboundDetailElement.addClass('pccBusy');
		
		function showError() {
			var parentElementId = '#js-csa-alert-card-details-INBOUND_CLINICAL_DATA-' + element.data('alertId');
			var childErrorElementClass = '.alert-details-error-message-box';
			element.find(parentElementId + '>' + childErrorElementClass).show();
			inboundDetailElement.removeClass('pccBusy');
		}
		
		$.getJSON('/clinical/inbound/alertdetails.xhtml?alertIds=' + groupedAlertIds)
		.done(function (data) {
			_self._renderInboundClinicalAlertDetails(data);
			inboundDetailElement.removeClass('pccBusy');
		})
		.fail(function (data) {
			showError()
		});
	}

	_NS.CardComponent.prototype._loadGraph = function() {
		var _self = this;
		var element = $(_self.element);
		var vitalType = element.data('vitalType');

		// vitalType of -1 indicates it's not vital alert
		if(vitalType >= 0) {
			element.find('.flipcard-container').removeClass('c-hidden');
			_self._showGraphLoading();
			// Cannot dispatch an event here because
			// We will cause an infinite loop when restore
			// alert status expanded state
			$.getJSON('/clinical/alerts/smart/getwvhistory.xhtml', {
				clientId : element.data('clientId'),
				wvType : vitalType
			})
			.done(function (data) {
				_self._hideGraphLoading();
				_self._renderGraph(data);
				_self.store.dispatch({ type: 'LOAD_ALERT_GRAPH_COMPLETE'});
			})
			.fail(function (data) {
				_self._hideGraphLoading();
				_self.store.dispatch({ type: 'LOAD_ALERT_GRAPH_COMPLETE'});
			});
		}
	};
	
	_NS.CardComponent.prototype._resizeChart = function() {
		this._chart.resize({ height: _NS.moduleProps.defaultChartOpts.size.height});
	};

	_NS.CardComponent.prototype._flipCards = function() {
		var _self = this;
		var container = $(this.element).find('.flipcard');
		var sides = container.find('.flipcard-side');
		var chartWrapper = $(this.element).find('.pccChartWrapper');
		var svg = chartWrapper.find('svg');

		container.toggleClass('flipcard-is-switched');

		window.setTimeout(function() {
			sides.toggleClass('flipcard-is-active');
			// Trigger the back-side of the card to not
			// display so the card doesn't show through on IE 11
			// I do it roughly 1/2 way through the rotation.
			sides.toggleClass('c-hidden');
		}, 200);

		window.setTimeout(function() {
			if (chartWrapper.width() > 0 && chartWrapper.width() !== svg.width()) {
				// IE doesn't compute the SVG chart width correctly and makes
				// it too big, overflowing the boundary. Force the width to its
				// parent. Make sure we check the size after the card has fully
				// animated into view.
				svg.width(chartWrapper.width());
				_self._resizeChart();
			}
		}, 501);
	};

	_NS.CardComponent.prototype.selectFlipCard = function(isFrontShown) {
		var container = $(this.element).find('.flipcard');
		var front = container.find('.flipcard-side-front');
		var back = container.find('.flipcard-side-back');
		var temp;

		if (isFrontShown === false) {
			// The code below makes the front card show
			// if we flip front and back then it will make the back show
			temp = front;
			front = back;
			back = temp;
		}

		front.removeClass('c-hidden');
		// Reset the cards to be showing the correct side
		if (isFrontShown === true)
			container.removeClass('flipcard-is-switched');
		else if (!container.hasClass('flipcard-is-switched'))
			container.addClass('flipcard-is-switched');

		if (!front.hasClass('flipcard-is-active'))
			front.addClass('flipcard-is-active');

		back.removeClass('flipcard-is-active');

		if (!back.hasClass('c-hidden'))
			back.addClass('c-hidden');
	};

	_NS.CardComponent.prototype.getChart = function() {
		return this._chart;
	};
}());
