'use strict';

(function () {
    window.clinicalSmartAlerts = window.clinicalSmartAlerts || {};
    var _NS = clinicalSmartAlerts;

    _NS.PanelComponent = function (store, selector, alertsLoader) {

        _NS.StatefulComponent.call(this, {store: store, selector: selector});

        this._alertsLoader = alertsLoader;
        this._bubble = $('#new-alert-bubble').hide();
        this._cardTemplate = document.querySelector('#tmpl-csa-alert-card');

        this._isNewAlertsBubbleClicked = false;
        this._isLoadAlertsOnScrollDisabled = false;

        this._stickyHeader = this.element.querySelector('.js-sticky-header');
        this._stickyHeaderOffsetTop = this._stickyHeader.offsetTop;

        this._stickyFilter = this.element.querySelector('.js-sticky-filter');

        this._tabSelector = '.js-tab';
        this._loaderSelector = '.js-loader';
        this._contentSelector = '.js-panel-content';
        this._alertsContainerSelector = '.js-panel-alerts';

        this._alertTypes = {
            'CLINICAL': _NS.moduleProps.termMap.clinicalAlert,
            'HIGHRISK': _NS.moduleProps.termMap.highRiskAlert,
            'EINTERACT_HIGHRISK': _NS.moduleProps.termMap.highRiskAlert,
            'EINTERACT_HIGHRISK_SIMPLE': _NS.moduleProps.termMap.highRiskAlert,
            'LOEBS_MAGEERS': _NS.moduleProps.termMap.clinicalAlert,
            'VITALEXCEPTION': _NS.moduleProps.termMap.vitalExceptionAlert,
            'ORDER': _NS.moduleProps.termMap.orderAlert,
            'ALERT': _NS.moduleProps.termMap.alert,
            'EINTERACT': _NS.moduleProps.termMap.eInteractAlert,
            'INBOUND_CLINICAL': _NS.moduleProps.termMap.inboundClinicalAlert,
            'PENDING_PATIENT': _NS.moduleProps.termMap.pendingPatient.replace(/\{0\}/g, _NS.moduleProps.termMap.clientTerm)
        };

        this._vitalTypes = {
            1: _NS.moduleProps.vitalMap.weights,
            2: _NS.moduleProps.vitalMap.respiration,
            3: _NS.moduleProps.vitalMap.bloodPressure,
            5: _NS.moduleProps.vitalMap.temperature,
            6: _NS.moduleProps.vitalMap.pulse,
            7: _NS.moduleProps.vitalMap.bloodSugar,
            8: _NS.moduleProps.vitalMap.heights,
            9: _NS.moduleProps.vitalMap.o2Sats,
            10: _NS.moduleProps.vitalMap.painLevel
        };

        this._lastScrollTop = this.element.scrollTop;
        this._onScroll = this._onScroll.bind(this);
        this._onScrollEnd = this._onScrollEnd.bind(this);
        this._dismissBubble = this._dismissBubble.bind(this);
        this._clearAlertCardCallback = this._clearAlertCardCallback.bind(this);
        this._enableBubble = this._enableBubble.bind(this);
        this._disableBubble = this._disableBubble.bind(this);
        this._initHandlers();
    };

    _NS.PanelComponent.SCROLL_THROTTLE = 100;

    _NS.PanelComponent.prototype = Object.create(_NS.StatefulComponent.prototype);
    _NS.PanelComponent.prototype.constructor = _NS.PanelComponent;
    _NS.PanelComponent.prototype._initHandlers = function () {
        var _self = this;
        $(this.element)
            .on('scroll', this._onScroll)
            .on('scroll', this._onScrollEnd);

        if (_NS.moduleProps.clientId) {
            $(this.element).on('click', this._tabSelector, function (e) {
                if (_self.store.getState().isLoading) return;

                _self.store.dispatch({
                    type: 'CHANGE_ALERT_TYPE',
                    payload: {
                        alertType: $(this).data('tabType')
                    }
                });

                _self.store.dispatch({
                    type: 'UPDATE_DRAWER_ALERT_CHECK',
                    payload: {
                        date: Date.now()
                    }
                });

                if ($(this).data('tabType') === 'all') {
                    _self.updateLastDrawerTime();
                }

                _self.store.dispatch({type: 'CLEAR_SCROLLED_TO_ALERT'});
                _NS.FilterComponent.prototype.collapsePanel(_self.store);
                _self._loadOlderAlertsAndReplace();

                if (typeof (PccUsageAnalytics) != 'undefined') {
                    var view = 'Alerts ' + (this.dataset.tabType === 'all' ? 'All' : 'Resident');
                    PccUsageAnalytics.trackEvent('clinical-smart-alerts-panel', {'view': view});
                }
            });
        }
    }

    _NS.PanelComponent.prototype._onScroll = _NS.Utils.throttle(function () {
        var currScrollTop = this.element.scrollTop,
            state = this.store.getState();

        if (currScrollTop > this._stickyHeaderOffsetTop) {
            $(this._stickyHeader).addClass('c-tabs--is-sticky');
            $(this._stickyFilter).addClass('c-filter-fixed-position');
            $(this._stickyFilter).addClass('u-mt-48');
        } else {
            $(this._stickyHeader).removeClass('c-tabs--is-sticky');
            $(this._stickyFilter).removeClass('c-filter-fixed-position');
            $(this._stickyFilter).removeClass('u-mt-48');
        }

        if (this._isLoadAlertsOnScrollDisabled === true) return;

        if (currScrollTop > this._lastScrollTop) {
            if (_NS.Utils.isScrollTopNearBottom(this.element) && !state.isLoading) {
                this._loadOlderAlerts();
            }
        } else {
            if (_NS.Utils.isScrollTopNearTop(this.element) && !state.isLoading) {
                this._loadNewerAlerts();
            }
        }
        this._lastScrollTop = Math.max(0, currScrollTop);
        // Hide the bubble if need be
        this._dismissBubble();
    }, _NS.PanelComponent.SCROLL_THROTTLE);

    _NS.PanelComponent.prototype._onScrollEnd = _NS.Utils.debounce(function () {
        this._saveFirstAlertCardInView();
    }, 250);

    _NS.PanelComponent.prototype._showLoader = function (classLoader, classNoAlerts) {
        if (this.element.querySelector(this._loaderSelector)) return;

        var jqLoader = $(document.createElement('div')).addClass(classLoader),
            jqAlertsContainer = $(this.element).find(this._alertsContainerSelector),
            state = this.store.getState();

        jqAlertsContainer.removeClass(classNoAlerts);
        if (!state.alerts.existingAlerts) jqAlertsContainer.empty();

        if (state.drawer.isFilterExpanded === true && (state.alerts.doReplaceExistingAlerts === true || state.alerts.isGettingOlderAlerts !== true)) {
            jqLoader.addClass('c-loader_filter_panel');
            jqLoader.insertBefore($('#apply_smartalerts_filter_button'));

        } else if (state.alerts.isGettingOlderAlerts) {
            jqLoader.insertAfter(jqAlertsContainer);
        } else {
            jqLoader.insertBefore(jqAlertsContainer);
        }
    };

    _NS.PanelComponent.prototype._addAlertCards = function (data) {
        var templateHtml = this._cardTemplate.innerHTML,
            frag = document.createDocumentFragment(),
            jqAlertsContainer = $(this.element).find(this._alertsContainerSelector),
            state = this.store.getState();

        for (var i = 0; i < data.length; i++) {
            if (this._isNewAlertsBubbleClicked === true && $(this.element).find('.js-alert-card[data-alert-id=' + data[i].alertId + '][data-alert-type=' + data[i].alertType + ']').length > 0) {
                continue;
            }
            var card = this._createCard(data[i], templateHtml),
                activeAlerts = state.alerts.activeAlerts;
            if (activeAlerts) {
                for (var j = 0; j < activeAlerts.length; j++) {
                    var currentActiveCard = activeAlerts[j];
                    if (
                        card.getAlertId() === Number(currentActiveCard.alertId)
                        && card.getAlertType() === currentActiveCard.alertType
                        && currentActiveCard.isCardExpanded === true
                    ) {
                        if (card.getAlertType() === 'PENDING_PATIENT') {
                            card._loadPendingPatientInfo(data[i].pendingPatientId);
                        }
                        if (card.getAlertType() === 'INBOUND_CLINICAL_DATA') {
                            card._loadInboundAlertDetails(data[i].groupedAlertIds);
                        }
                        card.expandCard();
                        if (currentActiveCard.isDetailsExpanded === true) {
                            card.expandAlertDetails();
                            card.selectFlipCard(currentActiveCard.isGraphShown);
                        }
                        break;
                    }
                }
            }
            frag.appendChild(card.element);
        }

        if (this.store.getState().alerts.isGettingOlderAlerts && this._isNewAlertsBubbleClicked === false) {
            jqAlertsContainer.append(frag);
        } else {
            jqAlertsContainer.prepend(frag);
        }
        _NS.MoreLessToggle.applyToAll();
    };

    _NS.PanelComponent.prototype._handleEInteractHighRiskDSI = function (alert) {
        const commonDSIFeedbackData = getCommonDSIFeedbackData();
        return {
            ...commonDSIFeedbackData,
            productCode: "einteract",
            dsiCode: "einteract",
            patient: {
                ...commonDSIFeedbackData.patient,
                clientId: alert.patientId
            },
            predictionInference: {
                dsiCorrelationId: alert.alertId,
                predictionContext: [
                    {
                        context: "Assessment",
                        name: alert.assessmentName,
                        displayOrder: "1"
                    },
                    {
                        context: "Question",
                        name: alert.assessmentQuestion,
                        displayOrder: "2"
                    },
                    {
                        context: "Response",
                        name: alert.assessmentQuestionValue,
                        displayOrder: "3"
                    }
                ],
                intervention: {
                    text: [
                        alert.alertDescription
                    ]
                }
            }
        }
    }

    _NS.PanelComponent.prototype._handleLoebsMageersDSI = function (alert) {
        const commonDSIFeedbackData = getCommonDSIFeedbackData();
        return {
            ...commonDSIFeedbackData,
            productCode: "nadv",
            dsiCode: "nadv-advanced-alerts",
            patient: {
                ...commonDSIFeedbackData.patient,
                clientId: alert.patientId
            },
            predictionInference: {
                dsiCorrelationId: alert.alertId,
                predictionContext: [],
                intervention: {
                    text: [
                        alert.alertDescription
                    ]
                }
            }
        }
    }

    _NS.PanelComponent.prototype._createCard = function (data, templateHtml) {
        var cardElem = document.createElement('div'),
            formattedType = this._alertTypes.hasOwnProperty(data.alertType) ? this._alertTypes[data.alertType] : this._alertTypes['ALERT'],
            formattedName = data.patientLastName + ', ' + data.patientFirstName,

            /*
            * The createdTimeString and effectiveTimeString are used here to avoid mismatch for users using different
            * timezone in the browser compared to the timezone set in the server.
            */
            timeSince = _NS.Utils.getMinutesAgo(new Date(data.createdTimestamp), data.createdTimeString),
            effectiveDate = data.effectiveTimeString,
            complexStatement = null,
            pnId = data.pnId,
            assessmentDate = _NS.Utils.getLocalizedAndOffsetDateTime(new Date(data.assessmentTimestamp)),
            hideAlertDetailsEffectiveDate = false,
            hideProgressNote = false,
            hideSuggestionLinks = false,
            hideClientNumber = false,
            hideRoomNumber = false,
            displayInboundClinicalData = false,
            dsiDisplayFeedback = {},
            dsiFeedbackData = null,
            dsiRootId = 'dsiFeedBackRoot_' + data.alertType + '_' + data.alertId,
            displayPendingPatientData = false;

        //update the formattedType for vital exceptions
        if (data.alertType === 'VITALEXCEPTION') {
            formattedType = this._vitalTypes.hasOwnProperty(data.wvStdVitalsId) ? this._vitalTypes[data.wvStdVitalsId] : this._alertTypes[data.alertType];
        }
        //update the formattedType for eInteract clinical alerts
        var eInteractHeading = '';
        var eIntDesc = null;
        if (data.alertType === 'EINTERACT_CLINICAL') {
            formattedType = this._alertTypes['EINTERACT'];
            eInteractHeading = _NS.moduleProps.dynamicTags.eInteractHeadingTag.replace('%s', _NS.moduleProps.termMap.eInteractHeading);

            if (data.alertDescription) {
                eIntDesc = document.createElement('ul');
                data.alertDescription.split("#@#").forEach(function (element) {
                    var lst = document.createElement('li');
                    lst.innerHTML = element;
                    eIntDesc.appendChild(lst);
                });
            }
        }

        if (data.alertType === 'EINTERACT_HIGHRISK_SIMPLE') {
            dsiFeedbackData = this._handleEInteractHighRiskDSI(data);
        }

        if (data.alertType === 'LOEBS_MAGEERS') {
            dsiFeedbackData = this._handleLoebsMageersDSI(data);
        }

        if (data.alertType === 'INBOUND_CLINICAL_DATA') {
            formattedType = this._alertTypes['INBOUND_CLINICAL'];
            data.alertDescription = _NS.moduleProps.alertDescriptions.inboundClinicalAlertDescription;
            hideProgressNote = true;
            hideAlertDetailsEffectiveDate = true;
            hideSuggestionLinks = true;
            displayInboundClinicalData = true;
        }

        if (data.alertType === 'PENDING_PATIENT') {
            formattedType = this._alertTypes['PENDING_PATIENT'];
            data.alertDescription = _NS.moduleProps.alertDescriptions.pendingPatientAlertDescription
                .replace(/\{0\}/g, _NS.moduleProps.termMap.clientTerm.toLowerCase())
                .replace(/\{1\}/g, _NS.moduleProps.termMap.admissionTerm);
            data.clearAlertPermission = false;
            hideProgressNote = true;
            hideAlertDetailsEffectiveDate = true;
            hideSuggestionLinks = true;
            hideClientNumber = true;
            hideRoomNumber = true;
            displayPendingPatientData = true;
        }

        if (data.complex === true) {
            var approach = (data.complexApproach < _NS.moduleProps.complexApproaches.length) ? _NS.moduleProps.complexApproaches[data.complexApproach] : '';
            var durationType = (data.complexDurationType < _NS.moduleProps.complexDurations.length) ? _NS.moduleProps.complexDurations[data.complexDurationType] : '';
            complexStatement = approach
                .replace(/\{0\}/g, data.complexFrequency)
                .replace(/\{1\}/g, data.complexDuration)
                .replace(/\{2\}/g, durationType)
        }

        var wvDesc = null;
        if (data.wvDescriptions) {
            wvDesc = document.createElement('ul');
            data.wvDescriptions.forEach(function (element) {
                var lst = document.createElement('li');
                lst.innerHTML = element;
                wvDesc.appendChild(lst);
            });
        }
        data.alertDescription = (data.alertDescription || '').replace(/#@#/g, ',')
        cardElem.innerHTML = templateHtml
            .replace(/{{createdTimestamp}}/g, data.createdTimestamp)
            .replace(/{{id}}/g, data.alertId)
            .replace(/{{groupedAlertIds}}/g, data.groupedAlertIds || '')
            .replace(/{{type}}/g, data.alertType)
            .replace(/{{module}}/g, data.module)
            .replace(/{{formattedType}}/g, formattedType)
            .replace(/{{clientNumber}}/g, data.patientNumber)
            .replace(/{{carePlanAction}}/g, (_NS.moduleProps.canAddCarePlan && data.currentCarePlanId !== 0) ? '/care/chart/cp/careplandetail_rev.jsp?ESOLcareplanid=' + data.currentCarePlanId + '&ESOLclientid={{clientId}}' : '/admin/client/cp_careplans_rev.jsp?ESOLclientid={{clientId}}')
            .replace(/{{clientId}}/g, data.patientId)
            .replace(/{{formattedName}}/g, formattedName)
            .replace(/{{room}}/g, data.room)
            .replace(/{{timeSince}}/g, timeSince)
            .replace(/{{eInteractHeading}}/g, eInteractHeading)
            .replace(/{{description}}/g, (wvDesc === null) ? ((eIntDesc === null) ? data.alertDescription : '') : '')
            .replace(/{{groupSize}}/g, ((data.alertType === 'CLINICAL' || data.alertType === 'ORDER' || data.alertType === 'VITALEXCEPTION') && data.groupedAlertIds.length > 0) ? '+' + data.groupedAlertIds.length + ' ' + ((data.groupedAlertIds.length > 1) ? _NS.moduleProps.termMap.alertsCap : _NS.moduleProps.termMap.alert) : '')
            .replace(/{{pn_description}}/g, (data.wvPNDescription === null) ? data.alertDescription : data.wvPNDescription)
            .replace(/{{autoPopulateProgressNote}}/g, data.autoPopulateProgressNote ? 'true' : 'false')
            .replace(/{{assess_date}}/g, assessmentDate)
            .replace(/{{assess_description}}/g, data.assessmentName)
            .replace(/{{assess_type}}/g, data.assessmentType)
            .replace(/{{clearSmartAlert}}/g, ((data.alertType === 'CLINICAL' || data.alertType === 'ORDER' || data.alertType === 'VITALEXCEPTION') && data.groupedAlertIds.length > 0) ? _NS.moduleProps.termMap.clearAll : _NS.moduleProps.termMap.clear)
            .replace(/{{createSAProgressNote}}/g, ((data.alertType === 'CLINICAL' || data.alertType === 'ORDER' || data.alertType === 'VITALEXCEPTION') && data.groupedAlertIds.length > 0) ? _NS.moduleProps.termMap.createProgressNoteForAll : _NS.moduleProps.termMap.createProgressNote)
            .replace(/{{assessment_linked}}/g, data.isAssessmentCreated == null ? '' : data.isAssessmentCreated)
            .replace(/{{trigger_question}}/g, data.assessmentQuestion)
            .replace(/{{trigger_response}}/g, data.assessmentQuestionValue)
            .replace(/{{displayExtendedDetails}}/g, (data.assessmentQuestion === null) ? 'none' : 'block')
            .replace(/{{displayComplexDetails}}/g, (data.complex === true) ? 'block' : 'none')
            .replace(/{{Assessment}}/g, _NS.moduleProps.termMap.assessment)
            .replace(/{{clearAlertPermission}}/g, data.clearAlertPermission ? 'true' : 'none')
            .replace(/{{followup_question}}/g, data.complexFollowupQuestion)
            .replace(/{{Task}}/g, _NS.moduleProps.termMap.task)
            .replace(/{{complex_description}}/g, complexStatement)
            .replace(/{{pnId}}/g, data.pnId)
            .replace(/{{vitalType}}/g, (data.wvStdVitalsId) ? data.wvStdVitalsId : -1)
            .replace(/{{effectiveDate}}/g, effectiveDate)
            .replace(/{{displayInboundClinicalData}}/g, displayInboundClinicalData === true ? 'block' : 'none')
            .replace(/{{hideAlertDetailsEffectiveDate}}/g, (hideAlertDetailsEffectiveDate === true) ? 'none' : 'block')
            .replace(/{{hideProgressNote}}/g, (hideProgressNote === true) ? 'none' : 'block')
            .replace(/{{hideSuggestionLinks}}/g, (hideSuggestionLinks === true) ? 'none' : 'block')
            .replace(/{{displayPendingPatientData}}/g, displayPendingPatientData === true ? 'block' : 'none')
            .replace(/{{hideClientNumber}}/g, (hideClientNumber === true) ? 'none' : 'inline')
            .replace(/{{hideRoomNumber}}/g, (hideRoomNumber === true) ? 'none' : 'block')
            .replace(/{{dsiRootId}}/g, dsiRootId)
            .replace(/{{hideDSI}}/g, (dsiFeedbackData != null) ? 'block' : 'none')
            .replace(/{{pendingPatientId}}/g, data.pendingPatientId);

        cardElem = cardElem.firstElementChild;

        if (wvDesc) {
            $(cardElem).find('.js-alert-description').append(wvDesc);
        }

        //show 'eINTERACT' instead of 'EINTERACT' in header
        if (data.alertType === 'EINTERACT_CLINICAL') {
            var typeSpan = $(cardElem).find('div.c-card__header span.c-card__type');
            typeSpan.removeClass('u-text-uppercase');
            formattedType = formattedType.charAt(0).toLowerCase() + formattedType.slice(1).toUpperCase();
            typeSpan.text(formattedType);

            if (eIntDesc) {
                $(cardElem).find('.js-alert-description').append(eIntDesc);
            }

        }

        if (data.alertType === 'EINTERACT_CLINICAL' || data.alertType === 'EINTERACT_HIGHRISK' || data.alertType === 'EINTERACT_HIGHRISK_SIMPLE') {
            if (data.isAssessmentCreated === true) {
                var eInteractCheckboxLabel = $(cardElem).find('div.js-assessment-create-wrapper > label')
                eInteractCheckboxLabel.children('input').prop('disabled', true);
                eInteractCheckboxLabel.children('input').prop('checked', true);
                eInteractCheckboxLabel.attr('actioned', true);
                eInteractCheckboxLabel.removeClass('c-custom-checkbox');
                eInteractCheckboxLabel.addClass('c-custom-checkbox__disabled');
            }
        }

        if (!(data.alertType === 'EINTERACT_CLINICAL' || data.alertType === 'EINTERACT_HIGHRISK' || data.alertType === 'EINTERACT_HIGHRISK_SIMPLE')) {
            $(cardElem).find('div.js-assessment-create-wrapper.js-einteract-assessment').addClass('u-hidden');
        }

        //Show View or Create Progress Notes checkbox
        if (data.pnId == 0) {
            $(cardElem).find('.pn-view').hide();
            $(cardElem).find('.pn-create').css('display', 'block');
        } else {
            $(cardElem).find('.pn-create').hide();
            $(cardElem).find('.pn-view').css('display', 'block');
        }

        // Add the triggering tasks as a list
        if (data.complexTriggeringTasks) {
            var tasks = $(cardElem).find('.c-task-description').find('ul')
            data.complexTriggeringTasks.forEach(function (element) {
                var lst = document.createElement('li');
                lst.innerHTML = element;
                tasks.append(lst);
            });
        }

        if (data.alertDetails) {
            // Add the inbound clinical details
            if (displayInboundClinicalData) {
                var inboundlists = $(cardElem).find('.c-inbound-list')
                data.alertDetails.split(";").forEach(function (value) {
                    var paragraph = document.createElement('p');
                    paragraph.innerHTML = value;
                    inboundlists.append(paragraph);
                });
            }
        }

        // Add the possible pick list items as a list
        if (data.complexPickListItems) {
            var picklists = $(cardElem).find('.c-response-pick-list').find('ul')
            data.complexPickListItems.forEach(function (element) {
                var lst = document.createElement('li');
                lst.innerHTML = element;
                picklists.append(lst);
            });
        }

        if ((data.alertType === 'CLINICAL' || data.alertType === 'ORDER' || data.alertType === 'VITALEXCEPTION') && data.groupedAlertIds.length > 0) {
            $(cardElem).find('.js-grouped-alerts-div').removeClass('u-hidden');
        }

        return new _NS.CardComponent(this.store, cardElem, this._clearAlertCardCallback, dsiRootId, dsiFeedbackData);
    };

    _NS.PanelComponent.prototype.render = function () {
        var state = this.store.getState(),
            CLASS_ACTIVE_TAB = 'c-tabs__tab--is-active',
            CLASS_LOADER = 'js-loader c-loader c-loader--center u-mt-8 u-mb-8',
            CLASS_HAS_NO_ALERTS = 'c-panel-alerts--has-no-alerts',
            CLASS_IS_HIDDEN = 'u-hidden',
            CLASS_TAB_HAS_ALERTS = 'c-tabs__tab--has-alert';

        if (state.drawer.isVisible === false) return;

        $(this.element).find(this._tabSelector).removeClass(CLASS_ACTIVE_TAB);
        $(this.element).find(this._tabSelector + '[data-tab-type="' + state.alerts.type + '"]').addClass(CLASS_ACTIVE_TAB);

        if (state.alerts.type === 'client' && state.hasNewAlerts.excludeClient === true) {
            $(this._tabSelector + '[data-tab-type="all"]').addClass(CLASS_TAB_HAS_ALERTS);
        } else {
            $(this._tabSelector + '[data-tab-type="all"]').removeClass(CLASS_TAB_HAS_ALERTS);
        }

        if (state.isLoading) {
            this._showLoader(CLASS_LOADER, CLASS_HAS_NO_ALERTS);
        } else {
            $(this.element).find(this._loaderSelector).remove();

        }

        if (state.alerts.doReplaceExistingAlerts === true) $(this.element).find(this._alertsContainerSelector).empty();

        if (state.isFirstPageLoad === true) {
            if (state.alerts.type === 'client' && state.alerts.scrolledToAlert.clientId !== null && state.alerts.scrolledToAlert.clientId !== state.clientId) {
                this.store.dispatch({type: 'CLEAR_SCROLLED_TO_ALERT'});
                _NS.FilterComponent.prototype.collapsePanel(this.store);
            }
            this._loadOlderAlertsAndReplace();
        }

        if (_NS.moduleProps.isNewLogin === false
            && state.qtfState.drawerOpen == 0
            && ((state.alerts.type === 'all' && state.hasNewAlerts.all === true) || (state.alerts.type === 'client' && state.hasNewAlerts.client === true))
        ) {
            if ($(this.element).find('.js-alert-card').length > 0 && this.element.scrollHeight <= this.element.offsetHeight) {
                this._dismissBubble();
            } else {
                this._bubble.css({'marginTop': state.alerts.type === 'client' ? '20px' : this._bubble.css('marginTop')}).show();
                this._enableBubble();
            }
        }

        if (state.alerts.doUpdateUI == true) {
            if (!state.alerts.lastLoadedAlerts) {
                if (!state.alerts.existingAlerts || state.alerts.existingAlerts.length === 0) {
                    $(this.element).find(this._alertsContainerSelector).empty().text(_NS.moduleProps.termMap.noAlerts).addClass(CLASS_HAS_NO_ALERTS);
                }
            } else {
                this._addAlertCards(state.alerts.lastLoadedAlerts);
                this._setScrollTopToPivotAlert();

                if (this._isNewAlertsBubbleClicked === true) {
                    var firstCardInView;
                    $(this.element).find('.js-alert-card').each(function (index, elem) {
                        if (_NS.Utils.isElementInView($(this.element), elem, false)) {
                            firstCardInView = $(elem);
                            return false;
                        }
                    }.bind(this));

                    this._bubble.removeClass('c-button--has-loader').hide();

                    var duration = (typeof firstCardInView !== 'undefined') ? Math.min(firstCardInView.index() * 250, 1000) : 250;
                    this._isLoadAlertsOnScrollDisabled = true;
                    $(this.element).animate({scrollTop: 0}, duration, 'swing', function () {
                        setTimeout(function () {
                            this._isNewAlertsBubbleClicked = false;
                            this._isLoadAlertsOnScrollDisabled = false;
                            this.store.dispatch({type: 'SET_EXISTING_ALERTS_TO_LAST_LOADED_ALERTS'});
                        }.bind(this), _NS.PanelComponent.SCROLL_THROTTLE * 2 + duration);
                    }.bind(this));
                }
            }
            this.store.dispatch({
                type: 'ALERTS_UPDATE_UI_COMPLETE'
            });
            this._saveFirstAlertCardInView();
        }

    };

    _NS.PanelComponent.prototype._setScrollTopToPivotAlert = function () {
        var pivotAlert,
            pivotAlertCard,
            state = this.store.getState(),
            existingAlerts = state.alerts.existingAlerts;

        if (state.alerts.isGettingOlderAlerts === false && state.alerts.doReplaceExistingAlerts === false) {
            pivotAlert = existingAlerts[state.alerts.lastLoadedAlerts.length];
            if (typeof pivotAlert !== 'undefined') pivotAlertCard = $('#js-csa-alert-card-' + pivotAlert.alertType + '-' + pivotAlert.alertId);
        } else if (state.alerts.isGettingOlderAlerts === true && state.alerts.doReplaceExistingAlerts === true) {
            var scrolledToAlert = state.alerts.scrolledToAlert;
            pivotAlertCard = $('#js-csa-alert-card-' + scrolledToAlert.alertType + '-' + scrolledToAlert.alertId);

            if (pivotAlertCard.length === 0) {
                for (var j = 0; j < existingAlerts.length; j++) {
                    var currAlert = existingAlerts[j];
                    if (scrolledToAlert.createdTimestamp >= currAlert.createdTimestamp) {
                        pivotAlert = currAlert;
                        break;
                    }
                }
                if (typeof pivotAlert !== 'undefined') {
                    pivotAlertCard = $('#js-csa-alert-card-' + pivotAlert.alertType + '-' + pivotAlert.alertId);
                }
            }
        }

        if (typeof pivotAlertCard !== 'undefined' && pivotAlertCard.length > 0) {
            var scrollPosY = pivotAlertCard.prev().length ? pivotAlertCard[0].offsetTop - $(this.element).find(this._tabSelector).height() - parseInt(pivotAlertCard.css('marginBottom'), 10) - parseInt($(this.element).find(this._contentSelector).css('paddingTop'), 10) + 10 : 0;
            this._isLoadAlertsOnScrollDisabled = true;
            $(this.element).scrollTop(scrollPosY);
            setTimeout(function () {
                if (this._isNewAlertsBubbleClicked === false) this._isLoadAlertsOnScrollDisabled = false;
            }.bind(this), _NS.PanelComponent.SCROLL_THROTTLE * 2);
        }
    }

    _NS.PanelComponent.prototype._enableBubble = function () {
        // Remove old handlers First
        this._disableBubble();
        $(this.element).on('click.dismissBubble', function (e) {
            this._dismissBubble();
        }.bind(this));

        this._bubble.on('click.bubbleClick', function (e) {
            this._isNewAlertsBubbleClicked = true;
            this._loadLatestAlerts();
            this._dismissBubble(true);

            _NS.sendEventIfEnabled('Alerts', 'New Alerts');
        }.bind(this));
    };

    _NS.PanelComponent.prototype._disableBubble = function () {
        $(this.element).off('click.dismissBubble');
        this._bubble.off('click.bubbleClick');
    };

    _NS.PanelComponent.prototype._dismissBubble = function (showLoader) {
        var showLoader = typeof showLoader !== 'undefined' ? showLoader : false;
        if (this._bubble.is(':visible')) {
            // Only need to update timestamp if we are hiding
            // the new alerts button
            this.updateLastDrawerTime();
            this._disableBubble();
            if (showLoader === true) {
                this._bubble.addClass('c-button--has-loader');
            } else {
                this._bubble.hide();
            }
        }
        this.store.dispatch({type: 'DISMISS_HAS_UNCLEARED_ALERTS'});
        this.store.dispatch({
            type: 'UPDATE_DRAWER_ALERT_CHECK',
            payload: {
                date: Date.now()
            }
        });
    };

    _NS.PanelComponent.prototype._clearAlertCardCallback = function (alertId, alertType) {
        this.store.dispatch({
            type: 'REMOVE_FROM_EXISTING_ALERTS',
            payload: {
                alertId: alertId,
                alertType: alertType
            }
        });

        this._saveFirstAlertCardInView();

        if (_NS.Utils.isScrollTopNearBottom(this.element) && !this.store.getState().isLoading) {
            this._loadOlderAlerts();
        }
    }

    _NS.PanelComponent.prototype._saveFirstAlertCardInView = function () {
        var foundalert = false;

        //try to find the first card fully fit on panel
        $(this.element).find('.js-alert-card').each(function (index, elem) {
            if (_NS.Utils.isElementInView($(this.element), elem, false)) {
                this._saveScrolledToAlert(elem)
                foundalert = true;
                return false;
            }
        }.bind(this));

        // none?
        if (foundalert === false) {
            //try to find the first card even if not fit on panel

            $(this.element).find('.js-alert-card').each(function (index, elem) {
                if (_NS.Utils.isElementInView($(this.element), elem, true)) {
                    this._saveScrolledToAlert(elem)
                    foundalert = true;
                    return false;
                }
            }.bind(this));
        }
        // none?
        if (foundalert === false) {
            //there isn't a active card
            this.store.dispatch({type: 'CLEAR_SCROLLED_TO_ALERT'});
        }
    };

    _NS.PanelComponent.prototype._saveScrolledToAlert = function (elem) {
        this.store.dispatch({
            type: 'SAVE_SCROLLED_TO_ALERT',
            payload: {
                alertId: $(elem).data('alertId'),
                alertType: $(elem).data('alertType'),
                clientId: $(elem).data('clientId'),
                createdTimestamp: $(elem).data('createdTimestamp'),
                module: $(elem).data('module')
            }
        });
    };

    _NS.PanelComponent.prototype._loadOlderAlerts = function () {
        this.store.dispatch({
            type: 'LOAD_ALERTS_INITIALIZE',
            payload: {
                doReplaceExistingAlerts: false,
                isGettingOlderAlerts: true
            }
        });
        this._alertsLoader.loadAlerts();
    };

    _NS.PanelComponent.prototype._loadNewerAlerts = function () {
        this.store.dispatch({
            type: 'LOAD_ALERTS_INITIALIZE',
            payload: {
                doReplaceExistingAlerts: false,
                isGettingOlderAlerts: false
            }
        });
        this._alertsLoader.loadAlerts();
    };

    _NS.PanelComponent.prototype._loadOlderAlertsAndReplace = function () {
        this.store.dispatch({
            type: 'LOAD_ALERTS_INITIALIZE',
            payload: {
                doReplaceExistingAlerts: true,
                isGettingOlderAlerts: true
            }
        });
        this._alertsLoader.loadAlerts();
    };

    _NS.PanelComponent.prototype._loadLatestAlerts = function () {
        this.store.dispatch({type: 'CLEAR_PIVOT_ALERTS'});
        this.store.dispatch({type: 'CLEAR_SCROLLED_TO_ALERT'});
        this._loadOlderAlerts();
    }

    _NS.PanelComponent.prototype.updateLastDrawerTime = function () {
        $.post('/clinical/alerts/smart/updatedrawertime.xhtml');
    };

}());
