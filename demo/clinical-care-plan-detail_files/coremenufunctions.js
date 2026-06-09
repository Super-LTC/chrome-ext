function submitSearchNew(){
    $('#pccSearchTooltip').hide();
    var f = document.forms['slsearch'];
    var substring = f.elements['substring'].value;
    substring = substring.trim();
    var fld = "name";

    function valueOf(name) {
      return (f.elements[name] ?? {}).value;
    }

    if(substring.length <= 0){
        showAlert({
          body: 'The search field cannot be left blank.<br/>Please enter at least one character to perform a search.'
        });
        return;
    } else if(valueOf('delegateToSearchInSlehr') === 'true'
        && valueOf('ESOLglobalclientsearch') !== 'Y') {

        const transferUri = '/wdw/transferToWDW.xhtml';
        const targetUrl = "?targetUrl=/ui/residents/all/search/" + encodeURIComponent(substring);
        window.open(transferUri + targetUrl, '_self');
    } else if(valueOf('delegateToSearchInSeniorLivingPersonManagement') === 'true'
        && valueOf('isFeatureFlagCoreRevertCORE129465Enabled') === 'false'
        && valueOf('ESOLglobalclientsearch') !== 'Y') {

        const adminURL = "/web/admin/residentmanagement";
        const allSearchURI = "/all/search/";
        location.href = adminURL + allSearchURI + encodeURIComponent(substring);
        if(location.pathname === adminURL) {
          location.reload();
        }
    } else {
        var substringFormattingRemoved = substring.replace(/[^a-z0-9]/gi, "");

        var nineDigitRegex = /^(\d){9}$/;
        if(isHicnNumberFormat(substringFormattingRemoved) || isMbiNumberFormat(substringFormattingRemoved) || isRrbNumberFormat(substringFormattingRemoved)){
            //search by medicare/hicn #
            fld = "medicare";
        } else if(nineDigitRegex.test(substringFormattingRemoved)){
            //if the search string is exactly 9 digits long, search against SSN/SIN
            fld = "potential_ssn_sin";
        } else if(substring.match(/[\d\.]/g)){
            fld = "number";
        }
        f = document.forms['slsearch'];
        f.elements['basequery'].value = substringFormattingRemoved;
        let searchResultTab = tabType;
        let defaultSearchResultTabField = f.elements['defaultResidentSearchView'];
        if(defaultSearchResultTabField != null){
            let defaultSearchResultTab = defaultSearchResultTabField.value;
            if(defaultSearchResultTab == 'admin'){
                searchResultTab = 'P';
            } else if(defaultSearchResultTab == 'clinical'){
                searchResultTab = 'C';
            }
        }
        var searchUrl = "/admin/client/clientlist.jsp?ESOLinemc=&pds=&ESOLtabtype=" + searchResultTab + "&fld=" + fld + "&substring=" + substring + "&basequery=" + substringFormattingRemoved;
        if (f.elements['ESOLglobalclientsearch'] && f.elements['ESOLglobalclientsearch'].value == 'Y') {
            f.target = 'global_client_search';
            try {
                f.action = searchUrl + '&ESOLglobalclientsearch=Y';
                f.elements['ESOLglobalclientsearch'].disabled = false;
                openSizedLookup2(f.action, 'global_client_search', 1000, 700, 'scrollbars');
                if (inEMCFGC) {
                    slsearch.ESOLglobalclientsearch.disabled = true;
                }
            } finally {
                f.action = 'javascript:submitSearchNew();';
                f.target = '';
            }
        } else {
            location.href = searchUrl;
        }
    }
}

$(document).on("keypress", "#searchField", function(e){
    if(e.keyCode == 13){
        submitSearchNew();
        return false;
    }
});

$(document).on('mouseenter', '#searchFieldInfoIcon', function(e){
    let pos = $('#searchField').position();
    $('#pccSearchTooltip').css({'left': pos.left - 70, 'top': pos.top + 25});
    $('#pccSearchTooltip').fadeIn();
});

