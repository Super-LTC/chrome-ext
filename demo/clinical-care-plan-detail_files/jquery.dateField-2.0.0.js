/* 
 * dateField
 * This jQuery plugin will apply the jQuery UI inline date object
 * and all applicable logic and transformations between the external and internal formats.
 * 
 * NOTE: This plugin only works on text inputs.
 * 
 * Version 2.0.0
 * 
 * Copyright (c) 2016 PointClickCare.
 * All rights reserved.
 *
 * This software is the confidential and proprietary information of PointClickCare
 * Technologies, Inc. ("Confidential Information").  You shall not disclose
 * such Confidential Information and shall use it only in accordance with
 * the terms of the license agreement you entered into with PointClickCare.
 * 
 * Usage is identical to jQueryUI datepicker, see https://api.jqueryui.com/datepicker/
 * Will also automatically run with default options on any fields with the pccDateField class
 * 
 * Sample Usage:
 * $('#effective_date').dateField({disabled: true});
 *   
 * Features:
 * - Combines a visible (dummy) and hidden (real) input field with a visual calendar datepicker (currently jQuery UI) 
 * 
 * Important Notes:
 * - This plugin only works on text inputs.
 * - This plugin requires jQuery UI 1.7.3 or higher
 * - This plugin adds the class "pccDateField" to the input(s) it is applied on
 *
 */

