'use strict';

(function() {
  window.clinicalSmartAlerts = window.clinicalSmartAlerts || {};
  var _NS = clinicalSmartAlerts;
	
  _NS.SuggestionsSubComponent = function(store, selector, cardComponent) {
    this.S_FOCUS = 1;
    this.S_GOAL = 2;
    this.S_INTERVENTION = 3;
    this.S_TASK = 4;
    this.S_PN = 5;
    //this.S_CP = 6;
    this.S_ASSESS = 7;
    this.S_OTHER = 8;

    // These values persist for the lifespan on the element
    this.ALERT_ID = parseInt(cardComponent.element.getAttribute('data-alert-id'));
    this.ALERT_TYPE = cardComponent.element.getAttribute('data-alert-type');
    this.ALERT_CLIENT_ID = parseInt(cardComponent.element.getAttribute('data-client-id'));
	
    _NS.StatefulComponent.call(this, { store:store, selector: selector });
    
    this.checkboxTemplate = document.querySelector('#tmpl-csa-alert-card-checkbox');
    this.clinicalAssessmentDatePicker = document.querySelector('#tmpl-csa-alert-card-clinical-assessment-show-hide');
	
    this.cardComponent = cardComponent; // reference back to parent cardComponent
  	this.element = $(this.cardComponent.element).find(selector.split(' ')[1]);
  	
  	this._pendingPatientCarousel = new _NS.Carousel(this.element[0].querySelector('.js-carousel-pending-patient'));
  	
  	if (_NS.moduleProps.canAddPN && _NS.moduleProps.isESignatureForPNEnabled) {
      this._eSignatureCarousel = new _NS.Carousel(this.element[0].querySelector('.js-carousel-esignature'));
    }
    this._initHandlers();
    this._checkboxes =  this.element.find('label.c-custom-checkbox');
	this._suggestedPNText = [];
  };
  
  _NS.SuggestionsSubComponent.prototype = Object.create(_NS.StatefulComponent.prototype);
  _NS.SuggestionsSubComponent.prototype.constructor = _NS.SuggestionsSubComponent;

  _NS.SuggestionsSubComponent.prototype.render = function() {};
  
  _NS.SuggestionsSubComponent.prototype.getSmartAlertActionVOs = function() {
    var _self = this;
    var smartAlertSaveActionVOs = {};
    smartAlertSaveActionVOs.carePlanItemVOs = [];
    smartAlertSaveActionVOs.systemAssessVOs = [];
    for(var i = 0; i < _self._checkboxes.length; i++) {
      var checkbox = $(_self._checkboxes[i]);
      var carePlanItemVO = null;
      if(checkbox.parent().hasClass('js-assessment-create-wrapper') && checkbox.is('label:has(input:checked:enabled):not([actioned])')) {
        if(checkbox.parent().hasClass('js-einteract-assessment')) {
          smartAlertSaveActionVOs.eInteractAssessmentSaveActionVO = this._buildSmartAlertSaveActionVO(function() {
            var element = $(_self.cardComponent.element);
            var assessmentSection = checkbox.parent();
            var date = _self._getEffectiveDate('.js-einteract-assessment');

            var cicReasons = [];
            assessmentSection.find('.chzn-select').find(':selected').each(function(i, domEl) {
              cicReasons.push($(domEl).attr('value'));
            });

            var SWdescs = element.attr('data-stop-and-watch-alert-descs') ? JSON.parse(element.attr('data-stop-and-watch-alert-descs')) : [];

            var otherCICDesc = assessmentSection.find('.c-cic-other-symptoms-input').val() || '';

            return {
              action: 'CREATE_EINTERACT_ASSESSMENT',
              einteractAssessment: {
                referenceDate: date,
                cicReasons: cicReasons,
                stopAndWatchDescriptions: SWdescs,
                otherReason: otherCICDesc
              }
            };
          });
        }
        else if(checkbox.parent().hasClass('js-system-assessment')) {
          var systemAssessmentVO = this._buildSmartAlertSaveActionVO(function() {
            var systemTypeId = checkbox.attr('data-item-id');
            var date = _self._getEffectiveDate('#js-system-assessment-' + _self.ALERT_TYPE + '-' + _self.ALERT_ID + '-' + systemTypeId);

            var assessmentTypeCode = checkbox.parent().find('select[name="assessment_type"]').val();

            return {
              action: 'CREATE_SYSTEM_ASSESSMENT',
              suggestionId: parseInt(checkbox.attr('data-suggestion-id')),
              systemAssessment: {
                assessmentDateTime: date,
                typeCode: assessmentTypeCode,
                systemTypeId: systemTypeId,
              }
            };
          });
          smartAlertSaveActionVOs.systemAssessVOs.push(systemAssessmentVO);
        }
      }
      else if(checkbox.parent().hasClass('js-create-pn-wrapper') && checkbox.is('label.pn-create:has(input:checked:enabled):not([actioned])')) {
        smartAlertSaveActionVOs.progressNoteSaveActionVO = this._buildSmartAlertSaveActionVO(function () {
          var element = $(_self.cardComponent.element);
            
          var notes = [];
          element.find('textarea').each(function(i,e){
            notes.push(e.value);
          });
          
          return {
            action: 'CREATE_PROGRESS_NOTE',
            progressNote: {
              wvType: element.data('vitalType'),
              module: element.data('module'),
              notes: notes
            }
          };
        });
      }
      else if(checkbox.parent().hasClass('js-suggested-care-plan-section') && checkbox.is('label:has(input:checked:enabled):not([actioned])')) {
        if(checkbox.attr('data-suggestion-type') == '1') {
          carePlanItemVO =  this._buildSmartAlertSaveActionVO(function() {
            return {
              action: 'CREATE_FOCUS_ON_CARE_PLAN',
              suggestionId: parseInt(checkbox.attr('data-suggestion-id')),
              carePlanItem : {
                itemId: checkbox.attr('data-item-id')
              }
            };
          });
          smartAlertSaveActionVOs.carePlanItemVOs.push(carePlanItemVO);
        }
        else if(checkbox.attr('data-suggestion-type') == '2') {
          carePlanItemVO =  this._buildSmartAlertSaveActionVO(function() {
            return {
              action: 'CREATE_GOAL_ON_CARE_PLAN',
              suggestionId: parseInt(checkbox.attr('data-suggestion-id')),
              carePlanItem : {
                itemId: checkbox.attr('data-item-id')
              }
            };
          });
          smartAlertSaveActionVOs.carePlanItemVOs.push(carePlanItemVO);
        }
        else if(checkbox.attr('data-suggestion-type') == '3') {
          carePlanItemVO =  this._buildSmartAlertSaveActionVO(function() {
            return {
              action: 'CREATE_INTERVENTION_ON_CARE_PLAN',
              suggestionId: parseInt(checkbox.attr('data-suggestion-id')),
              carePlanItem : {
                itemId: checkbox.attr('data-item-id')
              }
            };
          });
          smartAlertSaveActionVOs.carePlanItemVOs.push(carePlanItemVO);
        }
      }
      else if(checkbox.parent().hasClass('js-suggested-task-section') && checkbox.is('label:has(input:checked:enabled):not([actioned])')) {
        carePlanItemVO =  this._buildSmartAlertSaveActionVO(function() {
          return {
            action: 'CREATE_TASK_ON_CARE_PLAN',
            suggestionId: parseInt(checkbox.attr('data-suggestion-id')),
            carePlanItem : {
              itemId: checkbox.attr('data-item-id')
            }
          };
        });
        smartAlertSaveActionVOs.carePlanItemVOs.push(carePlanItemVO);
      }
    }
    return smartAlertSaveActionVOs;
  };

  _NS.SuggestionsSubComponent.prototype.isCreatePNActive = function() {
    return this._checkboxes.is('label.pn-create:has(input:checked:enabled)');
  };

  _NS.SuggestionsSubComponent.prototype.isCreateAssessmentActive = function() {
    return this._checkboxes.parent('.js-assessment-create-wrapper').is(':has(label > input:checked:enabled)');
  };
  
  _NS.SuggestionsSubComponent.prototype.uncheckAll = function() {
    this._checkboxes.find('input:enabled').prop('checked', false);
  };

  _NS.SuggestionsSubComponent.prototype._initHandlers = function() {
    var _self = this;
    var element = $(_self.element);
    
    if (_NS.moduleProps.canAddPN) {
      element
        .on('change.createPN', 'div.js-create-pn-wrapper input', function(e) {
          var card = $(_self.cardComponent.element);
          if($(this).prop('checked')) {
            var wvType = card.data('vitalType');
            var pnId = card.attr('data-pn-id');
            var pnJSON = _self.cardComponent._getPnStructureFromCache(_self.ALERT_TYPE, wvType, pnId);
            if (pnJSON) {
              _self.setupProgressNote(JSON.parse(pnJSON));
            }
            else {
              $.getJSON('/clinical/alerts/smart/getpnsectiontext.xhtml', {
                alertType: _self.ALERT_TYPE,
                wvType: wvType,
                pnId: pnId
              })
              .success(function(data) {
                _self.setupProgressNote(data);
                _self.cardComponent._putPnStructureInCache(_self.ALERT_TYPE, wvType, pnId, JSON.stringify(data));
              }.bind(this));
            }
            _self.cardComponent._recordSuggestionsEvent(element, 'Add Progress Note');
          }
          else {
            _self.resetPN(); 
          }
        });
    }
    
    if (_NS.moduleProps.canAddPN && _NS.moduleProps.isESignatureForPNEnabled) {
      element
        .on('click.signESign', '.js-button-sign-esignature', function(e) {
          var clickedButton = this;
          if(_self.isCreateAssessmentActive() && !_self.validateEffectiveDate()) {
            return;
          }

          var passwordInput = element.find('.js-input-esignature-password');
          _self._resetFormStatusMessage('.js-esignature-form-status-msg');
          if(_self._validateInput(passwordInput, true)) {
            _self.cardComponent._disableInputsAndButtons(_self.cardComponent.element, clickedButton);
            $.post('/clinical/alerts/smart/verifyelectronicsignature.xhtml', {
              token: passwordInput.val()
            })
            .success(function(data, textStatus, jqXhr) {
              // enable inputs because _performMultiSave reads data from enabled inputs only
              _self.cardComponent.enableUnactionedInputsAndButtons(_self.cardComponent.element, clickedButton);
              _self._performMultiSave(clickedButton);
            })
            .fail(function(jqXhr, textStatus, error) {
              if(jqXhr.responseText == "logout user"){
                recursivelyCloseOpenersThenRedirect("/home/logout.jsp");
              }
              _self._inputShowError(passwordInput);
              _self._setFormStatusMessage('.js-esignature-form-status-msg', jqXhr.responseText, true);
              _self.cardComponent.enableUnactionedInputsAndButtons(_self.cardComponent.element, clickedButton);
            }.bind(this));
          }
        })
        .on('click.cancelESign', '.js-button-cancel-esignature', function(e) {
          _self._eSignatureCarousel.previous(function() {
            $(':focus').blur();
            element
              .find('.js-input-esignature-password').removeClass('has-error').val('');
          });
          _self._resetFormStatusMessage('.js-esignature-form-status-msg');
        })
        .on('keypress.keyPressESign', '.js-esignature-form', function(e){
          if (e.which === 13) {
            element.find('.js-button-sign-esignature').trigger('click.signESign');
            e.preventDefault();
          }
        });
    }
    
    if(_NS.moduleProps.canAssessAlerts) {
      this.element
      .on('change.setupAssess', 'div.js-assessment-create-wrapper > label > input', function(e) {
        var card = $(_self.cardComponent.element);
        var assessmentWrapper = $(e.target.parentElement.parentElement);
        var dateField = assessmentWrapper.find('input.pccDateField');
        // initialize date picker
        var hiddenInput = assessmentWrapper.find('input[name="effective_date"]');
        var curDate = new Date();
        hiddenInput.attr('value', (curDate.getMonth() + 1) + '/' + curDate.getDate() + '/' + curDate.getFullYear());
        dateField.attr('value', (curDate.getMonth()) + 1 + '/' + curDate.getDate() + '/' + curDate.getFullYear());
        assessmentWrapper.find('select[name=hour]').val(curDate.getHours());
        assessmentWrapper.find('select[name=min]').val(curDate.getMinutes());

        if(!dateField.hasClass('hasDatepicker')) {
          _self.element.find('button').prop('disabled', true);
          dateField.dateField();

          if(_NS.moduleProps.isCICOnline && (_self.ALERT_TYPE === 'EINTERACT_CLINICAL' || _self.ALERT_TYPE === 'EINTERACT_HIGHRISK' || _self.ALERT_TYPE === 'EINTERACT_HIGHRISK_SIMPLE')) {
            $.getJSON('/clinical/alerts/smart/getCICReasons.xhtml', {
              alertType : _self.ALERT_TYPE,
              alertIds : card.data('groupedAlertIds')
            })
            .success(function(data) {
              if(data.stopWatchAlertDesc != null && data.stopWatchAlertDesc.length !== 0) {
                card.attr('data-stop-and-watch-alert-descs', JSON.stringify(data.stopWatchAlertDesc));
                var SWspan = assessmentWrapper.find('.alert-SW-conds');
                SWspan.after(' ' + data.stopWatchAlertDesc.join('; '));
              }

              // the multi-select uses the chosen library (https://github.com/harvesthq/chosen)
              var select = assessmentWrapper.find('select.chzn-select');
              for(var i in data.reasons) {
                var option = document.createElement('option');
                option.setAttribute('value', data.reasons[i].item_value);
                option.textContent = data.reasons[i].item_description;

                if(data.alertReasonIds.indexOf(data.reasons[i].item_value) >= 0) {
                  option.setAttribute('selected', 'selected');
                }
                select.append(option);
              }

              _self._toggleOtherChangeinConditionTextBox();

              /* show multi-select after data is loaded
                unhiding must happen before chosen is called because jquery can't find element width
                when it's hidden */
              _self.element.find(".c-einteract-assessment__hidden").removeClass("c-einteract-assessment__hidden");
              // initialize multi-select with 'chosen' library
              $(select).chosen();

              _self.element.find('button').prop('disabled', false);
            })
            .fail(function() {
              _self.element.find('button').prop('disabled', false);
            }.bind(this));
          }
          else if(_self.ALERT_TYPE === 'CLINICAL') {
            var systemTypeId = $(e.target).parent().attr('data-item-id');

            $.getJSON('/clinical/alerts/smart/getAssessmentTypeDesc.xhtml', {
              systemTypeId : systemTypeId
            })
            .success(function(data) {
              var assessTypeSelect = $(e.target).parent().parent().find('select[name="assessment_type"]');
              for(var i = 0; i < data.length; i++) {
                var option = $('<option></option>');
                option.attr('value', data[i].assessmentTypeCode);
                option.text(data[i].assessmentTypeDesc);
                assessTypeSelect.append(option);
              }
              _self.element.find('button').prop('disabled', false);
            })
            .fail(function() {
              _self.element.find('button').prop('disabled', false);
            }.bind(this));
          }
          else {
            _self.element.find('button').prop('disabled', false);
          }
        }
      })
      .on('change.toggle"OtherChangeInCondition"textbox', ".chzn-select", function(e) {
        _self._toggleOtherChangeinConditionTextBox();
      });
    }

    this.element
    .on('click.toggleSaveCancelButtons', 'label.c-custom-checkbox', function(e) {
      if(!$(e.target).is('input')) {
        // only do work on events triggered by the checkbox itself
        return;
      }
      // read-only pn-view should not alter visibility of save/cancel buttons
      if($(e.target).parent().hasClass('pn-view')) {
        return;
      }
      var show = false;
      for(var i = 0; i < _self._checkboxes.length; i++) {
        if($(_self._checkboxes[i]).is('.pn-view:visible')) {
          continue;
        }
        if($(_self._checkboxes[i]).find('input').is(':checked')) {
          show = true;
          break;
        }
      }

      _self.toggleSaveCancelButtons(show);
    })
    .on('click.saveInteractiveSection', '.js-button-save-interactive-suggestions', function(e) {
      if(_self.isCreateAssessmentActive() && !_self.validateEffectiveDate()) {
        return;
      }

      if (_NS.moduleProps.isESignatureForPNEnabled && _self.isCreatePNActive()) {
        _self._eSignatureCarousel.next(function() {
          $(':focus').blur();
          $(_self.element).find('.js-input-esignature-password').focus();
        });
      }
      else {
        _self._performMultiSave(this);
      }
      _self.cardComponent._recordSuggestionsEvent(element, 'Save Smart Alert Interactive Section');
    })
    .on('click.cancelInteractiveSection', '.js-button-cancel-interactive-suggestions', function(e) {
      _self.resetPN();
      _self.resetAssessment();
      _self.uncheckAll();
      _self.toggleSaveCancelButtons(false);
      // this functionality is specific to the cancel button. Do not move to resetPN or resetAssessment
      _self.element.find('div.js-assessment-create-wrapper').removeClass('c-show-hide--is-active');
      _self.element.find('div.js-create-pn-wrapper').removeClass('c-show-hide--is-active');
      _self.cardComponent._recordSuggestionsEvent(element, 'Cancel Smart Alert Interactive Section');
    })
    .on('click.toggleDeletePendingPatientSection', '.js-button-show-delete-pending-patient-section', function(e) {
    	_self._pendingPatientCarousel.next();
    })
    .on('click.toggleDeletePendingPatientSection', '.js-button-hide-delete-pending-patient-section', function(e) {
    	_self._pendingPatientCarousel.previous();
    })
    .on('click.deletePendingPatient', '.js-button-delete-pending-patient', function(e) {
    	_self.cardComponent._deletePendingPatient();
    });
  };

  _NS.SuggestionsSubComponent.prototype.addSuggestions = function() {
    var _self = this;
    var carePlanWrapper = _self.element.find('.js-suggested-care-plan-section');
    var taskWrapper = _self.element.find('.js-suggested-task-section');
    var vitalsWrapper = _self.element.find('.js-suggested-vitals-section');
    var assessmentWrapper = _self.element.find('.js-suggested-assessment-section');

    var otherSuggestions = _self.element.find('div.suggestions-section ul.other-suggestions');

	_self.cardComponent._disableInputsAndButtons(_self.cardComponent.element, null);

    $.getJSON('/clinical/alerts/smart/getalertsuggestions.xhtml', {
      alertId : _self.ALERT_ID
    })
    .done(function (data) {
      // NOTE: it is expected that data is sorted by suggestion_type_id and by item text meaning no sorting is needed on this end
      for(var i = 0; i < data.length; i++) {
        var tmpl = _self.checkboxTemplate.innerHTML;

        // Skip Care Pathways(6) for now
        if((data[i].suggestionTypeId >= _self.S_FOCUS && data[i].suggestionTypeId <= _self.S_TASK) || data[i].suggestionTypeId === _self.S_ASSESS) {
          tmpl = 
            tmpl.replace('{{checkbox_label}}', data[i].itemText)
            .replace('{{suggestion_type}}', data[i].suggestionTypeId)
            .replace('{{item_id}}', data[i].itemId)
            .replace('{{suggestion_id}}', data[i].suggestionId);

          if(data[i].actioned === true) {
            tmpl = $($.parseHTML(tmpl));
            tmpl.children('input').prop('disabled', true);
            tmpl.children('input').prop('checked', true);
            tmpl.attr('actioned', true);
            tmpl.removeClass('c-custom-checkbox');
            tmpl.addClass('c-custom-checkbox__disabled');
          }
          else  if( data[i].enabled === false) {
            tmpl = $($.parseHTML(tmpl));
            tmpl.children('input').prop('disabled', true);
            tmpl.children('input').prop('checked', false);
            tmpl.attr('dontenable', true);
            tmpl.removeClass('c-custom-checkbox');
            tmpl.addClass('c-custom-checkbox__disabled');
          }
          if(data[i].suggestionTypeId === _self.S_FOCUS || data[i].suggestionTypeId === _self.S_GOAL || data[i].suggestionTypeId === _self.S_INTERVENTION) {
            carePlanWrapper.append(tmpl);
          }
          else if(data[i].suggestionTypeId === _self.S_TASK) {
            taskWrapper.append(tmpl);
          }
          else if(data[i].suggestionTypeId === _self.S_ASSESS) {
            if(!_NS.moduleProps.canAssessAlerts || data[i].enabled === false) {
              if(data[i].actioned !== true) {
                tmpl = $($.parseHTML(tmpl));
                tmpl.children('input').prop('disabled', true);
                tmpl.children('input').prop('checked', false);
                tmpl.attr('dontenable', true);
                tmpl.removeClass('c-custom-checkbox');
                tmpl.addClass('c-custom-checkbox__disabled');
              }
              assessmentWrapper.append(tmpl);
            }
            else{
              var datePickerTmpl = _self.clinicalAssessmentDatePicker.innerHTML;
              if(data[i].actioned !== true) {
                /// already done above if actioned is true
                tmpl = $($.parseHTML(tmpl));
              }
              tmpl.find('input')
                  .addClass('js-show-hide-toggle')
                  .addClass('c-show-hide__toggle');
              datePickerTmpl = datePickerTmpl.replace(/{{id}}/g, _self.ALERT_ID)
                  .replace(/{{type}}/g, _self.ALERT_TYPE)
                  .replace(/{{suggestion}}/g, data[i].suggestionId)
                  .replace(/{{item_id}}/g, data[i].itemId);
              datePickerTmpl = $($.parseHTML(datePickerTmpl));
              datePickerTmpl.prepend(tmpl);
              assessmentWrapper.append(datePickerTmpl);
            }
          }
		}
		else if(data[i].suggestionTypeId === _self.S_PN) {
		  _self._suggestedPNText.push(data[i].itemText);
        }
        else if(data[i].suggestionTypeId === _self.S_OTHER) {
          var li = document.createElement('li');
          $(li).text(data[i].itemText);
          otherSuggestions.append(li);
        }
      }
      $(_self.cardComponent.element).attr('data-is-suggestions-retrieved', true);
    })
    .fail(function () {
      // TODO: What to do on failure -- nothing?
    })
    .always(function() {
	  _self.cardComponent.enableUnactionedInputsAndButtons(_self.cardComponent.element, null);
      _self._checkboxes = $(_self.element).find('label.c-custom-checkbox');
      
      _self.store.dispatch({
        type: 'FETCH_SUGGESTIONS_COMPLETE',
        payload: {
          id: _self.ALERT_ID,
          type: _self.ALERT_TYPE
        }
      });
    });
  };
  
  _NS.SuggestionsSubComponent.prototype._buildSmartAlertSaveActionVO = function(callback) {
    var element = $(this.cardComponent.element);
    var groupedAlertIds = element.data('groupedAlertIds');

    if(typeof groupedAlertIds == 'number') {
      groupedAlertIds = [groupedAlertIds];
    }
    else if(groupedAlertIds === '') {
      groupedAlertIds = [this.ALERT_ID];
    }
    else {
      groupedAlertIds = groupedAlertIds.split(',');
    }

    if(groupedAlertIds.indexOf(this.ALERT_ID) === -1)
    {
      groupedAlertIds.push(this.ALERT_ID);
    }

    var smartAlertSaveActionVO =  {
      clientId: this.ALERT_CLIENT_ID,
      alerts: {
        type: this.ALERT_TYPE,
        alertIds: groupedAlertIds
      }
    };
    
    var data = callback();
    smartAlertSaveActionVO.action = data.action;
    smartAlertSaveActionVO.progressNote = data.progressNote;
    smartAlertSaveActionVO.einteractAssessment = data.einteractAssessment;
    smartAlertSaveActionVO.carePlanItem = data.carePlanItem;
    smartAlertSaveActionVO.suggestionId = data.suggestionId;
    smartAlertSaveActionVO.systemAssessment = data.systemAssessment;

    return smartAlertSaveActionVO;
  };
  
  _NS.SuggestionsSubComponent.prototype._performMultiSave = function(clickedButton) {
    var _self = this;
    var card = $(_self.cardComponent.element);
    var wvType;

    var smartAlertSaveActionVOs = _self.getSmartAlertActionVOs();
    var voList = [];
    if(smartAlertSaveActionVOs.progressNoteSaveActionVO) {
      wvType = smartAlertSaveActionVOs.progressNoteSaveActionVO.progressNote.wvType;
      voList.push(smartAlertSaveActionVOs.progressNoteSaveActionVO);
    }
    if(smartAlertSaveActionVOs.eInteractAssessmentSaveActionVO) {
      voList.push(smartAlertSaveActionVOs.eInteractAssessmentSaveActionVO);
    }
    if(smartAlertSaveActionVOs.systemAssessVOs != null && smartAlertSaveActionVOs.systemAssessVOs.length > 0) {
      Array.prototype.push.apply(voList, smartAlertSaveActionVOs.systemAssessVOs);
    }
    if(smartAlertSaveActionVOs.carePlanItemVOs != null && smartAlertSaveActionVOs.carePlanItemVOs.length > 0) {
      Array.prototype.push.apply(voList, smartAlertSaveActionVOs.carePlanItemVOs);
    }

    _self.cardComponent._disableInputsAndButtons(_self.element, clickedButton);
    $.ajax({
      url: '/clinical/alerts/smart/saveActions.xhtml',
      data: JSON.stringify(voList),
      dataType: 'json',
      type: 'POST',
      contentType: 'application/json',
      success: function(data, textStatus, jqXHR) {
        var hasFailedActions = false;
        for(var i = 0; i < data.length; i++) {
          if(data[i].createProgressNote != null) {
            var pnId = data[i].createProgressNote.pnId;
            
            _self.resetPN();
            if(_NS.moduleProps.isESignatureForPNEnabled) {

              _self._eSignatureCarousel.previous(function() {
                $(':focus').blur();
                _self.element
                .find('input.js-input-esignature-password').removeClass('has-error').val('');
              });
              _self._resetFormStatusMessage('div.js-esignature-form-status-msg');
            }
            _self.element
              .find('div.js-create-pn-wrapper').removeClass('c-show-hide--is-active');
            
            if(pnId) {
              _self.element
                .find('label.pn-create').attr('actioned', true);
              
              if (card.data('clearAlertPermission') === true) {
                _self.cardComponent._clearFromUI();
              }
              else {
                var pnJSON = _self.cardComponent._getPnStructureFromCache(_self.ALERT_TYPE, wvType, pnId);
                if (pnJSON) {
                  var json = JSON.parse(pnJSON);
                  json.forEach(function(pn) {pn.pnId=pnId;});
                  _self.cardComponent._putPnStructureInCache(_self.ALERT_TYPE, wvType, pnId, JSON.stringify(json));
                }
                else {
                  $.getJSON('/clinical/alerts/smart/getpnsectiontext.xhtml', {
                    alertType: _self.ALERT_TYPE,
                    wvType: wvType,
                    pnId: pnId
                  })
                  .success(function(data) {
                    if (data && data.length > 0) {
                      _self.cardComponent._putPnStructureInCache(_self.ALERT_TYPE, wvType, data[0].pnId, JSON.stringify(data));
                    }
                  }.bind(this));
                }
                _self.updatePNSection(pnId);
              }
              _self.cardComponent.enableUnactionedInputsAndButtons(_self.cardComponent.element, clickedButton);
              _self.cardComponent._disableInputsAndButtons(_self.element.find('div.js-pn-interactive-section'), clickedButton);
            }
            else {
              hasFailedActions = true;

              _self._cleanPNCache();
            }
            
            _self.store.dispatch({
              type: 'CREATE_PROGRESS_NOTE_COMPLETE',
              payload: {
                id: _self.ALERT_ID,
                type: _self.ALERT_TYPE
              }
            });
          } 
          else if(data[i].createEInteractAssessment != null) {
            var assessId = data[i].createEInteractAssessment.assessId;

            _self.cardComponent.enableUnactionedInputsAndButtons(_self.cardComponent.element, clickedButton);
            // close checkbox and disable
            var wrapper = _self.element.find('div.js-assessment-create-wrapper');
            wrapper.removeClass('c-show-hide--is-active');
            if (assessId) {
              wrapper.children('label.c-custom-checkbox')
                .removeClass('c-custom-checkbox')
                .addClass('c-custom-checkbox__disabled')
                .attr('actioned', true)
                .children('input').prop('disabled', true);
              card.attr('data-assessment-linked', 'true');
            }
            else {
              hasFailedActions = true;
            }
          }
          else if(data[i].carePlan != null) {
            _self.cardComponent.enableUnactionedInputsAndButtons(_self.cardComponent.element, clickedButton);
            
            var suggestionWrapper = _self.element.find('div.js-suggested-care-plan-section, div.js-suggested-task-section');
            if(data[i].carePlan.created === true) {
              suggestionWrapper.children('label[data-suggestion-id=' + data[i].carePlan.suggestionId + '].c-custom-checkbox')
              .attr('actioned', true)
              .removeClass('c-custom-checkbox')
              .addClass('c-custom-checkbox__disabled')
              .children('input').prop('disabled', true);
            }
            else {
              hasFailedActions = true;
            }
          }
          else if(data[i].createSystemAssessment != null) {
            var systemTypeId = data[i].createSystemAssessment.systemTypeId;

            _self.cardComponent.enableUnactionedInputsAndButtons(_self.cardComponent.element, clickedButton);
            // close checkbox and disable
            var label = _self.element.find('div.js-assessment-create-wrapper > label[data-item-id="' + systemTypeId + '"]');
            label.parent().removeClass('c-show-hide--is-active');
            if (systemTypeId) {
              label.removeClass('c-custom-checkbox')
                .addClass('c-custom-checkbox__disabled')
                .attr('actioned', true)
                .children('input').prop('disabled', true);
              // TODO: below shouldn't be needed
              //card.attr('data-assessment-linked', 'true');
            }
            else {
              hasFailedActions = true;
            }
          }
        }
        
        _self.cardComponent.enableUnactionedInputsAndButtons(_self.cardComponent.element, clickedButton);
        if(hasFailedActions === true) {
          _self.uncheckAll();
          alert(_NS.moduleProps.failureMsgs.saveGeneral);
        }
        _self.toggleSaveCancelButtons(false);
      },
      error: function( jqXHR, textStatus, errorThrown ) {
        _self.createPNFailCallback();
      }
    });
  };
  
  _NS.SuggestionsSubComponent.prototype.validateEffectiveDate = function() {
    var _self = this;
    var now = Date.now();
    var isValid = true;

    // Assessment effective date can't be in the future
    for(var i = 0; i < _self._checkboxes.length; i++) {
      var checkbox = $(_self._checkboxes[i]);
      if(checkbox.parent().hasClass('js-einteract-assessment')) {
        if(this._parseDate(this._getEffectiveDate('.js-einteract-assessment')) > now) {
          this.element.find('.js-einteract-assessment .js-date-error').removeClass('u-hidden');
          isValid = false;
        }
        else {
          this.element.find('.js-einteract-assessment .js-date-error').addClass('u-hidden');
        }
      }
      else if(checkbox.parent().hasClass('js-system-assessment')) {
        var assessId = checkbox.attr('data-item-id');

        if(this._parseDate(_self._getEffectiveDate('#js-system-assessment-' + _self.ALERT_TYPE + '-' + _self.ALERT_ID + '-' + assessId)) > now) {
          this.element.find('#js-system-assessment-' + _self.ALERT_TYPE + '-' + _self.ALERT_ID + '-' + assessId + ' .js-date-error').removeClass('u-hidden');
          isValid = false;
        }
        else {
          this.element.find('#js-system-assessment-' + _self.ALERT_TYPE + '-' + _self.ALERT_ID + '-' + assessId + ' .js-date-error').addClass('u-hidden');
        }
      }
    }
    return isValid;
  };

  _NS.SuggestionsSubComponent.prototype._parseDate = function(effectiveDate) {
    var effectiveDateArr = effectiveDate.split(' ');
    var _date = effectiveDateArr[0];
    var _time = effectiveDateArr[1];
    var dateArr = _date.split('/');
    var timeArr = _time.split(':');

    var assessDate = new Date();
    assessDate.setMonth(dateArr[0] - 1, dateArr[1]);
    assessDate.setFullYear(dateArr[2]);
    assessDate.setHours(timeArr[0]);
    assessDate.setMinutes(timeArr[1]);
    assessDate.setSeconds(0);
    assessDate.setMilliseconds(0);

    return assessDate;
  };

  _NS.SuggestionsSubComponent.prototype._getEffectiveDate = function(parentSelector) {
      var datePicker = this.element.find(parentSelector + ' input[name="effective_date"]');
      var date = datePicker.attr('value');
      if(date[1] === '/') {
        date = '0' + date;
      }
      date += ' ' + this.element.find(parentSelector + ' select[name="hour"]').find(':selected').text();
      date += ':' + this.element.find(parentSelector + ' select[name="min"]').find(':selected').text();
      
      return date;
  };
  
  _NS.SuggestionsSubComponent.prototype.toggleSaveCancelButtons = function(show) {
    var element = $(this.element);
    if(show) {
      element.find('.js-button-save-interactive-suggestions').show();
      element.find('.js-button-cancel-interactive-suggestions').show();
    }
    else {
      element.find('.js-button-save-interactive-suggestions').hide();
      element.find('.js-button-cancel-interactive-suggestions').hide();
    }
  };
  
  
  _NS.SuggestionsSubComponent.prototype.setupProgressNote = function(data) {
    var _self = this;
    var element = $(_self.cardComponent.element);
    var alertText = (_self.ALERT_TYPE === 'CLINICAL') ? element.data('alertDescription') : element.data('wvPnDescription');
    if(element.data('autoPopulatePnDescription') === false){
      alertText = '';
    }
    var buttonsInvisible = parseInt(element.attr('data-pn-id')) > 0;
    
    var interactiveSection = _self.element.find('div.js-pn-interactive-section');
    for (var i = 0; i < data.length;i++) {
      var elem = data[i];
      var text = '';
      if (i === 0 && _self._suggestedPNText.length > 0) {
        text = _self._suggestedPNText.join('. ');
      }
      else {
        text = (elem.text1) ? elem.text1:(i > 0) ? '':alertText;
      }
      
      interactiveSection.append('<span><small>' + elem.description + '</small></span>');
      if (data.length>1) {
        interactiveSection.append('<textarea class=".u-mt-16 u-mb-16 u-mw" rows="3"' + (buttonsInvisible === true ? 'readonly':'') + '>' + text + '</textarea>');
      } else {
        interactiveSection.append('<textarea class=".u-mt-16 u-mb-16 u-mw" rows="5"' + (buttonsInvisible === true ? 'readonly':'') + '>' + text + '</textarea>');
      }
    }

    if (buttonsInvisible === false) {
      if (data && data.length > 0) {
        interactiveSection.find('textarea')[0].focus();
      }
    }
  };
  
  _NS.SuggestionsSubComponent.prototype.updatePNSection = function(pnId) {
    var element = $(this.cardComponent.element);
    element.attr('data-pn-id', pnId);

    if (pnId == 0) {
      element.find('.pn-view').hide();
      element.find('.pn-create').css('display','block');
    } else {
      element.find('.pn-create').hide();
      element.find('.pn-view').css('display','block');
    }

    var wrapper = element.find('div.js-create-pn-wrapper');
    wrapper.removeClass('c-show-hide--is-active');
    wrapper.find('input').prop('checked', false).end();
    
  };
  
  _NS.SuggestionsSubComponent.prototype.resetPN = function() {
    var interactiveSection = this.element.find('div.js-pn-interactive-section');
    interactiveSection.find('span').remove();
    interactiveSection.find('textarea').remove();
    $(this.cardComponent.element)
      .find('div.js-create-pn-wrapper')
      .find('input')
        .prop('checked', false)
        .end();
  };
  
  _NS.SuggestionsSubComponent.prototype._cleanPNCache = function() {
    var element = $(this.cardComponent.element);
    
    //clean cache
    var wvType = element.data('vitalType');
    var pnId = element.attr('data-pn-id');
    this.cardComponent._removePnStructureFromCache(this.ALERT_TYPE, wvType, pnId);
  };
  
  _NS.SuggestionsSubComponent.prototype.createPNFailCallback = function() {
    this._cleanPNCache();
    alert(_NS.moduleProps.failureMsgs.saveGeneral);
    this.store.dispatch({
      type: 'CREATE_PROGRESS_NOTE_COMPLETE',
      payload: {
        id: this.ALERT_ID,
        type: this.ALERT_TYPE
      }
    });
    
    location.reload();
  };
  
  _NS.SuggestionsSubComponent.prototype._toggleOtherChangeinConditionTextBox = function() {
    var select = $(this.element).find('select.chzn-select');
    if(select.val() != null && select.val().indexOf(_NS.moduleProps.cicOtherCICReasonId) >= 0) {
      $(this.element).find('.c-cic-other-symptoms').removeClass('u-hidden');
    }
    else {
      $(this.element).find('.c-cic-other-symptoms').addClass('u-hidden');
    }
  };
  
  _NS.SuggestionsSubComponent.prototype.resetAssessment = function() {
    var _self = this;
    var element = $(_self.element);
    if($(_self.cardComponent.element).attr('data-assessment-linked') === 'false') {
      element.find('div.js-assessment-create-wrapper')
      .find('label > input')
        .prop('checked', false)
        .end();
    }
  };
  
  _NS.SuggestionsSubComponent.prototype._inputHasError = function(target) {
    if (!$(target).val().trim()) return true;
  };
  
  _NS.SuggestionsSubComponent.prototype._inputShowError = function(target) {
    $(target).addClass('has-error');
  };
  
  _NS.SuggestionsSubComponent.prototype._inputRemoveError = function(target) {
    $(target).removeClass('has-error');
  };  
  
  _NS.SuggestionsSubComponent.prototype._validateInput = function(jqInput, doFocus) {
    if (this._inputHasError(jqInput)) {
      this._inputShowError(jqInput);
      if(doFocus) jqInput.focus();
      return false;
    }
    this._inputRemoveError(jqInput);
    return true;
  };
  
  _NS.SuggestionsSubComponent.prototype._resetFormStatusMessage = function(selector) {
    $(this.element).find(selector)
      .removeClass('c-form__status-msg--has-error')
      .empty();
  };
  
  _NS.SuggestionsSubComponent.prototype._setFormStatusMessage = function(selector, text, hasError) {
    hasError = typeof hasError !== 'undefined' ? hasError : false;
    $(this.element).find(selector)
      .toggleClass('c-form__status-msg--has-error', hasError)
      .text(text);
  };
  
}());