$(document).on('mouseleave', '#searchFieldInfoIcon', function(e){
    $('#pccSearchTooltip').hide();
});

$(document).on('mouseenter', '.maintenanceModeIcon', function(e){
    let pos = $(e.target).position();
    $('#pccMaintenanceModeTooltip').css({'left': pos.left + 20, 'top': pos.top - 7});
    $('#pccMaintenanceModeTooltip').fadeIn();
});

$(document).on('mouseleave', '.maintenanceModeIcon', function(e){
    $('#pccMaintenanceModeTooltip').hide();
});

$(document).ready(function(){
    if (typeof tabsMenuLoaded != 'undefined' && tabsMenuLoaded == true) {
        // Build Menu
        var menuObj = document.createElement('ul');
        menuObj.id = "topTabs";

        if (typeof(menu)!='undefined') {
            for ( var t = 0; t < menu.tabs.length; t++) {
                var obj = menu.tabs[t];

                // Tab Objects
                var turl = obj.r;
                var tlabel = obj.a;
                var ttype = obj.y;
                var tmoduleId = obj.o;
                var ttabClass = obj.b;

                //tabs
                var topTab = document.createElement('li');
                topTab.id ='QTF_'+ttabClass;
                topTab.className = ttabClass;

                if (tmoduleId == currentTab){
                    topTab.className = ttabClass + ' activeTab';
                } else {
                    topTab.className = "";
                }
                menuObj.appendChild(topTab);

                var tabLink = document.createElement('a');
                if ((ttype == 'TB') && touchEnabled) {
                    tabLink.href = 'javascript:void(0)';
                } else {
                    // if a resident page
                    if (isResHeaderPage && tmoduleId != currentTab && currentClientId != "null"){
                        if (tmoduleId == 2 || tmoduleId == 4){
                            tabLink.href = clientJumpTab+'?ESOLclientid='+clientJumpClientId;
                        } else if (tmoduleId == 3 || tmoduleId == 5){
                            tabLink.href = careJumpTab+'?ESOLclientid='+careJumpClientId;
                        } else {
                            tabLink.href = turl;
                        }
                    } else {
                        tabLink.href = turl;
                    }
                }
                if (ttype == 'TB') {
                    tabLink.className = 'arrowDrop darkArrowDrop';

                } else {
                    tabLink.className = 'noArrowDrop';
                }
                var tabLinkName = document.createTextNode(tlabel);
                tabLink.appendChild(tabLinkName);
                topTab.appendChild(tabLink);

                var topMegaMenu = document.createElement('div');
                topMegaMenu.className = 'megaMenu mm'+tlabel+'Box';
                topTab.appendChild(topMegaMenu);

                // if links
                if (obj.links) {
                    for ( var l = 0; l < obj.links.length; l++) {
                        var linkobj = obj.links[l];

                        // Item Objects
                        var iurl = linkobj.u;
                        var ilabel = linkobj.l;
                        var itemTarget = linkobj.g;
                        var iiconUrl = linkobj.i;

                        if (ilabel == "mmTitle") {
                            var topMMboxes = document.createElement('div');
                            topMMboxes.className = 'mmBoxes';
                            topMegaMenu.appendChild(topMMboxes);

                            var mmHeading = document.createElement('h5');
                            var mmHeadingName = document.createTextNode(iiconUrl);
                            mmHeading.appendChild(mmHeadingName);
                            topMMboxes.appendChild(mmHeading);

                            var mmList = document.createElement('ul');
                            mmList.className = 'mmList';
                            topMMboxes.appendChild(mmList);
                        } else if (ilabel == "mmTitleInline") {  
                            var mmTitleBreak = document.createElement('br');
                            topMMboxes.appendChild(mmTitleBreak);

                            var mmTitleInline = document.createElement('h5');
                            var mmTitleInlineName = document.createTextNode(iiconUrl);
                            mmTitleInline.appendChild(mmTitleInlineName);
                            topMMboxes.appendChild(mmTitleInline);

                            var mmList = document.createElement('ul');
                            mmList.className = 'mmList';
                            topMMboxes.appendChild(mmList);
                        } else if (ilabel == "mmTitleSeperator") {
                            var topMMboxesSep = document.createElement('div');
                            topMMboxesSep.className = 'mmBoxes mmBoxesSeperator';
                            topMegaMenu.appendChild(topMMboxesSep);
                        } else if (ilabel == "mmEnd") {
                            var topMMend = document.createElement('p');
                            topMegaMenu.appendChild(topMMend);
                        } else { 
                            var mmItemList = document.createElement('li');
                            mmList.appendChild(mmItemList);

                            var mmItem = document.createElement('a');
                            mmItem.href = iurl;
                            if(itemTarget != null && itemTarget != '' && iurl.indexOf('javascript:') == -1){
                                mmItem.setAttribute('target', itemTarget);
                            }
                            var mmItemName = document.createTextNode(ilabel);
                            mmItem.appendChild(mmItemName);
                            mmItemList.appendChild(mmItem);
                        }
                    }
                }
            }
        }
        $('.slMainNavTabs').append(menuObj);

        // Add Menu Dropdown Logic
        $('#appAriaHeaderOne').text($('html title').text());

        // Queue up a single call to positionMenus when either menu link is clicked
        var initMenuPositions = (function(){
            var executed = false;
            return function(){
                if(!executed){
                    executed = true;
                    positionMenus();
                }
            };
        })();
        $('#pccFacLink, #pccUserLink').one('click', function(){
            initMenuPositions();
        });

        $(window).resize(function(){
            positionMenus();
            $('#pccSearchTooltip').hide();
        });

        $("#pccUserMenu").mouseleave(function() {
            $(this).hide();
        });

        $("#searchAll").mouseleave(function() {
            $(this).hide();
        });

        //global variables
        facilityViewsLoaded = {};
        facilityViewsLoaded['billingoffices'] = null;
        facilityViewsLoaded['campuses'] = null;
        pccFacilityChooserLoaded = false;
        $("#pccFacLink").click(function(e){
            var facChooserMenu = $("#pccFacMenu");
            if(facChooserMenu.css('display') == "none"){
                if(!pccFacilityChooserLoaded){
                    //load chooser content
                    facChooserMenu.load(facilityListURL, function(response, status, jqXHR){
                        if(status == 'success'){
                            pccFacilityChooserLoaded = true;
                        } else {
                            //TODO: if we get an error here what should we do?
                        }
                    });
                }
                showFacilityChooser();
            } else {
                facChooserMenu.hide();
                facChooserMenu.removeClass("navLinkSelected");
            }
            e.stopPropagation();
        });

        $(".megaMenu").click(function(){
            $(".megaMenu").hide();
        });
        
        $("#pccUserLink").click(function(e){
            var menu = "#" + $(this).attr('id').replace("Link", "Menu");
            if($(menu).css("display") == "none"){
                $(".dropDownList").hide();	
                $(menu).show(0, function(){
                    //if showing the facility menu and the search box is visible focus it
                    if($('#facSearchFilter:visible').length > 0){
                        $('#facSearchFilter').focus();
                    }
                });
                $("#pccFacLink, #pccUserLink").removeClass("navLinkSelected");
                $(this).addClass("navLinkSelected");
                e.stopPropagation();
            } else {
                $(menu).hide();
                $(this).removeClass("navLinkSelected");
            }
        });

        $("#searchSelect").click(function(e){
            var menu = $("#searchAll");
            if($(menu).css("display") == "none"){
                $(menu).slideDown(200);
                e.stopPropagation();
            } else {
                $(menu).hide();
            }
        });

        window.topTabsClicked = false;

        if (isTouchEnabledFlag) {
            $("#topTabs .arrowDrop").click(function() {
                if ($(this).next(".megaMenu").css("display") == 'block') {
                    $(this).next(".megaMenu").css("display", "none");
                    $(this).attr('id', 'mmTouchTabOff');
                } else {
                    $(this).next(".megaMenu").css("display", "block");
                    $(this).removeAttr('id');
                }
            });
        }

        // opens mega menu id there is a dropdown
        $("#topTabs .arrowDrop").mouseenter(function() {
            if (isTouchEnabledFlag) {
                $("#topTabs .arrowDrop").removeAttr('id');
            }
            $(".megaMenu").css("display", "none");
            $("#topTabs .arrowDrop").removeClass('mmTabColorHover');
            var mmState = $(this);
            var mmParentTab = $(this).next(".megaMenu").attr('class').split(' ')[1];
            var topTabPosition = $(this).offset().left;
            if(topTabPosition > 11) {
                $(this).next(".megaMenu").css("left", (topTabPosition - 20)+"px");
            } else {
                $(this).next(".megaMenu").css("left", (topTabPosition - 1)+"px");
            };

            mmState.next(".megaMenu").css("display", "block");
            var maxHeight = 0;
            $("."+mmParentTab+" div.mmBoxes").each(function(){
                if ($(this).height() > maxHeight) { maxHeight = $(this).height(); }
            });
            $("."+mmParentTab+" div.mmBoxes").height(maxHeight);
        }).mouseleave(function(){
            var activeTab = $(this);
            activeTab.addClass('mmTabColorHover');
            timeoutId = setTimeout(function(){
                if (!(activeTab.next(".megaMenu").hasClass('is-hover'))) {
                    activeTab.next(".megaMenu").css("display", "none");
                    $("#topTabs .arrowDrop").removeClass('mmTabColorHover');
                }
            }, 100);
            activeTab.data('timeoutId', timeoutId);
        });

        $(".megaMenu").hover(
            function(){
                $(this).addClass('is-hover');
            },
            function(){
                $(this).removeClass('is-hover');
            }
        );

        $(".megaMenu").mouseleave(function() {
            $(this).css("display", "none");
            $("#topTabs .arrowDrop").removeClass('mmTabColorHover');
        });

        $("#topTabs .noArrowDrop").mouseover(function() {
            $(".megaMenu").css("display", "none");
        });

        $(".dropDownList ul li, #searchAll tr").hover(
            function(){
                $(this).children().css("background-color", "#f2f2f2");
            },
            function(){
                $(this).children().css("background-color", "#fff");
            }
        );

        $("#pccFacMenu .dropDownList li").click(function() {
            $(this).find("a")[0].click();
        });

        $(".nestedItem").hover(
            function(){
                $(".secondNavNested").show();
                $(this).removeClass('nestedItemTabColor').addClass('nestedItemTabColorHover');
            },
            function(){
                $(".secondNavNested").hide();
                $(this).removeClass('nestedItemTabColorHover').addClass('nestedItemTabColor');
            }
        );
        $(".nestedActionItem").hover(
            function(){
                $(".secondNavNestedAction").show();
                $(this).removeClass('nestedActionItemColor').addClass('nestedActionItemColorHover');
            },
            function(){
                $(".secondNavNestedAction").hide();
                $(this).removeClass('nestedActionItemColorHover').addClass('nestedActionItemColor');
            }
        );
        setInitialGlobalClientSearchFlag();
    }
});

