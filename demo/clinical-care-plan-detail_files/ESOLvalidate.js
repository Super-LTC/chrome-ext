function ESOLValidateString(s, nameStr)
{
	if (s.length == 0) {
		alert('Please enter a value for ' + nameStr + '.');
		return false;
	} else {
		return true;
	}
}

function datecheck(obj)
{
	if (!ESOLValidateDateString(obj))
	{
		alert("Invalid date.  Please use format MM/DD/YYYY.");
		obj.focus();
		return false;
	}
	return true;
}

function ESOLValidateInteger(s) {
	var neg = false;
	if (s.length != 0)
	{
		neg = s.value.indexOf('-');
		var InString = s.value;
		var bag = "0123456789";
		s.value = ESOLDontStripCharsInBag(InString, bag);
		if (neg != -1){
			s.value = "-" + s.value;
		}
	}
	return true;
}

function ESOLValidatePositiveInteger(s)
{
  if (s.length != 0)
  {
    var InString = s.value;
    var bag = "0123456789";
    s.value = ESOLDontStripCharsInBag(InString, bag);
  }
  return true;
}

//This function checks to make sure the address form is xxx@xxx.x if field is not blank
function SSWValidateEmailAddress(formObj, InString)
{
	if (formObj.email_address.value != "")
	{
		if (InString.length == 0)
		{
			return true;
		}
		var InputMatch = /^[^ >:;,()^\/"|@]+@[^ >:;,()^\/"|@.][^ >:;,()^\/"|@]*[.][^ >:;,()^\/"|@]+$/;
		var result = InString.match(InputMatch);
		if (result == null)
		{
			alert("You have entered an invalid email address. Please try again.");
			formObj.email_address.focus();
			formObj.email_address.select();
			return false;
		}
		else
		{
			return true;
		}
	}
	return true;
}

//This function checks date format of mm/dd/yy[yy]
// if yy >50  and 2 digits then prefix 19 else prefix 20
var mth = "";
var day = "";
var yr = "";
//This function checks date format of mm/dd/yy[yy]
// if yy >50  and 2 digits then prefix 19 else prefix 20
function ESOLValidateDateString(fld) {
	fld = fld.jquery ? fld.get(0) : fld;
	var InString = fld.value;
	if (InString.length === 0) {
		return false;
	}
	mth = "";
	day = "";
	yr = "";
	if (typeof isMobileBrowser !== 'undefined' && isMobileBrowser) {
		var datepart = InString.split(/[^0-9]/);
		yr = datepart[0];
		mth = datepart[1];
		day = datepart[2];
		InString = mth+"/"+day+"/"+yr;
		return true;
	}
	ESOLStripYearMonthDay(InString, "0123456789/", yr, mth, day);
	if ((mth.length === 0) || (mth.length > 2)) {
		return false;
	} else {
		if (mth.length == 1) {
			mth="0"+mth;
		}
	}
	if ((day.length === 0) || (day.length > 2)) {
		return false;
	} else {
		if (day.length == 1) {
			day="0"+day;
		}
	}
	if ((yr.length<2) || (yr.length >4) || (yr.length==3))
	{
		return false;
	} else {
		if (yr.length==2) {
			if (yr > 50) {
				yr="19"+yr;
			} else {
				yr="20"+yr;
			}
			fld.value=yr;
		}
		if (!ESOLValidateYear(yr,"")) {
			return false;
		}
	}
	if (!ESOLValidateDate(mth,day,yr)) {
		return false;
	}

	fld.value = mth+"/"+day+"/"+yr;
	return true;
}

/******************************************************************************
 * Purpose:		Utility method to check start date if 31 days in past.
 *				Also compares order date with start date [Only for std times]
 ******************************************************************************/
