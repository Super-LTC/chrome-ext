/* This script is used to validate a user input date; a display pops up below the
* date input to show the user what date is being entered.
* EXAMPLE USAGE:
* <form name="frmData">
*   <input onkeypress="return filterKeys(event)" onblur="reformatDate(this)" onfocus='setDateItem(this, "<%=tabType%>", "MM/DD/YYYY", "en_US")' />
* </form>
*   format is an optional parameter, defaults to MM/DD/YYYY
*   locale is an optional parameter, defaults to "en_US"
*
* if date has an onchange event you must call reformatDate(this) before calling the onchagne function;
* reformatDate ensures date is in proper format, otherwise you could end up with bad input
* ie: onchange="reformatDate(this);yourFunctionCall()" (onchange call is made before onblur)
*
* Date code also supports "hot keys".  Remove the onkeypress event to disable these
* Highlight date (or use empty date box) and press 't' or 'T' to get todays date
* press "[" and "]" when focused on the date box to go to previous and next day respectively
*
*/

//****************************************************************************//
// WeDate OBJECT                                                              //
//****************************************************************************//

/**
* WeDate constructor.
* Constructs a date with a default date of January 1 2000
**/
function WeDate(){ //Default to jan 1st
  var month = 1;
  var day = 1;
  var year = 2000;
  var friendlyDate = "01/01/2000";
  var reformDate = "01/01/2000";

  /**
  * Manipulator method to set the day value.
  * @param param *REQUIRED*
  *   The day as an integer.
  **/
  function setDay(param){
    day = param;
  }
  this.setDay = setDay;

  /**
  * Manipulator method to set the month value.
  * @param param *REQUIRED*
  *   The month as an integer.
  **/
  function setMonth(param){
    month = param;
  }
  this.setMonth = setMonth;

  /**
  * Method to add a number of years to the current year stored by the date object.
  * @param param *REQUIRED*
  *    The number of years to add (integer)
  **/
  function addYears(param){
    year += param;
  }
  this.addYears = addYears;

  /**
  * Method to add a number of days to the current day stored by the date object.
  * @param param *REQUIRED*
  *    The number of days to add (integer)
  **/
  function addDays(param){
    day += param;
  }
  this.addDays = addDays;

  /**
  * Method to add a number of months to the current month stored by the date object.
  * @param param *REQUIRED*
  *    The number of months to add (integer)
  **/
  function addMonths(param){
    month += param;
  }
  this.addMonths = addMonths;

  /**
  * Manipulator method to set the year value.
  * @param param *REQUIRED*
  *   The year as a 4 digit integer
  **/
  function setYear(param){
    year = param;
  }
  this.setYear = setYear;

  /**
  * Accessor method to get the date's month.
  * @param -none
  * @return
  *   The date's month.
  **/
  function getMonth(){
    return month;
  }
  this.getMonth = getMonth;

  /**
  * Accessor method to get the date's day.
  * @param -none
  * @return
  *   The date's day.
  **/
  function getDay(){
    return day;
  }
  this.getDay = getDay;

  /**
  * Accessor method to get the date's year.
  * @param -none
  * @return
  *   The date's year.
  **/
  function getYear(){
    return year;
  }
  this.getYear = getYear;

  /**
  * Manipulator method to set the friendly date.
  * @param param *REQUIRED*
  *   The friendly date as text object.
  **/
  function setFriendlyDate(param){
    friendlyDate = param;
  }
  this.setFriendlyDate = setFriendlyDate;

  /**
  * Accessor method to get the friendly display date
  * @param -none
  * @return
  *   The date in a user friendly string.
  **/
  function getFriendlyDate(){
    return friendlyDate;
  }
  this.getFriendlyDate = getFriendlyDate;

  /**
  * Accessor method to get the reformatted date.
  * @param -none
  * @return
  *   The reformatted date
  **/
  function getReformDate(){
    return reformDate;
  }
  this.getReformDate = getReformDate;

  /**
  * Manipulator method to set the reformated date
  * @param parm *REQUIRED*
  *   The reformatted date as a text object.
  **/
  function setReformDate(param){
    reformDate = param;
  }
  this.setReformDate = setReformDate;
}
//****************************************************************************//



//****************************************************************************//
// WeDateConstants OBJECT                                                     //
//****************************************************************************//