$(document).click(function(e){
    if($("#pccFacMenu").is(":visible") && !$("#pccFacMenuContainer *").is(e.target)){
        $("#pccFacMenu").hide();
        $("#pccFacLink, #pccUserLink").removeClass("navLinkSelected");
    }
    if($("#pccUserMenu").is(":visible") && !$("#pccUserMenu").is(e.target)) {
        $("#pccUserMenu").hide();
        $("#pccFacLink, #pccUserLink").removeClass("navLinkSelected");
    }
    if($("#searchAll").is(":visible") && !$("#searchAll >").is(e.target)) {
        $("#searchAll").hide();
    }
});

function showFacilityChooser(){
    $(".dropDownList").hide();
    var facChooserMenu = $("#pccFacMenu");
    facChooserMenu.show(0, function(){
        //if showing the facility menu and the search box is visible focus it
        if($('#facSearchFilter:visible').length > 0){
            $('#facSearchFilter').focus();
        }
    });
    $("#pccFacLink, #pccUserLink").removeClass("navLinkSelected");
    $(this).addClass("navLinkSelected");
}

function setInitialGlobalClientSearchFlag(){
    if (inEMCflag){
        $("input[name='ESOLglobalclientsearch']").val('Y');
        $("#searchSelect .facility").attr("title", "All Facilities");
    } else {
        $("input[name='ESOLglobalclientsearch']").val('N');
        $("#searchSelect .facility").attr("title", "This Facility");
    }
}