function startDateCheck(compareDate, startDateStr, orderDateStr, isStdTimes)
{
	var startDate = new Date(startDateStr);

	if(startDate<compareDate)
	{
		alert('Start date cannot be more than 31 days in the past.');
		return false;
	}

	//Check for order date being before start date
	//Do not compare order date & start date if std frequency
	if(orderDateStr != null && '' != orderDateStr && isStdTimes)
	{
		var orderDate = new Date(orderDateStr);

		if(startDate<orderDate)
		{
			alert('Mar start date can\'t be before order date.');
			return false;
		}
	}
	return true;
}

//This function is used for the client birthdate, which requires inputting a 4-digit year
function ESOLValidateResidentBirthDateString(fld){
	var InString = fld.value;
	if (InString.length == 0) return false;
	mth = "";
	day = "";
	yr = "";
	ESOLStripYearMonthDay(InString, "0123456789/", yr, mth, day);
	if ((mth.length == 0) || (mth.length > 2)) return false;
	else {
		if (mth.length == 1) mth="0"+mth;
	}
	if ((day.length == 0) || (day.length > 2)) return false;
	else {
		if (day.length == 1) day="0"+day;
	}
	if ((yr.length < 2) || (yr.length > 4) || (yr.length == 3))
	{
		return false;
	}
	else {
		if (yr.length == 2) {
			return false;
		}
		if (!ESOLValidateYear(yr,"")) return false;
	}
	if (!ESOLValidateDate(mth,day,yr)) return false;
	fld.value = mth+"/"+day+"/"+yr;
	return true;

}


function ESOLStripYearMonthDay(s, bag, y, m, d) {
    var i, c;
    var returnString = "";
    var counter = 0;
    // Search through string's characters one by one.
    // If character is not in bag, append to returnString.
    for (i = 0; i < s.length; i++) {
        // Check that current character isn't whitespace.
        c = s.charAt(i);
        if (bag.indexOf(c) != -1) {
            if (c == "/") {
                counter++;
            } else {
                if (counter == 0) {
                	this.mth += c;
                }
                if (counter == 1) {
                	this.day += c;
                }
                if (counter == 2){
                	this.yr += c;
                }
            }
        }
    }
    return returnString;
}

//This function rounds to 2 decimal places
function ESOLRoundMoney(val) {
	val = val * 100;
	val = Math.round(val);
	val = val/100;
	return val;
}

function ESOLRoundDec(value, decimals) {
    return Number(Math.round(value+'e'+decimals)+'e-'+decimals);
}

function moneyFormatted(value) {
	var formatted = value;
    if (formatted.length === 0)
    {
        formatted = "0.00";
    }
    else
    {
        var decimalIndex = formatted.indexOf(".");
        if (decimalIndex === -1) formatted = formatted + ".00";// "546"
        if (formatted.length <= decimalIndex + 1) formatted = formatted + "00";//"546.5"
        if (formatted.length <= decimalIndex + 2) formatted = formatted + "0";
    }
    return formatted;
}

function formatPercentage(fld)
{
	ESOLValidatePositiveInteger(fld);
	
	var fieldValue = fld.value;
	if (fieldValue.length == 0)
	{
		fieldValue = "";
	}
	fld.value = fieldValue;
}

//This function formats money fields and appends .00, .X0 if necessary
function ESOLFormatMoney(fld) {
    fld = fld.jquery ? fld.get(0) : fld;

    var str=fld.value;
    str = moneyFormatted(str);
    fld.value = str;
}

//This function checks to make sure the money field only contains numbers and one decimal
function ESOLValidateMoney(fld){
	var InString = fld.value;
	if (InString.length == 0) fld.value = "";
	InString = ESOLDontStripCharsInBag(InString, "$0123456789.-");
	if (InString == fld.value)
		return true;
	dec = InString.indexOf(".");
	if ( (dec == -1) || InString.length <= (dec+3)  ) {
		fld.value = InString;
		return true;
	}
	else return false;
}

	// This function formats a number to n decimals
