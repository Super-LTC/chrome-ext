




// This script was dynamically generated specifically for the en-US date/time locale
// Commented-out script tags promote proper javascript syntax highlighting in the JSP editor <script>
if(!window.PCC){
	window.PCC = {};
}
if (!PCC.l10n)
{
	PCC.l10n = {};
}

PCC.l10n.locale = 'en-US';

PCC.l10n.healthType = 'SNF';

PCC.l10n.dateTime = {

	localeForDateTime: 'en-US',

	timeZoneId: 'America/New_York',

	firstDayOfWeek: 1,

	userDateFormatHint: 'M/D/YYYY', // localized for presentation to user - do not use for formatting!!

	userDateToInternalDate: function(date) {
		// This function takes a user-supplied date string and standardize it for submission back to the server
		return date.replace(this.privateData.userDateRegex, '$1/$2/$3');
	},

	internalDateToUserDate: function(date) {
		// This function takes an internal date string and transform it to the user format
		return date.replace(this.privateData.internalDateRegex, '$1/$2/$3');
	},

	jsDateToInternalFormat: function(jsDateObj){
		var str = '';
		if(jsDateObj instanceof Date){
			function pad(number){
				if(number < 10){
					return '0' + number;
				}
				return number;
			}
			str = pad(jsDateObj.getUTCMonth() + 1) + '/' + pad(jsDateObj.getUTCDate()) + '/' + jsDateObj.getUTCFullYear();
		}
		return str;
	},

	iso8601DateToUserFormat: function(iso8601Date){
		var str = '';
		//convert any date/datetime in: YYYY-MM-DDTHH:MM:SS.SSSZ format
		if(iso8601Date.length >= 10){
			var year = iso8601Date.substr(0,4);
			var month = iso8601Date.substr(5,2);
			var day = iso8601Date.substr(8,2);
			var firstChar = this.userDateFormatHint[0].toUpperCase();
			var delim = '/';
			if(firstChar == 'D'){
				str = day + delim + month + delim + year;
			} else {
				str = month + delim + day + delim + year;
			}
		}
		return str;
	},


	toUserDateAndTime: function(internalDate, hours, minutes, seconds){
		var userDate = PCC.l10n.dateTime.internalDateToUserDate(internalDate);
		hours = Number(hours) || 0;
		minutes = Number(minutes) || 0;
		if(hours < 10){
			hours = '0' + hours;
		}
		if(minutes < 10){
			minutes = '0' + minutes;
		}
		var addSeconds = false;
		if(typeof(seconds) != 'undefined'){
			seconds = Number(seconds) || 0;
			addSeconds = true;
			if(seconds < 10){
				seconds = '0' + seconds;
			}
		}
		var userTime = hours + ':' + minutes + (addSeconds ? ':' + seconds : '');
		return userDate + ' ' + userTime;
	},

	userDateToSegments: function(date) {
		var match = this.privateData.userDateRegex.exec(date);
		var result = {day: match[2], month: match[1], year: match[3]};
		return result;
	},

	formatUserDate: function(year, month, day) {
		var result = 'M/d/yyyy';
		return result.replace(/y+/,year)
					.replace(/M+/,month)
					.replace(/d+/,day);
	},

	privateData: {
		segments: {//1-indexed, NOT 0-indexed!
			dayIndex:2,
			monthIndex:1,
			yearIndex:3
		},

		userDateRegex: new RegExp('^([^/.]*)(?:/([^/.]*)(?:/([^/.]*)(?:)?)?)?'),

		internalDateRegex: new RegExp('^(\\d+)/(\\d+)/(\\d+)$'),

		isValidDate: function(year, month, day){
			if(month < 10){
				month = '0' + month;
			}
			if(day < 10){
				day = '0' + day;
			}
			var tempDate = Date.parse(year + '-' + month + '-' + day);
			return (!isNaN(tempDate));
		},
		convertTwoDigitYearToFourDigits: function(year){
			if(year < 100){
				//year is not a full 4 digit year - we will parse it like Java does http://docs.oracle.com/javase/6/docs/api/java/text/SimpleDateFormat.html#year
				//We will adjust so that the 2 digit year is within the range of -80 years, to plus 20 years from today
				//e.g. in 2016, "44" would be considered to be "1944", and "35" would be considered to be "2035"
				var currentYear = new Date().getFullYear();
				var currentYearAsTwoDigits = parseInt(('' + currentYear).substr(2), 10);//e.g. xx75 or xx18
				var currentYearBase = currentYear - currentYearAsTwoDigits;//e.g. 2000 (or in the future, 2100)
				if((currentYearBase + year) < (currentYear + 20)){
					//we are considering this as a current/future date
					year = currentYearBase + year;
				} else {
					//we are considering this as a previous date
					year = (currentYearBase - 100) + year;
				}
			}
			return year;
		}
	},

	
	userDateFormat: function(str){
		var DAY = "DAY";
		var MONTH = "MONTH";
		var YEAR = "YEAR";
		var formatPattern = [MONTH, DAY, YEAR];
		var firstChar = PCC.l10n.dateTime.userDateFormatHint[0].toUpperCase();
		if(firstChar == 'D'){
			formatPattern = [DAY, MONTH, YEAR];//format is DD/MM/YYYY
		}

		//filter out invalid characters (if any)
		str = str.replace(/[^0-9\/\-\.]/g, '');
		if(str.length == 0){
			return '';
		}

		//split date fragments
		var delimsRegEx = /[\/\-\.]/;
		var strArr = str.split(delimsRegEx);
		var strArrLen = strArr.length;
		var buildDateArr = new Array(3);
		var dPart = null;
		var mPart = null;
		var yPart = null;
		if(strArrLen >= 3){
			yPart = parseInt(strArr[2], 10) || null;
		}
		if(strArrLen >= 2){
			if(formatPattern[1] == MONTH){
				mPart = parseInt(strArr[1], 10) || null;
			} else if(formatPattern[1] == DAY){
				dPart = parseInt(strArr[1], 10) || null;
			}
		}
		if(strArrLen >= 1){
			if(formatPattern[0] == MONTH){
				mPart = parseInt(strArr[0], 10) || null;
			} else if(formatPattern[0] == DAY){
				dPart = parseInt(strArr[0], 10) || null;
			}
		}
		if(strArrLen == 1 && str.length == 8){
			//no delimiters, full 8 digit date, e.g. "04052017"
			if(formatPattern[0] == MONTH){
				mPart = parseInt(str.substr(0,2), 10) || null;
				dPart = parseInt(str.substr(2,2), 10) || null;
			} else if(formatPattern[0] == DAY){
				mPart = parseInt(str.substr(2,2), 10) || null;
				dPart = parseInt(str.substr(0,2), 10) || null;
			}
			yPart = parseInt(str.substr(4,4), 10) || null;
		}
		//Special parsing for 4, 6 and 7 character dates only if the locale format is in MM/DD/YYYY or DD/MM/YYYY (where YYYY is last)
		//we will only parse dates where there is NO ambiguity as to what it should be parsed to
		if(strArrLen == 1 && (this.privateData.segments.yearIndex == 3)){
			dPart = null;//reset
			mPart = null;//reset
			if(str.length == 4){
				var firstTwoDigits = parseInt(str.substr(0,2), 10) || null;
				var secondTwoDigits = parseInt(str.substr(2,2), 10) || null;
				if(this.privateData.segments.dayIndex == 1){
					//DD/MM
					dayPart = firstTwoDigits;
					monthPart = secondTwoDigits;
				} else {
					//MM/DD
					dayPart = secondTwoDigits;
					monthPart = firstTwoDigits;
				}
				var yearPart = new Date().getFullYear();
				var isDateValid = this.privateData.isValidDate(yearPart, monthPart, dayPart);
				if(isDateValid){
					//is a valid date
					dPart = dayPart;
					mPart = monthPart;
					yPart = yearPart;
				}
			} else if(str.length == 6){
				//no delimiters, partial 6 digit date, e.g. (A) "452017" (04/05/2017) or (B) "111217" (11/12/2017)
				var firstTwoDigits = parseInt(str.substr(0,2), 10) || null;
				var firstDigit = parseInt(str.substr(0,1), 10) || null;
				var firstTwoDigits = parseInt(str.substr(0,2), 10) || null;
				var secondDigit = parseInt(str.substr(1,1), 10) || null;
				var secondTwoDigits = parseInt(str.substr(2,2), 10) || null;
				var lastTwoDigits = parseInt(str.substr(4,2), 10) || null;
				var lastFourDigits = parseInt(str.substr(2,4), 10) || null;
				//pressuming we have a valid partial date, we need to determine if we are dealing with pattern (A) or (B) above
				//if parsing as one works, but not the other then we will continue, if both parse as valid dates, we MUST give up (or present the user with a choice)
				var aFormatDayPart;
				var aFormatMonthPart;
				var aFormatYearPart;
				var bFormatDayPart;
				var bFormatMonthPart;
				var bFormatYearPart;

				if(this.privateData.segments.dayIndex == 1){
					//D/M/YYYY
					aFormatDayPart = firstDigit;
					aFormatMonthPart = secondDigit;
					//DD/MM/YY
					bFormatDayPart = firstTwoDigits;
					bFormatMonthPart = secondTwoDigits;
				} else {
					//M/D/YYYY
					aFormatMonthPart = firstDigit;
					aFormatDayPart = secondDigit;
					//MM/DD/YY
					bFormatMonthPart = firstTwoDigits;
					bFormatDayPart = secondTwoDigits;
				}
				aFormatYearPart = lastFourDigits;
				bFormatYearPart = lastTwoDigits;
				var isDateValidInFormatA = this.privateData.isValidDate(aFormatYearPart, aFormatMonthPart, aFormatDayPart);
				var isDateValidInFormatB = this.privateData.isValidDate(this.privateData.convertTwoDigitYearToFourDigits(bFormatYearPart), bFormatMonthPart, bFormatDayPart);
				if(isDateValidInFormatA && !isDateValidInFormatB){
					//is a valid date in the D/M/YYYY or M/D/YYYY format
					dPart = aFormatDayPart;
					mPart = aFormatMonthPart;
					yPart = aFormatYearPart;
				} else if(!isDateValidInFormatA && isDateValidInFormatB){
					//is a valid date in the DD/MM/YY or MM/DD/YY format
					dPart = bFormatDayPart;
					mPart = bFormatMonthPart;
					yPart = bFormatYearPart;
				}
				//if both are valid, the input is ambiguous, if both are invalid, the input is no good
			} else if(str.length == 7){
				//no delimiters, partial 7 digit date, e.g. "4152017" (04/15/2017) where either the day or month is a single digit in the DD/MM/YYYY or MM/DD/YYYY format
				var firstDigit = parseInt(str.substr(0,1), 10) || null;
				var firstTwoDigits = parseInt(str.substr(0,2), 10) || null;
				var thirdDigit = parseInt(str.substr(2,1), 10) || null;
				var secondAndThirdDigit = parseInt(str.substr(1,2), 10) || null;
				var lastFourDigits = parseInt(str.substr(3,4), 10) || null;
				//(A) format will be ?/?? and the (B) format will be ??/?
				if(this.privateData.segments.dayIndex == 1){
					//D/MM
					aFormatDayPart = firstDigit;
					aFormatMonthPart = secondAndThirdDigit;
					//DD/M
					bFormatDayPart = firstTwoDigits;
					bFormatMonthPart = thirdDigit;
				} else {
					//M/DD
					aFormatMonthPart = firstDigit;
					aFormatDayPart = secondAndThirdDigit;
					//MM/D
					bFormatMonthPart = firstTwoDigits;
					bFormatDayPart = thirdDigit;
				}
				aFormatYearPart = lastFourDigits;
				bFormatYearPart = lastFourDigits;
				var isDateValidInFormatA = this.privateData.isValidDate(aFormatYearPart, aFormatMonthPart, aFormatDayPart);
				var isDateValidInFormatB = this.privateData.isValidDate(bFormatYearPart, bFormatMonthPart, bFormatDayPart);
				if(isDateValidInFormatA && !isDateValidInFormatB){
					//is a valid date in the D/MM/YYYY or M/DD/YYYY format
					dPart = aFormatDayPart;
					mPart = aFormatMonthPart;
					yPart = aFormatYearPart;
				} else if(!isDateValidInFormatA && isDateValidInFormatB){
					//is a valid date in the DD/M/YYYY or MM/D/YYYY format
					dPart = bFormatDayPart;
					mPart = bFormatMonthPart;
					yPart = bFormatYearPart;
				}
				//if both are valid, the input is ambiguous, if both are invalid, the input is no good
			} else if(str.length == 8){
				//no delimiters, 8 digit date, e.g. "04032017" (04/03/2017) in the DD/MM/YYYY or MM/DD/YYYY format
				var firstTwoDigits = parseInt(str.substr(0,2), 10) || null;
				var secondTwoDigits = parseInt(str.substr(2,2), 10) || null;
				var lastFourDigits = parseInt(str.substr(4,4), 10) || null;
				if(this.privateData.segments.dayIndex == 1){
					//DD/MM
					dayPart = firstTwoDigits;
					monthPart = secondTwoDigits;
				} else {
					//MM/DD
					dayPart = secondTwoDigits;
					monthPart = firstTwoDigits;
				}
				var yearPart = lastFourDigits;
				var isDateValid = this.privateData.isValidDate(yearPart, monthPart, dayPart);
				if(isDateValid){
					//is a valid date
					dPart = dayPart;
					mPart = monthPart;
					yPart = yearPart;
				}
			}
		}
		if(dPart == null && mPart == null && yPart == null){
			return '';
		} else {
			//fill in any missing parts (and fix if zero'd)
			if(yPart == null){
				yPart = new Date().getFullYear();
			}
			if(mPart == null || mPart == 0){
				mPart = 1;
			}
			if(dPart == null || dPart == 0){
				dPart = 1;
			}

			//clamp year value (if needed)
			if(yPart > 9999){
				yPart = 9999;//clamp it
			}
			if(yPart < 100){
				yPart = this.privateData.convertTwoDigitYearToFourDigits(yPart);
			}
			//clamp month value (if needed)
			if(mPart > 12){
				mPart = 12;//clamp it
			}
			//in JavaScript, Months are 0-indexed so we need to decrement by 1
			mPart--;
			//clamp day value (if needed)
			var DAYS_PER_MONTH = '31|29|31|30|31|30|31|31|30|31|30|31'.split('|');
			var maxDaysInMonth = DAYS_PER_MONTH[mPart];
			if(mPart == 1){
				//Month is February, is it a leap year?
				var isLeap = (new Date(yPart, 1, 29).getMonth() === 1);
				if(isLeap){
					maxDaysInMonth = 29;
				} else {
					maxDaysInMonth = 28;
				}
			}
			if(dPart > maxDaysInMonth){
				dPart = maxDaysInMonth;
			}
			//build date???
			//var tempDate = new Date(yPart, mPart, dPart);

			if(dPart < 10){
				dPart = "0" + dPart;
			}
			mPart++;//bring back up to human date 1-indexed
			if(mPart < 10){
				mPart = "0" + mPart;
			}

			//TODO: delimiter is hard coded to "/"
			var delim = "/";
			var ret = "";
			if(formatPattern[0] == MONTH){
				ret += mPart + delim + dPart;
			} else if(formatPattern[0] == DAY){
				ret += dPart + delim + mPart;
			}
			yPart = "" + yPart;//force to a string
			ret += delim + ("0000"+yPart).substring(yPart.length);
			return ret;
		}
	}
};
//</script>