/**
* WeDateConstants constructor.
* Constructs a WeDateConstants object; creates arrays of months and max days
* @param
*   -None
* based on a gregorian calendar
**/
function WeDateConstants(){
  //assume one is using gregorian calendar
  var february = 2;
  var locale = "en_US";
  var inputGuide = "MM/DD/YYYY";

  //Array of month names to match text against
  var month = new Array("January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December");

  //Array of month abbreviations to match text against
  var monthabbrevs = new Array("ja", "fe", "mar", "ap", "may", "jun", "jul", "au", "se", "oc", "no", "de");

  //Array of max days of each month
  var maxDays = new Array(31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31);

  /**
  * Function to find the the maximum number of days in a month
  * @param param *REQUIRED*
  *    The month as an integer
  * @return
  *    The maximum number of days in the input month
  **/
  function getMaximumDays(param){
    if(param < 1){
      return maxDays[0];
    }
	if(param > 12){
      return maxDays[11];
    }
	return maxDays[param -1];
  }
  this.getMaximumDays = getMaximumDays;

  /**
  * Changes the locale
  * @param param *REQUIRED*
  *    The locale
  * @return
  *    None
  **/
  function setLoc(param, format){
    //NOTE: when adding new languages be sure to add appropriate characters to regular expression in stringToMDY function call
    if(param != null){
      if(null == format){format = "MM/DD/YYYY";}//Default format
      if(param == "fr_CA"){
        month = new Array("janvier", "f&#233;vrier", "mars", "avril", "mai", "juin", "julliet", "ao&#251;t", "septembre", "octobre", "novembre", "d&#233cembre");
        monthabbrevs = new Array("ja", "fe", "mar", "av", "mai", "jui", "jul", "ao", "se", "oc", "no", "de");
        var mask = replaceAll(format, "D", "J");
        mask = replaceAll(mask, "Y", "A");
        this.setMask(mask);
      } else {
        month = new Array("January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December");
        monthabbrevs = new Array("ja", "fe", "mar", "ap", "may", "jun", "jul", "au", "se", "oc", "no", "de");
        this.setMask(format);
      }
      locale = param;
    }
  }
  this.setLoc = setLoc;

  /**
   * Finds the locale
   * @return
   *    The locale
   **/
  function getLoc(){
    return locale;
  }
  this.getLoc = getLoc;

  //private helper function
  //Replaces all instances of one string with another
  function replaceAll(str, from, to){
      var idx = str.indexOf(from);
      while(idx > -1){
          str = str.replace(from, to);
          idx = str.indexOf(from);
      }
      return str;
  }

  /**
  * Wrapper function to find the maximum number of days in the given month for the given year
  * Calls getMaxFebDays if february is input, else call getMaximumDays
  * @param theMonth *REQUIRED*
  *   The month to find the maximum number of days in.
  * @param theYear *CONDITIONALLY OPTIONAL*
  *   Required if february is sent as month, else optional; the year to test with.
  * @return the maximum number of days in the given month and year
    **/
  function getMaxDays(theMonth, theYear){
    if(theMonth == february){
      return getMaxFebDays(theYear);
    } else {
      return getMaximumDays(theMonth);
    }
  }
  this.getMaxDays = getMaxDays;

  /**
  * Gets the abbreviation of the integer month input
  * @param theMonth *REQUIRED*
  *   The month(integer) to find the abbreviation of
  * @return
  *  The abbreviation of the input month
    **/
  function getMonthAbbrev(theMonth){
    if(theMonth < 1){
      return monthabbrevs[0];
    }
	if(theMonth > 12){
      return monthabbrevs[11];
    }
	return monthabbrevs[theMonth -1];
  }
  this.getMonthAbbrev = getMonthAbbrev;

  /**
  * Function that calculates where february has 28 or 29 days for the given year
  * @param theYear *REQUIRED*
  *   The year to test as an integer.
  * @return
  *  29 if (the year is divisible by 4 and the year is not divisible by 100) OR if the year is divisbly by 400
  *   else 28 is returned
  *   if you're confused see this website: http://aa.usno.navy.mil/faq/docs/leap_years.html
  **/
  function getMaxFebDays(theYear){
    //PRE: Year is a 4 digit Gregorian calendar year
    //POST:  Number of days in february of that year is returned
    if((theYear % 4) == 0){
      if((theYear % 100) == 0){
        if((theYear % 400) == 0){
          return 29;
        } else {
          return 28;
        }
      } else {
        return 29;
      }
    } else {
      return 28;
    }
  }
  this.getMaxFebDays = getMaxFebDays;

  /**
  * Gets the name of the integer month input
  * @param theMonth *REQUIRED*
  *   The month (integer) to find the abbreviation of
  * @return
  *  The abbreviation of the input month
  **/
  function getMonthName(theMonth){
    if(theMonth < 1){
      return month[0];
    }
    if(theMonth > 12){
      return month[11];
    }
    return month[theMonth -1];
  }
  this.getMonthName = getMonthName;

  /**
  * Manipulator method to set the input mask value.
  * @param param *REQUIRED*
  *   The mask as a string.
  **/
  function setMask(param){
    inputGuide = param;
  }
  this.setMask = setMask;

  /**
  * This function returns the standard input guide string
  * @return
  *  the input guide string
  **/
  function getInputGuide(){
    return inputGuide;
  }
  this.getInputGuide = getInputGuide;
}
//****************************************************************************//

