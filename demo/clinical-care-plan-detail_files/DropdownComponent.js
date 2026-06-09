'use strict';

function capitalize(s) {
	if (typeof s !== 'string') return '';
	return s.charAt(0).toUpperCase() + s.slice(1);
}

(function(){
	window.clinicalSmartAlerts = window.clinicalSmartAlerts || {};
	var _NS = clinicalSmartAlerts;

	_NS.DropdownComponent = function(selector, data) {
		this.selector = selector;
		this.element = document.querySelector(selector);
		this._type = $(this.element).data('type');
		this._value = { id: null, label: null };
		this._data = data;
		this._populate();
		this._initHandlers();
	};

	_NS.DropdownComponent.prototype = {
		_populate: function() {
			var container = $(this.element).find('.js-dropdown-content'),
				frag = document.createDocumentFragment();
			
			this._data.forEach(function(elem){				
				var li = document.createElement('li'),
					a = document.createElement('a'),
					textNode = document.createTextNode(elem[this._type + 'Desc']);
				
				a.setAttribute('href', '#');
				a.setAttribute('data-option', elem[this._type + 'Id']);
				a.appendChild(textNode);
				li.appendChild(a);
				frag.appendChild(li);
			}.bind(this));
			
			container.append(frag);
		}, 
		_initHandlers: function() {
			$(document).on('click', this.selector + ' .js-dropdown-trigger', function(e) {
				$('.js-dropdown').not($(this.element)).find('.js-dropdown-content').hide();
				$('.js-dropdown').not($(this.element)).find('.js-multiselectdropdown-content').hide();
				$(this.element).find('.js-dropdown-content').toggle();
				
				$(document).on('click.dropdown', function(e) {
					var container = $('.js-dropdown');
					if (!container.is(e.target) && container.has(e.target).length == 0) {
						container.find('.js-dropdown-content').hide();
						$(document).off('click.dropdown');
					}
				});
				e.preventDefault();
			}.bind(this));
			
			$(document).on('click', this.selector + ' .js-dropdown-content li a', function(e) {
				var id = $(e.target).data('option'),
					label = $(e.target).text();
				
				$(this.element).find('.js-dropdown-content').hide();
				if (id !== this.getValue().id) {			
					this.setValue(id, label);
				}
				e.preventDefault();
			}.bind(this));
		},
		
		getValue: function() {
			return this._value;
		},
		
		setValue: function(id, label) {
			this._value = {id: id, label: label};
			$(this.element).find('.js-dropdown-trigger')
				.data('option', id)
				.text(label);
		},

		reset: function() {
			var elem = $(this.element).find('.c-dropdown-option-all');
			var id = elem.data('option');
			var label = elem.text();
			this.setValue(id, label);
		},
	};
}());