;(function($, window, undefined){
	var userDateFormat = PCC.l10n.dateTime.userDateFormatHint || 'MM/DD/YYYY';//default to US standard if PCC format not available
	//Adjust format to suit jQueryUI format: https://api.jqueryui.com/datepicker/
	//Convert 'yyyy' to 'yy', and 'MM' to 'mm': e.g. 'MM/dd/yyyy' becomes 'mm/dd/yy', 'dd/MM/yyyy' becomes 'dd/mm/yy'
	var jQueryUserDateFormat = userDateFormat.toLowerCase().replace('yyyy', 'yy');
	var userFirstDayOfWeek = 0;//0=Sunday, 1=Monday (JavaScript days are ZeroIndexed from Sunday
	if(typeof(PCC.l10n.dateTime.firstDayOfWeek) != 'undefined'){
		userFirstDayOfWeek = PCC.l10n.dateTime.firstDayOfWeek - 1;//Java's days of the week are OneIndexed java.util.Calendar.SUNDAY = 0
	}
	//Append to the "Today" button functionality to actually select today's date as the user expects
	var original_gotoToday = $.datepicker._gotoToday;
	$.datepicker._gotoToday = function(id){
		var target = $(id);
		original_gotoToday.call(this, id);//move calendar to today's month/year
		target.datepicker('setDate', new Date());//actually set today's date, and trigger setting of the alternate field
		target.datepicker('hide');//dismiss the widget
		target.change();//trigger any change handlers
	}

	$(document).ready(function(){
		//Auto-wire date fields that have the pccDateField class set
		$('input.pccDateField').each(function(){
			$(this).dateField();
		});
	});

	var defaultOptions = {
		dateFormat:jQueryUserDateFormat,
		showOn:'button',
		buttonImage:'/assets/core/images/icon-calendar.png',
		buttonImageOnly:true,
		buttonText:'',
		constrainInput:true,
		firstDay:userFirstDayOfWeek,
		showAnim:'fadeIn',
		showButtonPanel:true,
		changeMonth:true,
		changeYear:true,
		duration:'fast',
		yearRange: '-110:+10'
	};

	$.fn.dateField = function(options){
		if(this.length == 0){return this;}

		function pad(number){
			if(number < 10){
				return '0' + number;
			}
			return number;
		}
		function getDateBits(dateStr){
			var dateBits = dateStr.split(/[\/-]/);
			var dateBit;
			for(var i=0;i<dateBits.length;i++){
				dateBit = Number(dateBits[i]);
				dateBits[i] = dateBit;
			}
			return dateBits;
		}
		function areDatesEqual(aDate, bDate){
			//compare 2 date strings in the same format (e.g. MM/DD/YYYY) compensating for partial/lazy dates like 7/14/2017 vs 07/14/2017
			if((aDate == null || aDate == '') && (bDate == null || bDate == '')){
				//special case of 2 empty dates (thus they are equal)
				return true;
			}
			if(typeof(aDate) != 'string' || typeof(bDate) != 'string'){
				return false;
			}
			var aDateBits = getDateBits(aDate);
			var bDateBits = getDateBits(bDate);
			var areEqual = false;
			//both must have a length of 3
			if(aDateBits.length == 3 && bDateBits.length == 3){
				for(var i=0;i<aDateBits.length;i++){
					if(aDateBits[i] != bDateBits[i]){
						return areEqual;
					}
				}
				areEqual = true;
			}
			return areEqual;
		}
		function extendOptions(dst){
			for(var i=1;i<arguments.length;i++){
				var src = arguments[i];
				for(var k in src){
					if(methods.hasOwnProperty(k) && 'function' === typeof src[k]){
						dst[k] = (function (methodName, src){
							return function(){
								methods[methodName].apply(this, arguments);
								src[methodName].apply(this, arguments);
							}
						})(k, src);
					} else {
						dst[k] = src[k];
					}
				}
			}
			return dst;
		}

		// These methods cannot be overridden
		// If a user specifies these in datePickerUserOptions, these methods will still be called first
		// Default methods which CAN be overridden should be specified in defaultOptions
		var methods = {
			beforeShow:function(input, inst){
				valueOnShow = this.value;
				//Remove secondary styling on today button (1 of 2) on initial show
				setTimeout(function(){
					$(input).datepicker('widget').find('.ui-datepicker-buttonpane').find('button[data-handler="today"]').removeClass('ui-priority-secondary').addClass('ui-priority-primary');
				}, 1);
			},
			//Remove secondary styling on today button (2 of 2) on month change
			onChangeMonthYear:function(year, month, widgetInstance){
				setTimeout(function(){
					$(widgetInstance).datepicker('widget').find('.ui-datepicker-buttonpane').find('button[data-handler="today"]').removeClass('ui-priority-secondary').addClass('ui-priority-primary');
				}, 1);
			},
			onClose:function(dateText, inst){
				//onClose
			},
			onSelect:function(dateText, inst){
				if(!areDatesEqual(valueOnShow, dateText)){
					$(this).change();// Make sure change gets fired on the input
				}
			}
		};

		var valueOnShow;
		var datePickerOptions = $.extend({}, defaultOptions, methods);

		if(arguments[0] && arguments[0].constructor !== Object){
			if(arguments[0] === 'option'){
				if(arguments[1] !== undefined){
					var options = {};
					if(arguments[1].constructor === Object){
						extendOptions(options, arguments[1]);
					} else if(arguments[1].constructor === String){
						if(arguments[2] !== undefined){
							var option = {};
							option[arguments[1]] = arguments[2];
							extendOptions(options, option);
						} else {
							return $(this).datepicker('option', arguments[1]);
						}
					}
					// Fix for jqueryUI bug: setting disabled option does not work
					// use enable/disable methods instead
					if(options.hasOwnProperty('disabled')){
						if(options['disabled']){
							$(this).datepicker('disable');
						} else {
							$(this).datepicker('enable');
						}
						delete options['disabled'];
					}
					return $(this).datepicker('option', options);
				} else {
					return $(this).datepicker('option');
				}
			} else {
				return $(this).datepicker.apply(this, 'option', [arguments[1], arguments[2]]);
			}
		} else {
			if(arguments[0] && arguments[0].constructor === Object){
				//apply options
				$(this).datepicker('option', datePickerOptions);
			}
			return this.each(function(){
				//Apply only to text input box
				if(!$(this).is('input:text')){
					return;
				}
				if($(this).data('dateFieldConfigured')){
					return this;
				} else {
					$(this).addClass('pccDateField');
					$(this).attr('size', 10);//likely already set, but reset regardless
					$(this).attr('maxlength', 10);//likely already set, but reset regardless
					//POSSIBLE FUTURE: $(this).attr('inputmode', 'numeric');//for touch based devices that support proper keyboard hints, while avoiding the type="number" bug in Chrome

					//get the alternate (hidden) field reference (as strictly as possible: By ID, By Name, By previous of type)
					var visibleField = this;
					var alternateField = null;
					var thisID = this.id;
					var thisName = this.name;
					if(thisID && thisID != '' && (thisID.indexOf('_dummy') != -1)){
						var altFieldID = thisID.replace('_dummy', '').replace(/\./g, '\\.').replace(/\[/g, '\\[').replace(/\]/g, '\\]');//escape ".[]" in spring generated IDs
						alternateField = $('#' + altFieldID);
					} else if(thisName && thisName != '' && (thisName.indexOf('_dummy') != -1)){
						var altFieldName = (this.name).replace('_dummy', '').replace(/\./g, '\\.').replace(/\[/g, '\\[').replace(/\]/g, '\\]');//escape ".[]" in spring generated Names
						alternateField = $('input[name=' + altFieldName + ']');
						if(alternateField.length > 1){
							//if there is more than 1 input with the applicable name, grab the first, closest sibling
							alternateField = $(this).siblings('input[name=' + altFieldName + ']').first();
						}
					} else {
						//Although this may work, the field should have a Name and or ID
						alternateField = $(this).prev('input[type=hidden]');
						if(alternateField.length != 1){
							//We are only accepting this reference if the immediately preceding element is a hidden input
							alternateField = null;
						}
					}
					if(alternateField){
						datePickerOptions.altField = alternateField;
						datePickerOptions.altFormat = 'mm/dd/yy';//The jQuery UI format that is Equivalent to the Java 'MM/dd/yyyy' format
					}
					//TODO: Realistically at this point if BOTH fields are not found, we should throw an error!

					//Apply any specific settings defined on this field
					var minDate = $(this).attr('data-min-date');
					var maxDate = $(this).attr('data-max-date');
					if(minDate){
						minDate = minDate.trim();
						if(minDate.length == 10){
							//convert from internal US format to the display format (may be different)
							datePickerOptions.minDate = PCC.l10n.dateTime.internalDateToUserDate(minDate);
						}
					}
					if(maxDate){
						maxDate = maxDate.trim();
						if(maxDate.length == 10){
							//convert from internal US format to the display format (may be different)
							datePickerOptions.maxDate = PCC.l10n.dateTime.internalDateToUserDate(maxDate);
						}
					}
					//Is there an onchange event handler specified
					var onChangeHandler = $(this).attr('data-ondatechange');

					//expose API methods to developers
					var dateField = {
						//TODO: do we want to expose this only to pass in a date object?
						setValue:function(value, triggerChangeEvent){//in PCC internal format MM/DD/YYYY
							$(this.visibleField).data("previousValue", $(this.alternateField).val());
							var userValue = null;
							if(value != null && value != ''){
								userValue = PCC.l10n.dateTime.internalDateToUserDate(value);
							}
							//does the date need to be set?
							var currentDate = $(this.visibleField).datepicker('getDate');
							var currentDateAsMMDDYYYYString = '';
							if(currentDate != null){
								currentDateAsMMDDYYYYString = currentDate.toMMDDYYYYString();
							}
							if(!areDatesEqual(currentDateAsMMDDYYYYString, value)){//compare as PCC internal formatted values
								$(this.visibleField).datepicker('setDate', userValue);//set via datepicker to ensure alt field is kept in sync
								if(triggerChangeEvent){
									$(this.visibleField).change();//trigger onchange handler (if any)
								}
							}
						},
						setValueToToday:function(triggerChangeEvent){
							var today = new Date();
							this.setValue(today.toMMDDYYYYString(), triggerChangeEvent);//get in PCC internal format MM/DD/YYYY
						},
						clearValue:function(triggerChangeEvent){
							this.setValue(null, triggerChangeEvent);
						},
						getValue:function(){
							return $(this.alternateField).val();
						},
						setEnabled:function(state){
							var dateState = state ? 'enable' : 'disable';
							$(this.visibleField).dateField().datepicker(dateState);
						},
						setMinDate:function(minDate){//in PCC internal format MM/DD/YYYY
							minDate = minDate || null;
							if(minDate != null){
								minDate = PCC.l10n.dateTime.internalDateToUserDate(minDate);
							}
							$(this.visibleField).dateField('option', 'minDate', minDate);
						},
						setMaxDate:function(maxDate){//in PCC internal format MM/DD/YYYY
							maxDate = maxDate || null;
							if(maxDate != null){
								maxDate = PCC.l10n.dateTime.internalDateToUserDate(maxDate);
							}
							$(this.visibleField).dateField('option', 'maxDate', maxDate);
						},
						visibleField:visibleField,
						alternateField:alternateField
					}

					$(this).data().dateField = dateField;
					if(alternateField){
						alternateField.data().dateField = dateField;
					}

					//Apply jQuery UI calendar
					$(this).datepicker(datePickerOptions);

					$(this).on('input', function(){
					// commenting out for now as this interferes with the change event in IE
					//	//triggered on any input, but specifically used to capture drag/drop of text (which is what the filter below is for)
					//	var val = this.value;
					//	//filter out invalid characters
					//	var validChars = val.replace(/[^0-9\/\-\.]/g, '');
					//	this.value = validChars;
					});
					$(this).on('focus', function(){
						//TODO: determine if we want to provide visual helpers
						if(alternateField){
							$(this).data("previousValue", alternateField.val());
						}
					});
					$(this).on('paste', function(){
						var element = this;
						//delay a tiny bit (100ms) to ensure we actually get the pasted value
						setTimeout(function(){
							var val = $(element).val();
							//filter out invalid characters
							var validChars = val.replace(/[^0-9\/\-\.]/g, '');
							element.value = validChars;
							//TODO: this cleans up the value, but does not trigger a change event (in IE) which is needed to set the hidden field if this is a full date
						}, 100);
					});
					$(this).on('change', function(){
						var val = this.value;
						//format the value nicely (add missing parts, clamp & pad)
						var newValue = PCC.l10n.dateTime.userDateFormat(val);
						if(newValue != ''){
							//we now have a date we want to use
							this.value = newValue;
							//if we got here, the associated hidden field will NOT be correctly populated
							if(alternateField){
								alternateField.val(PCC.l10n.dateTime.userDateToInternalDate(newValue));
							}
						} else {
							//we can't decisively parse this date, we need to wipe it out
							this.value = '';
							//empty field, clear alternateField if it exists
							if(alternateField){
								alternateField.val('');
							}
						}
						//trigger change event handler (if defined)
						if(onChangeHandler){
							//only fire if a "true" change of date value occurred...
							var previousValue = $(this).data("previousValue");
							var newValue = alternateField.val();
							if(!areDatesEqual(previousValue, newValue)){
								if(typeof(window[onChangeHandler]) == 'function'){
									window[onChangeHandler].call($(this).data().dateField, {
										"fieldName":alternateField.attr('name') || '',
										"fieldID":alternateField.attr('id') || '',
										"fieldValue":alternateField.val()
										//"previousValue":$(this).data("previousValue")
									});
								}
							}
						}
					});
					$(this).on('blur', function(){
						////WARNING: Do not reset the date here, it will cause all (odd) calendar clicks to fail
					});
					$(this).on('keydown', function(){
						$(this).datepicker('hide');
					});
					//flag this as configured
					$(this).data('dateFieldConfigured', true);
				}
			});
		}
	};
})(jQuery, window);