//****************************************************************************//
// WeDateDisplay OBJECT                                                       //
//****************************************************************************//


function WeDateDisplay(){
  //Private variables
  var datebox = 0;
  var textbox = null;
  var interval = null;
  var format = "MM/DD/YYYY";
  var style = "";

  //Public variables
  this.id = "dateSelectTextId";

  /**
  * Manipulator method to set the format string.
  * @param param *REQUIRED*
  *   The format string.
  **/
  function setFormat(param){
      format = param;
  }
  this.setFormat = setFormat;

  /**
    * Manipulator method to set the style.
    * @param param *REQUIRED*
    *   The style.
    **/
  function setStyle(param){
      style = param;
  }
  this.setStyle = setStyle;

  /**
  * Accessor method to get the style.
  * @param -none
  * @return
  *   The class name.
  **/
  function getStyle(){
      return style;
  }
  this.getStyle = getStyle;

  /**
  * Accessor method to get the format string.
  * @param -none
  * @return
  *   The format string.
  **/
  function getFormat(){
      return format;
  }
  this.getFormat = getFormat;

  /**
  * Accessor method to get the  date input object.
  * @param -none
  * @return
  *   The date input object.
  **/
  function getDate(){
    return datebox;
  }
  this.getDate = getDate;

  /**
  * Accessor method to get the pop-up display object.
  * @param -none
  * @return
  *   The pop-up display object.
  **/
  function getText(){
    return textbox;
  }
  this.getText = getText;

  /**
  * Manipulator method to set the date object to be checked.
  * @param param *REQUIRED*
  *   the date object
  **/
  function setDate(param){
    datebox = param;
  }
  this.setDate = setDate;

  /**
  * Manipulator method to set the associated text object.
  * @param param *REQUIRED*
  *   The object to show the pop-up display
  **/
  function setText(param){
    textbox = param;
  }
  this.setText = setText;

  /**
  * Manipulator method to hide the pop-up display.
  * @return
  *   None
  **/
  function hideAssocItem(){
    textbox.style.display = "none";
  }
  this.hideAssocItem = hideAssocItem;

  /**
  * Manipulator method to show the pop-up display
  * @return
  *   None
  **/
  function showAssocItem(){
    rePositionWeDatePopupDiv();
    textbox.style.display = "inline";
  }
  this.showAssocItem = showAssocItem;

  /**
  * Function that starts an interval check on the input text
  * calls validateDate
  * @return
  *  -None
  **/
  function start(){
	validateDate();
  }
  this.start = start;

}
//****************************************************************************//


/************************************
variables required for date script
*/
var dateConstants = new WeDateConstants();
var dateObject = new WeDate();
var dateDisplay = new WeDateDisplay();
//***********************************//


