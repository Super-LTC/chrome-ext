'use strict';

var MDWC = {};

(function(_NS) {
	function _closestPolyfill() {
		if (!Element.prototype.matches) {
			Element.prototype.matches = Element.prototype.msMatchesSelector
					|| Element.prototype.webkitMatchesSelector;
		}

		if (!Element.prototype.closest) {
			Element.prototype.closest = function(s) {
				var el = this;

				do {
					if (el.matches(s))
						return el;
					el = el.parentElement || el.parentNode;
				} while (el !== null && el.nodeType === 1);
				return null;
			};
		}
	}

	function _customEventPolyfill() {
		if (typeof window.CustomEvent === 'function')
			return false;

		function CustomEvent(event, params) {
			params = params || {
				bubbles: false,
				cancelable: false,
				detail: null
			};
			var evt = document.createEvent('CustomEvent');
			evt.initCustomEvent(event, params.bubbles, params.cancelable,
					params.detail);
			return evt;
		}

		CustomEvent.prototype = window.Event.prototype;
		window.CustomEvent = CustomEvent;
	}

	function _arrayFindPolyfill() {
		
		if (!Array.prototype.findIndex) {
			Object.defineProperty(Array.prototype, 'findIndex', {
				value: function(predicate) {
					if (this == null) {
						throw new TypeError('"this" is null or not defined');
					}

					var o = Object(this);
					var len = o.length >>> 0;

					if (typeof predicate !== 'function') {
						throw new TypeError('predicate must be a function');
					}

					var thisArg = arguments[1];
					var k = 0;
					while (k < len) {
						var kValue = o[k];
						if (predicate.call(thisArg, kValue, k, o)) {
							return k;
						}
						k++;
					}

					return undefined;
				},
				configurable: true,
				writable: true
			});
		}

		if (!Array.prototype.find) {
			Object.defineProperty(Array.prototype, 'find', {
				value: function(predicate) {
					if (this == null) {
						throw new TypeError('"this" is null or not defined');
					}

					var o = Object(this);
					var len = o.length >>> 0;

					if (typeof predicate !== 'function') {
						throw new TypeError('predicate must be a function');
					}

					var thisArg = arguments[1];
					var k = 0;
					while (k < len) {
						var kValue = o[k];
						if (predicate.call(thisArg, kValue, k, o)) {
							return kValue;
						}
						k++;
					}

					return undefined;
				},
				configurable: true,
				writable: true
			});
		}

		if (!Array.prototype.includes) {
			Object.defineProperty(Array.prototype, 'includes', {
				value: function(value) {
					if (this == null) {
						throw new TypeError('"this" is null or not defined');
					}
					var o = Object(this);
					var len = o.length >>> 0;
					var thisArg = arguments[1];
					var predicate = function (e) { return e === value; };
					var k = 0;

					while (k < len) {
						var kValue = o[k];
						if (predicate.call(thisArg, kValue)) {
							return true;
						}
						k++;
					}

					return false;
				},
				configurable: true,
				writable: true
			});
		}
	}
	
	function _nodeListForEachPolyfill() {
	  if (window.NodeList && !NodeList.prototype.forEach) {
	    NodeList.prototype.forEach = Array.prototype.forEach;
	  }
	}

	(function polyfill() {
		_closestPolyfill();
		_customEventPolyfill();
		_arrayFindPolyfill();
		_nodeListForEachPolyfill();
	})();

	function isObject(obj) {
		return (obj !== null && Object.prototype.toString.call(obj).slice(8, -1) === 'Object');
	}

	function hasProperty(obj, property) {
		return isObject(obj) && obj.hasOwnProperty(property);
	}

	function hasPropertyAndIsTruthy(obj, property) {
		return hasProperty(obj, property) && obj[property];
	}

	function hasPropertyAndIsNotEmpty(obj, property) {
		if (hasProperty(obj, property) && obj[property] !== null) {
			var prop = obj[property], propPrototype = Object.prototype.toString.call(prop).slice(8, -1);
			switch (propPrototype) {
				case 'Array':
					return prop.length > 0;
				case 'String':
					return prop.trim().length > 0;
				case 'Object':
					return Object.keys(prop).length > 0;
				default:
					return true;
				}
		}
		return false;
	}

	function sortArray(arr, direction, key) {
		if (!Array.isArray(arr)) return null;
		return arr.concat()
			.sort(function(a, b) {
				if (key	&& (!hasProperty(a, key) || !hasProperty(b,	key)))
					return 0;

				var sortA = key ? a[key] : a, 
					sortB = key ? b[key] : b, 
					comparison = 0;	

				if (sortA > sortB || (sortB === null && typeof sortA === 'string')) {
				  comparison = 1;
			  } else if (sortA < sortB || (sortA === null && typeof sortB === 'string')) {
			    comparison = -1;
			  }
				
				return direction == 'desc' ? comparison * -1 : comparison;
			});
	}

	function mutate(obj, src) {
		if (!isObject(obj))	return;
		Object.keys(src).forEach(function(key) {
			obj[key] = src[key];
		});
		return obj;
	}

	function extend() {
		var extended = {}, deep = false, i = 0;

		if (Object.prototype.toString.call(arguments[0]) === '[object Boolean]') {
			deep = arguments[0];
			i++;
		}

		var merge = function(obj) {
			for (var prop in obj) {
				if (obj.hasOwnProperty(prop)) {
					if (deep && isObject(obj[prop])) {
						extended[prop] = extend(true, extended[prop], obj[prop]);
					} else {
						extended[prop] = obj[prop];
					}
				}
			}
		};

		for (; i < arguments.length; i++) {
			merge(arguments[i]);
		}
		return extended;
	}

	var CHARACTERS = '0123456789ABCDEF'.split('');
	var FORMAT = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.split('');
	function generateId() {
		var c = CHARACTERS, id = FORMAT, r;

		id[0] = c[(r = Math.random() * 0x100000000) & 0xf];
		id[1] = c[(r >>>= 4) & 0xf];
		id[2] = c[(r >>>= 4) & 0xf];
		id[3] = c[(r >>>= 4) & 0xf];
		id[4] = c[(r >>>= 4) & 0xf];
		id[5] = c[(r >>>= 4) & 0xf];
		id[6] = c[(r >>>= 4) & 0xf];
		id[7] = c[(r >>>= 4) & 0xf];

		id[9] = c[(r = Math.random() * 0x100000000) & 0xf];
		id[10] = c[(r >>>= 4) & 0xf];
		id[11] = c[(r >>>= 4) & 0xf];
		id[12] = c[(r >>>= 4) & 0xf];
		id[15] = c[(r >>>= 4) & 0xf];
		id[16] = c[(r >>>= 4) & 0xf];
		id[17] = c[(r >>>= 4) & 0xf];

		id[19] = c[((r = Math.random() * 0x100000000) & 0x3) | 0x8];
		id[20] = c[(r >>>= 4) & 0xf];
		id[21] = c[(r >>>= 4) & 0xf];
		id[22] = c[(r >>>= 4) & 0xf];
		id[24] = c[(r >>>= 4) & 0xf];
		id[25] = c[(r >>>= 4) & 0xf];
		id[26] = c[(r >>>= 4) & 0xf];
		id[27] = c[(r >>>= 4) & 0xf];

		id[28] = c[(r = Math.random() * 0x100000000) & 0xf];
		id[29] = c[(r >>>= 4) & 0xf];
		id[30] = c[(r >>>= 4) & 0xf];
		id[31] = c[(r >>>= 4) & 0xf];
		id[32] = c[(r >>>= 4) & 0xf];
		id[33] = c[(r >>>= 4) & 0xf];
		id[34] = c[(r >>>= 4) & 0xf];
		id[35] = c[(r >>>= 4) & 0xf];

		return id.join('');
	}
	function sanitize(strObj) {
		var lt = /</g,
			gt = />/g,
			ap = /'/g,
			ic = /"/g;
		if (strObj) {
			return strObj.toString()
				.replace(lt, "&lt;")
				.replace(gt, "&gt;")
				.replace(ap, "&#39;")
				.replace(ic, "&#34;");
		}
		return strObj;
	}
	function unSanitize(strObj) {
		var lt = /&lt;/g,
			gt = /&gt;/g,
			ap = /&#39;|&apos;/g,
			ic = /&#34;|&quot;/g;
		if (strObj) {
			return strObj.toString()
				.replace(lt, "<")
				.replace(gt, ">")
				.replace(ap, "'")
				.replace(ic, "\"");
		}
		return strObj;
	}

	mutate(_NS, {
		name: 'MDWC',
		utils: {
			isObject: isObject,
			hasProperty: hasProperty,
			hasPropertyAndIsTruthy: hasPropertyAndIsTruthy,
			hasPropertyAndIsNotEmpty: hasPropertyAndIsNotEmpty,
			sortArray: sortArray,
			mutate: mutate,
			extend: extend,
			generateId: generateId,
			sanitize: sanitize,
			unSanitize: unSanitize,
		},
		defaults: {
			pagination: {
				rowsPerPage: 10,
				rowsPerPageOpts: [ 10, 25, 50 ]
			}
		},
		dispatchEvent: function(elem, type, detail) {
			if (elem instanceof Element === false || !type)
				return null;

			elem.dispatchEvent(new CustomEvent(type, {
				detail: detail,
				bubbles: true,
				cancelable: true
			}));
		},
		event: {
			DIALOG_CLOSE: 'mdwc.dialog.close'
		}
	});
})(MDWC);