function ESOLFormatDecimalNumber(fld, n) {
	fld = fld.jquery ? fld.get(0) : fld;
	var str = fld.value;

	if (str.length == 0) {
		str = "0.0"; // set empty string to zero
	} else {
		var dec = str.indexOf(".");
		var numDec = str.length - dec - 1;
		if (numDec > n) // too many decimal places
			str = ESOLRoundDec(str, n);
	}
	fld.value = str;
}

function ESOLDontStripCharsInBag(s, bag){
    var returnString = "";
    // Search through string's characters one by one.
    // If character is not in bag, append to returnString.
    for(var i=0;i<s.length;i++){
        // Check that current character isn't whitespace.
        var c = s.charAt(i);
        if (bag.indexOf(c) != -1) returnString += c;
    }
    return returnString;
}

//This function checks to make sure at least 10 digits are input
function ESOLValidateYear(txtYear, text){
	var InString = txtYear;
	var bag = "0123456789";
	var strippednumber = ESOLDontStripCharsInBag(InString, bag);

	//This section checks if input begins with Zero and returns false
	if( (strippednumber.charAt(0) == "0") || ((strippednumber.length != 0) && (strippednumber.length < 4)) || (strippednumber.length==0) ){
		return false;
	}
	return true;
}

function ESOLValidateDate(month, day, year){
	if ((month < 1) || (month > 12)) return false;

	if(((ESOLGetDaysInMonth(month,year) < day) && (day > 0)) || day <= 0){
		return false;
	}
	return true;
}

function ESOLGetDaysInMonth(mth, year) {
	days = new Array (12);
	days[0] = 31;
  if (leapyear(year))
	days[1] = 29;
  else
	  {
      days[1] = 28;
		}
	days[2] = 31;
	days[3] = 30;
	days[4] = 31;
	days[5] = 30;
	days[6] = 31;
	days[7] = 31;
	days[8] = 30;
	days[9] = 31;
	days[10] = 30;
	days[11] = 31;
	return days[mth-1];
}

function validateFractionalUnit(unitFieldValue){
	reg = /(^-?[1-9]\d{0,4}$)|(^-?[1-9]\d{0,4}(\.\d{1,2})$)|(^-?0(\.\d{1,2})$)/;
	return reg.test("" + unitFieldValue);
}

function validateIntegerUnit(unitFieldValue){
	reg = /^-?\d{0,5}$/;
	return reg.test("" + unitFieldValue);
}

function validateUnit(unitFieldValue, includeDecimal){
	if(includeDecimal){
		return validateFractionalUnit(unitFieldValue);
	}else{
		return validateIntegerUnit(unitFieldValue);
	}
}

function leapyear(year){
   if ( year < 0 ) return( year + 1 ) % 4 == 0;
   if ( year < 1582 ) return year % 4 == 0;
   if ( year % 4 != 0 ) return false;
   if ( year % 100 != 0 ) return true;
   if ( year % 400 != 0 ) return false;
   if ( year % 3200 != 0 ) return true;
   return false;
}

//This function checks against Google's LibPhoneNumber library to validate phone number and remove formatting for field
//Note: This function requires the libphonenumber.js file to be included in the parent page (Currently: libphonenumber-3.2.40.js)
//Note: This functionality should be synchronized with the behavior of validate() in GooglePhoneNumberValidator.java within PCCCommon
function validateAndStripPhoneNumber(phoneText, phoneField) {
	let phoneUtil = Libphonenumber.getUtil();

	if(phoneText.length === 0){	// Empty phone number is valid
		return true;
	}

	let unformattedPhoneNumber = phoneText.replace(/[^0-9a-zA-Z+]/g, "");

	// special case check for '+' at end of phone number, is valid for Google libphonenumber, but not for our system
	if(unformattedPhoneNumber.charAt(unformattedPhoneNumber.length - 1) === '+'){
		return false
	}

	try {
		// add '+' to the beginning of the phone number for validation purposes for international numbers
		var addPlus = unformattedPhoneNumber.length > 10 && unformattedPhoneNumber.charAt(0) !== '+';
		let phoneNumber = phoneUtil.parse(addPlus ? '+' + unformattedPhoneNumber : unformattedPhoneNumber, "US");

		if(phoneUtil.isPossibleNumber(phoneNumber)) {
			// populate stripped phone number, do not keep '+' if it was added
			phoneField.value = unformattedPhoneNumber;
		}
		else {
			return false;
		}
	}
	catch (e) {
		// error parsing phone number
		return false;
	}
	return true;
}