function getDefaultViewPortal(){
	var defaultView;

	$.ajax({
		url: '/user/userpreference.xhtml',
		data: {'param':'emar_portal_default_view_set'},
		async: false,
		success: function(data){
		    defaultView = JSON.parse(data).resultDetail;
		}
	});

	return defaultView;
}

function editUserProfile(href){
	pccPopup(href, "edituserprofile", 540, 580);
}

function switchFacImg(imgName) {
	$("#searchSelect .facility").attr("src", "/images/" + imgName + ".png");
	$("#searchAll").hide();
}

function switchToGlobalSearch(enableGlobalSearch){
	if(enableGlobalSearch == true) {
		$("#searchSelect .facility").attr("title", "All Facilities");
		$("input[name='ESOLglobalclientsearch']").val('Y');
	} else {
		$("#searchSelect .facility").attr("title", "This Facility");
		$("input[name='ESOLglobalclientsearch']").val('N');
	}
}

function positionMenus(){
	var userLinkLeft = document.getElementById('pccUserLink').getBoundingClientRect().left;
	var userLinkWidth = $('#pccUserLink').outerWidth();

	var userMenu = $('#pccUserMenu');
	userMenu.css({ position: "absolute", visibility: "hidden", display: "block" });
	var userMenuWidth = userMenu.outerWidth();
	userMenu.css({ position: "", visibility: "", display: "" });

	$("#pccUserMenu").css("left", ((userLinkLeft + userLinkWidth) - userMenuWidth) + 'px');


	var facLinkLeft = document.getElementById('pccFacLink').getBoundingClientRect().left;
	var facLinkWidth = $("#pccFacLink").outerWidth();

	var facMenu = $('#pccFacMenu');
	facMenu.css({ position: "absolute", visibility: "hidden", display: "block" });
	var facMenuWidth = facMenu.outerWidth();
	facMenu.css({ position: "", visibility: "", display: "" });

	$("#pccFacMenu").css("left", ((facLinkLeft + facLinkWidth) - facMenuWidth) + 'px');
}


// isInitialsSet set in tabsmenu.jsp
function goToEMAR(sameWindow){
	if(isInitialsSet){
		if(sameWindow){
			window.location.replace('/emar/userInitialsPopup.xhtml?fromPCC=Y&newForm=Y');
		} else {
			window.open('/emar/userInitialsPopup.xhtml?fromPCC=Y&newForm=Y','window');
		}
	} else {
		// log into emar
		if(getDefaultViewPortal() == 1)
		{
			if(sameWindow){
				window.location.replace('/emar/emarportal.xhtml');
			} else {
				window.open('/emar/emarportal.xhtml?closeWindowOnLogout=Y','new');
			}
		} else {
			if(sameWindow){
				window.location.replace('/emar/emarResidentsList.xhtml?ESOLGuid=2_'+Date.now());
			} else{
				window.open('/emar/emarResidentsList.xhtml?closeWindowOnLogout=Y&ESOLGuid=3_'+Date.now(),'new');
			}
		}
	}
}

// isInitialsSet set in tabsmenu.jsp
function initialsPopupCallback(window){
	//reset flag in case user again wants to login
	isInitialsSet = false;
	// open emar
	window.location.href = "/emar/emarResidentsList.xhtml?ESOLGuid=4_"+Date.now();
}