//Expose JS constructor
PCC.l10n.dateTime.createDateWidget = function(container, options){
	if(container && options){
		var fieldID = options.id || '';
		var fieldName = options.name || '';
		if((fieldID != '') || (fieldName != '')){
			var dummyFieldName = fieldName != '' ? fieldName + '_dummy' : '';
			var dummyFieldID = fieldID != '' ? fieldID + '_dummy' : '';
			var dataOnDateChangeAttribute = '';
			if(options.ondatechange && options.ondatechange != ''){
 				dataOnDateChangeAttribute = ' data-ondatechange="' + options.ondatechange + '"';
			}

			//create hidden field
			var alternateField = $('<input type="hidden" name="' + fieldName + '" id="' + fieldID + '" value=""/>');

			//create visible field
			var visibleField = $('<input type="text" class="pccDateField" name="' + dummyFieldName + '" id="' + dummyFieldID + '" size="10" maxlength="10" ' + dataOnDateChangeAttribute + '/>');

			//add the hidden field then the visible field
			$(container).append(alternateField);
			$(container).append(visibleField);

			//initialize it
			$(visibleField).dateField();

			//update any settings
			if(options.value && options.value != ''){
				$(visibleField).data().dateField.setValue(options.value);
			}
			if(options.minDate && options.minDate != ''){
				$(visibleField).data().dateField.setMinDate(options.minDate);
			}
			if(options.maxDate && options.maxDate != ''){
				$(visibleField).data().dateField.setMaxDate(options.maxDate);
			}
			if(options.disabled === true){
				$(visibleField).data().dateField.setEnabled(false);
			}
		}
	}
};