function validateAndFormatPhoneNumberIfApplicable(phoneText, phoneField){
	const MAX_PHONE_LENGTH = 25;
	let strippedPhone = phoneText.replace(/\D/g, '');
	let strippedPhoneLen = strippedPhone.length;
	if((strippedPhoneLen >= 1 && strippedPhoneLen <= 9) || phoneText.length > MAX_PHONE_LENGTH){
		alert("Invalid phone number. Please use '(nnn) nnn-nnnn' format.");
		return false;
	}
	if(strippedPhone.length == 10){
		// Format as standard NA format
		let npa = strippedPhone.substr(0,3);
		let nxx = strippedPhone.substr(3,3);
		let xxxx = strippedPhone.substr(6,4);
		phoneField.value = '(' + npa + ') ' + nxx + '-' + xxxx;
	} else {
		phoneField.value = phoneText;
	}
}

//this function checks several possible phone number fields for input
//calls phoneformat (formObj, phoneText, pfield) function for formatting to output as "(NNN) NNN-NNNN"
function verifyPhone(formObj)
{
	var fieldArray = [
    "phone_office",
    "phone_cell",
    "phone_pager",
    "phone_home",
    "phone_other",
    "fax",
    "phone"
  ];

	for(var i=0;i<=6;i++)
	{
		var fieldName = fieldArray[i];
		var field = formObj.elements[fieldName];
		var value = field ? field.value : "";

		if (field && value != "")
		{
			if (phoneformat(formObj, value, field) === false)
			{
				field.focus();
				field.select();
				return false;
			}
		}
	}
	return true;
}

//this function checks phone number fields provided via a fieldArray variable
//for input and calls phoneformat (formObj, phoneText, pfield) function for formatting
function verifyPhoneFromFieldArray(formObj, fieldArray)
{
	for(var i=0;i<fieldArray.length;i++){
		if (eval("formObj."+fieldArray[i]) && (!isEmpty(eval("formObj."+fieldArray[i]+".value"))))
		{
			var param1 = eval("formObj."+fieldArray[i]);
			var param2 = eval("formObj."+fieldArray[i]+".value");
			var param3 = eval("formObj."+fieldArray[i]);
			if (phoneformat(param1, param2, param3)==false)
			{
				eval("formObj."+fieldArray[i]+".focus()");
				eval("formObj."+fieldArray[i]+".select()");
				return false;
			}
		}
	}
	return true;
}

// Validate phone number fields if they have been changed, attempt to format all values
// changedFieldArray represents an array of fields that have been modified by the user
function validateChangedPhoneFieldsAndFormat(formObj, changedFieldArray) {
	var fieldArray = [
		"phone_office",
		"phone_cell",
		"phone_pager",
		"phone_home",
		"phone_other",
		"fax"
	];

	for (var i = 0; i < fieldArray.length; i++) {
		var fieldName = fieldArray[i];
		var field = formObj.elements[fieldName];
		var value = field ? field.value : "";

		if (field && value != "") {
			// If the phone number is invalid and has been changed, alert the user and return false, otherwise strip the phone number
			// Note: All phone fields will be stripped of special chars (if applicable, prior to save)
			if (validateAndStripPhoneNumber(value, field) === false && changedFieldArray.includes(fieldArray[i])) {
				alert("Enter a valid phone number.");
				field.focus();
				field.select();
				return false;
			}
		}
	}
	return true;
}