/**
* onfocus event for input.  Starts the process to validate the input text
* @param item *REQUIRED*
*   The object to start checking
* @param styles *OPTIONAL*
*   The class to use is based on the module's tab type:
*   - null - Default,
*   - P - Admin,
*   - C - Clinical,
*   - H - Home,
*   - E - QIA
*   - R - CRM
* @param format *OPTIONAL*
*  The format of the resulting date
* @param loc *OPTIONAL*
*  The locale
* @return
*   None
**/
function setDateItem(item, styles, format, loc){
  if(null == format){format = "MM/DD/YYYY";} //default format in case param not sent
  if(null == loc){loc = "en_US";} //default format in case param not sent

  //Set up mask/locale
  dateConstants.setLoc(loc, format);

  if(document.getElementById(dateDisplay.id) == null){
    var newDateTextDiv = null;
    newDateTextDiv = document.createElement('div');
    newDateTextDiv.id = dateDisplay.id;
    document.body.appendChild(newDateTextDiv);
  }

  //Assign objects
  dateDisplay.setText(document.getElementById(dateDisplay.id));
  dateDisplay.setDate(item);
  dateDisplay.setFormat(format);

  if(dateDisplay.getText()){
    validateDate();
    dateDisplay.showAssocItem();
  }
  dateDisplay.start();
  return true;
}


function hideDateItem(){
	document.getElementById(dateDisplay.id).style.display = 'none';
}

/**
* onResize event; repositions div
* @return
*   None
**/
function rePositionWeDatePopupDiv(){
  var object = dateDisplay.getText();
  var field = dateDisplay.getDate();
  var rect = field.getBoundingClientRect();
  var scrollTop = document.documentElement.scrollTop ? document.documentElement.scrollTop : document.body.scrollTop;
  var scrollLeft = document.documentElement.scrollLeft ? document.documentElement.scrollLeft : document.body.scrollLeft;
  object.style.left = (rect.left + scrollLeft) + 'px';
  object.style.top = (rect.bottom + scrollTop + 1) + 'px';
}


/**
 * This event handler is found for not keydown but keypress based on the usage.
 * 
* Checks for the "T" key and the "[" and "]" keys
* the "T" key sets the date to the current date
* the "[" key decreases the day by one
* the "]" key increases the day by one
* @param e *REQUIRED*
*   The key event
* @return
*   None
**/
function filterKeys(e){
  var retval = true;

  if(!e){
    e = window.event;
  }
  var charcode = getEventCharCode(e);
  var inputField = e.target;

  if(charcode == 84 || charcode == 116){
    //T or t
    var now = new Date();
    inputField.value = dateConstants.getLoc() == "en_GB" ? "" + (now.getDate()) + "/" + (now.getMonth()+1) + "/" + now.getFullYear() : "" + (now.getMonth()+1) + "/" + now.getDate() + "/" + now.getFullYear();
    inputField.select();
    retval = false;
  }
  if(charcode == 91 || charcode == 93){
    // [ or ]
    dateConstants.getLoc() == "en_GB" ? stringToDMY(inputField.value) : stringToMDY(inputField.value);
    buildFriendlyDates();

    var dt = new Date(dateObject.getYear(),dateObject.getMonth()-1,dateObject.getDay());

    // Add 25 hours to make sure we work when we cross the daylight savings time boundary
    // or subtract 2 hours when going backwards

    if(charcode == 93){
      dt.setTime(dt.getTime() + (1000*60*60*25));
    } else {
      dt.setTime(dt.getTime() - (1000*60*60*23));
    }
    inputField.value = dateConstants.getLoc() == "en_GB" ? "" + (dt.getDate()) + "/" + (dt.getMonth()+1) + "/" + dt.getFullYear() : "" + (dt.getMonth()+1) + "/" + dt.getDate() + "/" + dt.getFullYear();
    inputField.select();
    retval = false;
  }
  return retval;
}


/**
* Finds the ASCII character code of the input event
* @param event *REQUIRED*
*   The current OnKeyDown event
* @return
*   The character code of the key that was input
**/
function getEventCharCode(event){
  if(!event){
    event = window.event;
  }
  if(event){
    //Some browsers use .keycode, others use .which; this will work universally
    if(event.keyCode){
      return event.keyCode;
    } else {
      return event.which;
	}
  }
  return 0;
}


/**
* creates and displays a user-friendly version of the currently
* typed-in date string
* @return
*   None
**/
function validateDate(){
  dateObject.setFriendlyDate(dateConstants.getInputGuide());
  dateObject.setReformDate("");

  if(dateDisplay.getDate() != 0 && dateDisplay.getDate().value != ""){
    dateConstants.getLoc() == "en_GB" ? stringToDMY(dateDisplay.getDate().value) : stringToMDY(dateDisplay.getDate().value);
    buildFriendlyDates();
  }
  if(dateDisplay.getText()){
    if(dateDisplay.getText().innerHTML != "<span class=\"" + dateDisplay.getStyle() + "\">" + dateObject.getFriendlyDate() + "</span>"){
      dateDisplay.getText().innerHTML = "<span class=\"" + dateDisplay.getStyle() + "\">" +  dateObject.getFriendlyDate() + "</span>";
    }
  }
}

