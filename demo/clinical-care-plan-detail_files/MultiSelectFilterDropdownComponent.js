'use strict';

(function(){
	window.clinicalSmartAlerts = window.clinicalSmartAlerts || {};
	var _NS = clinicalSmartAlerts;

	_NS.MultiSelectFilterDropdownComponent = function(selector, data) {
		this.selector = selector;
		this.element = document.querySelector(selector);
		this._type = $(this.element).data('type');
		this._value = new Array() ;
		this._data = data;
		this._populate();
		this._initHandlers();
		this.allArray = ['All'];
	};

	_NS.MultiSelectFilterDropdownComponent.prototype = {

		_getLocalizedName: function (category) {
			switch(category) {
				case 'Clinical Alert':
					return _NS.moduleProps.termMap.clinicalAlert;
				case 'Complex Alert':
					return _NS.moduleProps.termMap.complexAlert;
				case 'Order Alert':
					return _NS.moduleProps.termMap.orderAlert;
				case 'High Risk Alert':
					return _NS.moduleProps.termMap.highRiskAlert;
				case 'Inbound Clinical Alert':
					return _NS.moduleProps.termMap.inboundClinicalAlert;
				case 'Pending Patient Approval':
					return _NS.moduleProps.termMap.pendingPatientApproval.replace(/\{0\}/g, _NS.moduleProps.termMap.clientTerm);
				case 'Vital Exception':
					return _NS.moduleProps.termMap.vitalExceptionAlert;
				case 'eINTERACT Stop And Watch':
					return 'eINTERACT Stop & Watch';
				case 'Vital Exception':
					return _NS.moduleProps.termMap.vitalExceptionAlert;
				default:
					return category;
			}
		},


		_createLi: function (option) {
			var li = document.createElement('li'),
				label = document.createElement('label'),
				checkbox = document.createElement('input'),
				textNode = document.createTextNode(this._getLocalizedName(option));
			checkbox.setAttribute('type', 'checkbox');
			checkbox.setAttribute('name', option);
			li.setAttribute("style", "display:table; padding:0 6px; width:100%")
			label.appendChild(textNode);
			li.appendChild(checkbox);
			li.appendChild(label);
			return li;
		},

		_populate: function() {
			$(this.element).find('.js-multiselectdropdown-content').hide();
			var container = $(this.element).find('.js-multiselectdropdown-content'),
				frag = document.createDocumentFragment();

			var __li= this._createLi(_NS.moduleProps.termMap.all);
			frag.appendChild(__li);

			this._data.forEach(function(elem){
				var __li = this._createLi(elem);
				frag.appendChild(__li);
			}.bind(this));

			container.append(frag);
		},

		_initHandlers: function() {
			$(document).on('click', this.selector + ' .js-dropdown-trigger', function(e) {
				$('.js-dropdown').not($(this.element)).find('.js-dropdown-content').hide();
				$(this.element).find('.js-multiselectdropdown-content').toggle();

				$(document).on('click.dropdown', function(e) {
					var container = $('.js-dropdown');
					if (!container.is(e.target) && container.has(e.target).length == 0) {
						container.find('.js-multiselectdropdown-content').hide();
						$(document).off('click.dropdown');
					}
				});
				e.preventDefault();
			}.bind(this));

			$(document).on('click', this.selector + ' .js-multiselectdropdown-content li label', function(e) {
				$(e.target).prev().click();
				e.preventDefault();
			}.bind(this));

			$(document).on('click', this.selector + ' .js-multiselectdropdown-content li input', function(e) {
				this._clickCheckbox($(e.target));
			}.bind(this));

			this._clickCheckbox = this._clickCheckbox.bind(this);
		},

		_clickCheckbox : function(target) {
			var label = target.attr('name');
			if (label === _NS.moduleProps.termMap.all) {
				this._data.forEach(function (elem) {
					var cbox = $(document).find('.js-multiselectdropdown-content').find("input:checkbox[name='" + elem + "']")
					if (target.is(':checked') !== cbox.is(':checked')) {
						$(document).find('.js-multiselectdropdown-content').find("input:checkbox[name='" + elem + "']").click();
					}
				});
			} else {
				var all = $(document).find('.js-multiselectdropdown-content').find("input[name='All']");
				if (!(target.is(':checked')) && all.is(':checked')) {
					all.prop('checked', false);
				}
				this.setValue();
			}
		},

		selectValues: function(values) {
			this._value = values;

			var elem = $(this.element);
			elem.find('.js-multiselectdropdown-content').find("input:checkbox:checked").click();
			for (var i = 0; i < values.length; i++) {
				var chkbx = elem.find('.js-multiselectdropdown-content').find("input:checkbox[name='" + values[i] + "']");
				chkbx.click();
				// Need to trigger onclick event manually (for the All case to select all the checkboxes)
				if (values[i] === 'All') {
					this._clickCheckbox(chkbx);
				}
			}
			this.setValue();
		},

		getValue: function() {
			if(this._value.length === this._data.length){
				return this.allArray;
			}
			 return this._value;
		},

        isMSFilterExpanded: function() {
            return ($(this.element).find('.js-multiselectdropdown-content').is(':visible'))
        },

		setValue: function() {
			var arr = new Array();
			($(this.element).find('.js-multiselectdropdown-content').find("input:checkbox:checked")).each(function(){
				var text = $(this).attr('name');
				if(text !== _NS.moduleProps.termMap.all) {
                    arr.push(text);
                }
			});

			var all = $(document).find('.js-multiselectdropdown-content').find("input[name='All']");
			if(arr.length === this._data.length && !all.is(':checked')){
				all.prop('checked', true);
			}

			this._value = arr
			var label;
			if(this._value.length > 1) {
				label = _NS.moduleProps.termMap.multipleSelected;
			}
			else if (this._value.length === 1) {
				label = this._getLocalizedName(this._value[0]);
			}
			else {
				label =  _NS.moduleProps.termMap.selectCategory;
			}
			$(this.element).find('.js-dropdown-trigger')
				.text(label);
		}
	};
}());