//this function is used to ensure required fields have been filled in.
//Add elements to the array as necessary.
function formcheck(formObj)
{
	var fieldArray = new Array();
	fieldArray[0] = "first_name";
	fieldArray[1] = "last_name";

	var fieldNameArray = new Array();
	fieldNameArray[0] = "First Name is a required field.";
	fieldNameArray[1] = "Last Name is a required field.";

	for (i=0; i<=1; i++)
	{
		if (eval("formObj."+fieldArray[i]+".value") == "")
		{
			eval("formObj."+fieldArray[i]+".focus()");
			eval("formObj."+fieldArray[i]+".select()");
			return false;
		}
	}
	return true;
}

//this function is used to validate staff start and end dates
//date validation functions have been split up to give appropriate alerts
function validateStaffDates(formObj)
{
	if (formObj.staff_hire_date.value != "")
	{
		if (!ESOLValidateDateString(formObj.staff_hire_date))
		{
			alert("Please enter a valid Staff Start Date: mm/dd/yyyy.");
			formObj.staff_hire_date.focus();
			formObj.staff_hire_date.select();
			return false;
		}
	}
	if (formObj.staff_left_date.value != "")
	{
		if (!ESOLValidateDateString(formObj.staff_left_date))
		{
			alert("Please enter a valid Staff End Date: mm/dd/yyyy.");
			formObj.staff_left_date.focus();
			formObj.staff_left_date.select();
			return false;
		}
	}
	return true;
}

//function used to validate birthdays in various forms
//date validation functions have been split up to give appropriate alerts
function validatebirthdate(formObj)
{
	if (formObj.date_of_birth.value != "")
	{
		if (!ESOLValidateDateString(formObj.date_of_birth))
		{
			alert("Please enter a valid birth date: mm/dd/yyyy. Please ensure you have specified a 4-digit year.");
			formObj.date_of_birth.focus();
			formObj.date_of_birth.select();
			return false;
		}
	}
	return true;
}

//This function is used for the client birthdate, which requires inputting a 4-digit year
function validateClientBirthdate(formObj)
{
	if (formObj.date_of_birth.value != "")
	{
		if (!ESOLValidateResidentBirthDateString(formObj.date_of_birth))
		{
			alert("Please enter a valid birth date: mm/dd/yyyy. Please ensure you have specified a 4-digit year.");
			formObj.date_of_birth.focus();
			formObj.date_of_birth.select();
			return false;
		}
	}
	return true;
}

function validateNum(obj)
{
	val = obj.value;
	bag = "0123456789.";
	strippedVal = ESOLDontStripCharsInBag (val, bag);
	if (strippedVal.length == 0)
	{
		alert("Invalid entry.");
		obj.value = "";
		return;
	}
	else
	{
		var posit = strippedVal.indexOf(".");
		if (posit != -1)
		{
			bag = "0123456789";
			afterDec = strippedVal.substring(posit,strippedVal.length);
			afterDec = 	ESOLDontStripCharsInBag (afterDec, bag);
			strippedVal = strippedVal.substring(0,posit);
			if (afterDec.length > 2)
				afterDec = afterDec.substring(0,2);
			obj.value = strippedVal + "." +afterDec;
		}
	}
}