/**
* helper function for validateDate
* builds friendlyDate and reformatedDate from the dateObject's values
* @return
*   None
**/
function buildFriendlyDates(){
  var ms = "??";
  var msr = "??";
  var ds = "??";
  var dsr = "??";

  // Month
  if(!isNaN(dateObject.getMonth())){
    if(dateObject.getMonth() < 1){dateObject.setMonth(1);}
    if(dateObject.getMonth() > 12){dateObject.setMonth(12);}

    ms = dateConstants.getMonthName(dateObject.getMonth()).substring(0,3);
    if(dateObject.getMonth() < 10){
      msr = "0" + dateObject.getMonth();
    } else {
      msr = dateObject.getMonth();
    }
  } else {
    dateObject.setMonth(1);
    ms = dateObject.getMonth();
    msr = "0" + dateObject.getMonth();
  }

  // Year
  if(isNaN(dateObject.getYear())){
    var now = new Date();
    dateObject.setYear(now.getFullYear());
  } else if(dateObject.getYear() < 30){
    dateObject.addYears(2000);
  } else if(dateObject.getYear() < 100){
    dateObject.addYears(1900);
  } else if(dateObject.getYear() < 1000){
    //Make sure that we have 4 digits
    dateObject.addYears(2000);
  } else {
    //Only take first 4 digits
    var tempDate = "" + dateObject.getYear(); //substring undefined for integer data
    tempDate = tempDate.substring(0,4);
    dateObject.setYear(tempDate);
  }

  // Day
  if(!isNaN(dateObject.getDay())){
    if(dateObject.getDay() < 1){
      dateObject.setDay(1);
    } else if(!isNaN(dateObject.getMonth()) && dateObject.getDay() > dateConstants.getMaxDays(dateObject.getMonth(), dateObject.getYear())){
      dateObject.setDay(dateConstants.getMaxDays(dateObject.getMonth(), dateObject.getYear()));
    }
    ds = dateObject.getDay();

    if(dateObject.getDay() < 10){
      dsr = "0" + dateObject.getDay();
    } else {
      dsr = dateObject.getDay();
    }
  } else {
    dateObject.setDay(1);
    ds = dateObject.getDay();
    dsr = "0" + dateObject.getDay();
  }
  dateObject.setReformDate(msr + "/" + dsr + "/" + dateObject.getYear());
  dateConstants.getLoc() == "en_GB" ? dateObject.setFriendlyDate(ds  + " " + ms  + ", " + dateObject.getYear()) : dateObject.setFriendlyDate(ms  + " " + ds  + ", " + dateObject.getYear());
}


/**
* Converts a month name to the integer value of that month
* @param s *REQUIRED*
*   The text of the month name
* @return
*   The integer value (1-12) of the input month
*  Returns 0 if the string is not recognized
**/
function monthNameToMonth(s){
  var n;
  var subs;
  var len;

  for(n=1;n<13;n++){
    len = dateConstants.getMonthAbbrev(n).length;
    subs = s.substr(0, len).toLowerCase();

    if(subs == dateConstants.getMonthAbbrev(n)){
      return n;
    }
  }
  return 0;// we need to return something
}


/**
* Converts a string date to one in "MM/DD/YYYY" format
* @param s *REQUIRED*
*   The dat eas a string
* @return
*   the date in MM/DD/YYYY format
**/
function stringToMDY(s){
  dateObject.setMonth(Number.NaN);
  dateObject.setDay(Number.NaN);
  dateObject.setYear(Number.NaN);

  var toks = s.match(/[a-zA-Z_0-9]+/g);

  if(toks){
    if(toks.length == 1){
      dateObject.setMonth(parseInt(s.substring(0,2), 10));
      if(isNaN(dateObject.getMonth())){
        //check if it might be an alphabetic month
        dateObject.setMonth(monthNameToMonth(s));
      } else {
        dateObject.setDay(parseInt(s.substring(2,4), 10));
        dateObject.setYear(parseInt(s.substring(4,8), 10));
      }
    }
    if(toks.length > 1){
      dateObject.setMonth(parseInt(toks[0], 10));
      if(isNaN(dateObject.getMonth())){
        //check if it might be an alphabetic month
        dateObject.setMonth(monthNameToMonth(toks[0]));
      }
      dateObject.setDay(parseInt(toks[1], 10));
      dateObject.setYear(parseInt(toks[2], 10));
    }
  }
}

