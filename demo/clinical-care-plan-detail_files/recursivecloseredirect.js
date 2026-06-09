function recursivelyCloseOpenersThenRedirect(redirectUrl) {
    //get the top level window (in case we are iframe'd)
    var topLevelWindow = window.top;
    var hasAccessibleOpener = false;
    if (typeof (topLevelWindow.opener) == 'object' && topLevelWindow.opener != null) {
        if (typeof (topLevelWindow.opener.location) == 'object') {
            hasAccessibleOpener = true;
        }
    }
    if (hasAccessibleOpener) {
        //IE throws an exception if a script tag is created on one window, but appended to another window
        //as such, for IE we are creating the script tag on the opener
        topLevelWindow.opener._scriptTag = topLevelWindow.opener.document.createElement('script');
        topLevelWindow.opener._scriptTag.text = window.recursivelyCloseOpenersThenRedirect.toString();
        topLevelWindow.opener.document.head.appendChild(topLevelWindow.opener._scriptTag);



        //call function that is now defined on the opener
        topLevelWindow.opener.recursivelyCloseOpenersThenRedirect(redirectUrl);
        //close this window, or redirect if we can't
        try{
            topLevelWindow.window.close();
        } catch(ex){
            topLevelWindow.location.href = redirectUrl;
        }
    } else {
        topLevelWindow.location.href = redirectUrl;
    }
}