function validateTextAreaSizeForCPItemsInAssessment(textAreaObject, maxSize)
{
	var existing = textAreaObject.value;
	var isChrome = window.chrome;
	var isFireFox = typeof InstallTrigger !== 'undefined';

	var textInclCarriageRtn = existing;

	if(isChrome || isFireFox){
		// Note:- Doing this as Chrome and Firefox doesnt count line breaks properly (as 2 characters), so in order to
		// count the
		// length properly doing this.
		//https://stackoverflow.com/questions/36004311/textarea-val-length-not-counting-enter-line-breaks-in-chrome
		textInclCarriageRtn = textInclCarriageRtn.replace(/(\r\n|\n|\r)/g,"  ");
	}
	//Following is a fix for checking for ANSII characters to be considered in length
	var textLn = (new TextEncoder().encode(textInclCarriageRtn)).length;
	if (textLn > maxSize)
	{
		// This typically catches typing one character at a time.
		if ((textLn - maxSize) == 1)
		{
			alert("You have reached the maximum number of characters (" + maxSize + ") for this response field. The extra characters will be removed.");
		}
		// This typically catches pasting text.
		else
		{
			alert("The response entered is " + (textLn - maxSize) + " characters longer than the maximum number of characters (" + maxSize + ") for this response field. The extra characters will be removed.");
		}
		var remainingChars = textLn - existing.length;
		charsToFill = maxSize - remainingChars;
		textAreaObject.value = existing.substring(0, charsToFill);
	}
}

function validateTextAreaSize(textAreaObject, maxSize)
{
	var existing = textAreaObject.value;

	if (existing.length > maxSize)
	{
		// This typically catches typing one character at a time.
		if ((existing.length - maxSize) == 1)
		{
			alert("You have reached the maximum number of characters (" + maxSize + ") for this response field. The extra characters will be removed.");
		}
		// This typically catches pasting text.
		else
		{
			alert("The response entered is " + (existing.length - maxSize) + " characters longer than the maximum number of characters (" + maxSize + ") for this response field. The extra characters will be removed.");
		}
		textAreaObject.value = existing.substring(0, maxSize);
	}
}

/*******************************************************************************
* Function: validateTextAreaSizeReturnValue
* Purpose: Validate the maximum length of a text area field.
* Return: true if the text is within bounds, false if the text is too long.
*******************************************************************************/
function validateTextAreaSizeReturnValue(textAreaObject, maxSize)
{
	var existing = textAreaObject.value;
	var rv = true;

	if (existing.length > maxSize)
	{
		rv = false;

		// This typically catches typing one character at a time.
		if ((existing.length - maxSize) == 1)
		{
			alert("You have reached the maximum number of characters (" + maxSize + ") for this response field. The extra characters will be removed.");
		}
		// This typically catches pasting text.
		else
		{
			alert("The response entered is " + (existing.length - maxSize) + " characters longer than the maximum number of characters (" + maxSize + ") for this response field. The extra characters will be removed.");
		}
		textAreaObject.value = existing.substring(0, maxSize);
	}
	return rv;
}

/*******************************************************************************
* Function		: isValidInteger
* Purpose			: Enables the start time value text input text boxes.
*******************************************************************************/
function isValidInteger(sInt)
{
	var new_msg = true;
	inputStr = sInt.toString();
	for (var i = 0; i < inputStr.length; i++)
	{
		var oneChar = inputStr.charAt(i);
		if ((oneChar < '0' || oneChar > '9') && oneChar != '/')
		{
			new_msg = false;
		}
	}
	return new_msg;
}


/*******************************************************************************
* Function : checkStartDate
* Purpose: check order date and mar start date
*******************************************************************************/
function checkStartDateTime()
{
	var orderDate		= document.getElementById("order_date").value;
	var orderHour		= document.getElementById("order_date_hour").value;
	var orderMinute		= document.getElementById("order_date_minute").value;
	var startDate		= document.getElementById("start_date").value;
	var startHour		= document.getElementById("start_date_hour").value;
	var startMinute		= document.getElementById("start_date_minute").value;
	var result = true;

	if(orderDate == startDate)
	{
		if( parseInt(orderHour) > parseInt(startHour))
		{
			alert("MAR Start Date cannot be before Order Date.");
			result = false;
		}
		else if( orderHour == startHour)
		{
			if( parseInt(orderMinute) > parseInt(startMinute))
			{
				alert("MAR Start Date cannot be before Order Date.");
				result = false;
			}
		}
	}
	return result;
}