/**
 * Converts a string date to one in "DD/MM/YYYY" format
 * @param s *REQUIRED*
 *   The date as a string
 * @return
 *   the date in DD/MM/YYYY format
 **/
function stringToDMY(s){
  dateObject.setMonth(Number.NaN);
  dateObject.setDay(Number.NaN);
  dateObject.setYear(Number.NaN);

  var toks = s.match(/[a-zA-Z_0-9]+/g);

  if(toks){
    if(toks.length == 1){
      dateObject.setMonth(parseInt(s.substring(2,4), 10));
      if(isNaN(dateObject.getMonth())){
        //check if it might be an alphabetic month
        dateObject.setMonth(monthNameToMonth(s));
      } else {
        dateObject.setDay(parseInt(s.substring(0,2), 10));
        dateObject.setYear(parseInt(s.substring(4,8), 10));
      }
    }
    if(toks.length > 1){
      dateObject.setMonth(parseInt(toks[1], 10));
      if(isNaN(dateObject.getMonth())){
        //check if it might be an alphabetic month
        dateObject.setMonth(monthNameToMonth(toks[1]));
      }
      dateObject.setDay(parseInt(toks[0], 10));
      dateObject.setYear(parseInt(toks[2], 10));
    }
  }
}

/**
* onblur event for input.  reformats the date to be acceptable to form handler
* @param text *REQUIRED*
*   the date to reformat as a string object
* @return
*   the date in a different format
**/
function reformatDate(text){
	dateDisplay.hideAssocItem();
	validateDate();
	text.value = formatDate(dateObject.getReformDate(), dateDisplay.getFormat());
}


/**
* Changes the format of the date to the format input
* @param dateValue *REQUIRED*
*   The current date in "MM/DD/YYYY" format
* @param formatString *REQUIRED*
*   The format to reformat the date to
* @return
*   the input date reformatted with the format string
**/
function formatDate(dateValue, formatString){
  //pre: date comes as mm/dd/yyyy string
  //Post: date is returned in proper format
  formatString = formatString.toUpperCase();
  var retVal = "";
  var month = false;
  var day = false;
  var year = 0;
  for(var i=0;i<formatString.length;++i){
    if(formatString.charAt(i) != 'M' && formatString.charAt(i) != 'D' && formatString.charAt(i) != 'Y'){
      if(month){
        retVal += dateValue.substring(0,2);
        month = false;
      }
      if(day){
        retVal += dateValue.substring(3,5);
        day = false;
      }
      if(year == 2){
        retVal += dateValue.substring(6,8);
        year = 0;
      } else if(year > 2){
        retVal += dateValue.substring(6,10);
        year = 0;
      }
      retVal += formatString.charAt(i);
    } else {
      if(formatString.charAt(i) == 'M'){//month
        if(day){
          retVal += dateValue.substring(3,5);
          day = false;
        }
        if(year == 2){
          retVal += dateValue.substring(8,10);
          year = 0;
        } else if(year > 2){
          retVal += dateValue.substring(6,10);
          year = 0;
        }
        month = true;
      } else if(formatString.charAt(i) == 'D'){//day
        if(month){
          retVal += dateValue.substring(0,2);
          month = false;
        }
        if(year == 2){
          retVal += dateValue.substring(8,10);
          year = 0;
        } else if(year > 2){
          retVal += dateValue.substring(6,10);
          year = 0;
        }
        day = true;
      } else {//year
        if(month){
          retVal += dateValue.substring(0,2);
          month = false;
        }
        if(day){
          retVal += dateValue.substring(3,5);
          day = false;
        }
        ++year;
      }
    }
  }
  //final check
  if(month){
    retVal += dateValue.substring(0,2);
  }
  if(day){
    retVal += dateValue.substring(3,5);
  }
  if(year == 2){
    retVal += dateValue.substring(8,10);
  } else if(year > 2){
    retVal += dateValue.substring(6,10);
  }
  if("" != dateValue){
    return retVal;
  } else {
    return "";
  }
}