/**
 * validate a date against a start and end date to ensure it is later or equal to start date and earlier or equal end date
 * @param compareDate - the date to compare
 * @param startDate - the start date of the valid range, if null start date check won't be done.
 * @param endDate - the end date of the valid range, if null end date check won't be done.
 * @param toEarlyError - the error message to display if compare date is earlier than the start date
 * @param toLateError - the error message to display if the compare date is later than the end date
 * @returns {Boolean} return true if validation passed, false otherwise.
 * Note if false is returned, an error will be displayed to the user as well.
 */
function validateDateRange(compareDate, startDate, endDate, toEarlyError, toLateError)
{
	var comparisonDate = new Date(compareDate);
	if (startDate != null && '' != startDate) {
		var fromDate = new Date(startDate);
	
		if(fromDate>comparisonDate)
		{
			alert(toEarlyError);
			return false;
		}
	}
	
	var toDate = new Date();
	if (endDate != null && '' != endDate) {
		if (endDate != 'now')
		{
			toDate = new Date(endDate);
		}
	
		if(toDate<comparisonDate)
		{
			alert(toLateError);
			return false;
		}
	}
	return true;
}
/**
 * validate a date against a start/end date must be after 10/01/2014 
 * @param condition            - must be for Swing bed assessment Types
 * @param compareDate          - the date to compare -- 10/01/2014
 * @param startDate            - start date of the valid range
 * @param endDate              - end date of the valid range
 * @param earlyStartDateError  - the error message to display if compare date "10/01/2014" is before start date
 * @param earlyEndDateError    - the error message to display if compare date "10/01/2014" is before end date
 * @returns {Boolean} return true if validation passed, false otherwise.
 * Note if false is returned, an error will be displayed to the user as well.
 */
function isDateRangeValidForSwingBed(condition, compareDate, startDate, endDate, earlyStartDateError, earlyEndDateError)
{
    if (condition)
    {
	  var sDate = new Date(startDate.value);
	  var eDate = new Date(endDate.value);
	  var cutOffDate = new Date(compareDate);
      if (sDate.getTime() < cutOffDate.getTime()) 
      {
        alert(earlyStartDateError);
        startDate.select();
        return false;
      }
      else if(eDate.getTime() < cutOffDate.getTime())  
      {
        alert(earlyEndDateError);
        endDate.select();
        return false;
      }
    }
    return true;
}


//Validates the input value that it is a valid integer
function isValidInt(inputObj) 
{
   if (inputObj != null && inputObj.value !== "") 
   {
      var criteria = /^-?\d+$/;
      var result = inputObj.value.match(criteria);
      if (result == null) 
      {
    	  return false;
      }
   }
   return true;
}

function ESOLValidateName(fld) {
	  
	  var legalChar = "-@'/+,._";
	  if (fld == null || fld.value == '')
	     return true;
	  
	  fld.value = fld.value.trim();
	  var name = fld.value;
	  
	  if (name.length > 50){
	  	  alert("The length of name must not exceed 50");
  	  fld.focus();
  	  return false;
	  }
	  
	  var c;
	  var wrongSpace = false;
  for (i = 0; i < name.length; i++) {
      c = name.charAt(i);
      if (c >= '0' && c <= '9') continue;
      if (c >= 'a' && c <= 'z') continue;
      if (c >= 'A' && c <= 'Z') continue;
      if (legalChar.indexOf(c) >= 0) continue;
      if (c == ' ') {
      	  if (name.charAt(i+1) == ' '){
      	      wrongSpace = true;
              break;
          } else {
          	  continue;
          }
      }
      break;
  }
  
  if (i < name.length){
  	  if (wrongSpace)
  	      alert("Space must be surrounded by non-space characters");
  	  else 
  	  	  alert("Name contains illegal character:" + c);
  	  fld.focus();
  	  return false;
  } else {
  	  return true;
  }
}