const _marketplaceVendorPopupElems = {
    errorLabel: function () { return document.getElementById('marketplace-vendor-popup-error'); },
    singleAppContainer: function() { return document.getElementById('marketplace-single-app-container'); },
    appNameLabel: function() { return document.getElementById('marketplace-single-app'); },
    multipleAppContainer: function() { return document.getElementById('marketplace-multiple-app-container'); },
    legalMessageContainer: function() { return document.getElementById('marketplace-legal-message-container'); },
    vendorSelect: function() { return document.getElementById('marketplace-vendor-select'); },
    selectedVendorOption: function() { return $('#marketplace-vendor-select option:selected'); },
    vendorSelectRequiredLabel: function() { return document.getElementById('marketplace-vendor-select-required'); },
    confirmButton: function() { return document.getElementById('btn-dialog-confirm'); }
}

const _marketplaceVendorPopupGenericErrorMsg = "An unexpected error occurred. Please try again later.";

// Global state object to store loaded applications
const _marketplaceVendorPopupState = {
    applications: {},
    selectedApplication: null
};

function resetMarketplaceVendorPopupState() {
    _marketplaceVendorPopupState.applications = {};
    _marketplaceVendorPopupState.selectedApplication = null;

    $(_marketplaceVendorPopupElems.errorLabel()).textContent = "";
    $(_marketplaceVendorPopupElems.singleAppContainer()).hide();
    $(_marketplaceVendorPopupElems.multipleAppContainer()).hide();
    $(_marketplaceVendorPopupElems.legalMessageContainer()).hide();
    _marketplaceVendorPopupElems.confirmButton().disabled = true;
    _marketplaceVendorPopupElems.vendorSelectRequiredLabel().textContent = "";
    $(_marketplaceVendorPopupElems.vendorSelect()).empty();
}

function showErrorInDialog(errMsg) {
    resetMarketplaceVendorPopupState();
    errMsg = errMsg ? errMsg : _marketplaceVendorPopupGenericErrorMsg;
    _marketplaceVendorPopupElems.errorLabel().textContent = errMsg;
}

function showNewErrorDialog(errMsg) {
    errMsg = errMsg ? errMsg : _marketplaceVendorPopupGenericErrorMsg;
    openPopupWin("/common/popup/extlinkopen.xhtml?error="+encodeURIComponent(errMsg), 'errorpagepopup', 1100, 600, 'toolbar=no,status=no,directories=no,menubar=no,resizable=yes,location=1,scrollbars=no');
}

function selectedAppChanged() {
    const selectedAppName = $(_marketplaceVendorPopupElems.vendorSelect()).val();
    const validAppSelected = selectedAppName !== '-1';
    _marketplaceVendorPopupState.selectedApplication = validAppSelected ? selectedAppName : null;

    _marketplaceVendorPopupElems.vendorSelectRequiredLabel().textContent = "Required";
    $(document.querySelector('.mdwc-notched-outline__notch')).toggleClass('mdwc-notched-outline__notch--notched', validAppSelected);
    $(_marketplaceVendorPopupElems.legalMessageContainer()).toggle(validAppSelected);
    _marketplaceVendorPopupElems.confirmButton().disabled = !validAppSelected;

    if (!validAppSelected) {
        _marketplaceVendorPopupElems.vendorSelect().focus();
    }
}

function openMarketPlacePopup(clientId, context, screenLocation, facId, application, additionalResourceIds, additionalContext) {
    let url = `/fetch-vendor-apps.xhtml?resourceId=${clientId}&context=${context}&screenLocation=${screenLocation}`;
    if (facId) url += `&facId=${facId}`;
    if (application) url += `&application=${application}`;
    if (additionalResourceIds) url += `&additionalResourceIds=${additionalResourceIds}`;
    if (additionalContext) url += `&additionalContext=${additionalContext}`;

    openMarketPlacePopUpUsingUrl(url);
}

function fetchVendorApps(url) {
    $.ajax({
        url: url,
        type: 'GET',
        dataType: 'json',
        success: function (response) {
            // Some kind of error occurred or malformed response was received
            if (!response || !response.applicationJson || !response.multipleApplicationsDes || response.error) {
                return showErrorInDialog();
            }

            const applications = response.multipleApplicationsDes?.length > 0 ? response.multipleApplicationsDes : [];
            if (applications.length === 0) {
                return showErrorInDialog('No applications found');
            }

            try {
                const vendorSelect = $(_marketplaceVendorPopupElems.vendorSelect());

                $.each(applications, function(i, app) {
                    _marketplaceVendorPopupState.applications[app.applicationName] = app;
                    vendorSelect.append(`<option value="${app.applicationName}">${app.applicationName}</option>`);
                });

                if (applications.length === 1) {
                    _marketplaceVendorPopupElems.appNameLabel().textContent = applications[0].applicationName;
                    $(_marketplaceVendorPopupElems.singleAppContainer()).show();
                    selectedAppChanged();
                } else { // multiple applications
                    vendorSelect.prepend('<option value="-1" selected disabled hidden></option>');
                    vendorSelect.off('change').on('change', selectedAppChanged);
                    vendorSelect.off('focus').on('focus', function() {
                        $(document.querySelector('.mdwc-notched-outline__notch')).addClass('mdwc-notched-outline__notch--notched');
                        vendorSelect.closest('.mdwc-text-field').addClass('mdwc-text-field--focused');
                    });
                    vendorSelect.off('blur').on('blur', function() {
                        if (!_marketplaceVendorPopupState.selectedApplication) {
                            $(document.querySelector('.mdwc-notched-outline__notch')).removeClass('mdwc-notched-outline__notch--notched');
                        }
                        vendorSelect.closest('.mdwc-text-field').removeClass('mdwc-text-field--focused');
                    });
                    $(_marketplaceVendorPopupElems.multipleAppContainer()).show();
                    _marketplaceVendorPopupElems.vendorSelectRequiredLabel().textContent = "Required";
                }
            } catch (err) {
                showErrorInDialog();
            }
        },
        error: function() { showErrorInDialog(); }
    });
}

/**
 * Launches the selected vendor application using the state object.
 * Looks up the application data by name from _marketplaceVendorPopupState.applications.
 */
function openVendorApp() {
    const application = _marketplaceVendorPopupState.applications[_marketplaceVendorPopupElems.selectedVendorOption().val()];
    if (!application) {
        showNewErrorDialog('Application not found.');
        return;
    }

    // Construct the JSON object to be sent
    const appJson = {
        applicationName: application.applicationName,
        resourceId: application.resourceId,
        context: application.context,
        screenLocation: application.screenLocation,
        launchUUID: application.launchUUID,
        additionalResourceIds: application.additionalResourceIds,
        additionalContext: application.additionalContext,
        applicationAttributeDto : {
            appName : application.applicationAttributeDto?.appName,
            status : application.applicationAttributeDto?.status,
            appCategory: application.applicationAttributeDto?.appCategory,
            facilityStatus: application.applicationAttributeDto?.facilityStatus,
            appAudience: application.applicationAttributeDto?.appAudience,
            attributes  : application.applicationAttributeDto?.attributes ? [...application.applicationAttributeDto.attributes] : []
        }
    };

    $.ajax({
        url: '/fetch-multiple-vendor-url.xhtml',
        type: 'POST',
        contentType: 'application/json',
        data: JSON.stringify(appJson),
        success: function(response) {
            // Redirect to the URL returned in the response
            if (response.redirectUrl) {
                window.open(response.redirectUrl);
            } else if(response.errorMessage) {
                showNewErrorDialog(response.errorMessage);
            }
        },
        error: function() { showNewErrorDialog(); }
    });
}
function fetchAndPopulateSingleVendorApp(fetchUrl, appName) {
  $.ajax({
    url: fetchUrl,
    type: "GET",
    dataType: "json",
    success: function (response) {
      if (!response || !response.multipleApplicationsDes || response.error) {
        return showErrorInDialog();
      }

      const applications = response.multipleApplicationsDes;
      const matched =
        applications.find(function (app) {
          return app.applicationName === appName;
        }) || false;

      if (!matched) {
        return showErrorInDialog("No applications found");
      }

      _marketplaceVendorPopupState.applications[matched.applicationName] =
        matched;
      _marketplaceVendorPopupState.selectedApplication =
        matched.applicationName;

      const vendorSelect = $(_marketplaceVendorPopupElems.vendorSelect());
      vendorSelect.append(
        `<option value="${matched.applicationName}" selected></option>`,
      );

      _marketplaceVendorPopupElems.appNameLabel().textContent =
        matched.applicationName;
      $(_marketplaceVendorPopupElems.singleAppContainer()).show();
      $(_marketplaceVendorPopupElems.legalMessageContainer()).show();
      _marketplaceVendorPopupElems.confirmButton().disabled = false;
    },
    error: function () {
      showErrorInDialog();
    },
  });
}

function openMarketPlacePopUpForExternalLink(appName, resolvedUrl) {
    const content = { title: 'Open External Application'};
    MDWC.dialog('#marketplace-dialog-container', {
        id: "marketplace-multiapp-dialog",
        autoOpen: true,
        scrollable: false,
        detailsTemplateSelector: '._tmpl-marketplace-vendor-body',
        closeOnOverlayClick: false,
        classes: "oac-message-dialog",
        buttons: [
            {
                label: 'Open',
                type: MDWC.dialog.actions.type.CONFIRMING,
                id: "btn-dialog-confirm",
                default: true
            },
            {
                label: 'Cancel',
                type: MDWC.dialog.actions.type.DISMISSIVE,
                id: "btn-dialog-dismiss"
            }
        ],
        openCallback: function(){
          // Hide all relevant elements when dialog opens
          resetMarketplaceVendorPopupState();

            // fetch-vendor-url.xhtml returns HTML; swap to fetch-vendor-apps.xhtml for JSON
            const fetchUrl = resolvedUrl.replace('fetch-vendor-url.xhtml', 'fetch-vendor-apps.xhtml');

          fetchAndPopulateSingleVendorApp(fetchUrl, appName);

          // Upgrade MDL components for ripple effects. Timeout of 0 ms will run when the call stack clears,
          //  which should be after the dialog content is added to the DOM.
          setTimeout(function() {
            if (window.componentHandler) {
              componentHandler.upgradeDom();
            }
          }, 0);
        },
        closeCallback: function(type){
            if (type === MDWC.dialog.actions.type.CONFIRMING) {
                openVendorApp();
            }
            return true;
        }
    }, content);
}

function openMarketPlacePopUpUsingUrl(url){
    const content = { title: 'Open External Application'};
    MDWC.dialog('#marketplace-dialog-container', {
        id: "marketplace-multiapp-dialog",
        autoOpen: true,
        scrollable: false,
        detailsTemplateSelector: '._tmpl-marketplace-vendor-body',
        closeOnOverlayClick: false,
        classes: "oac-message-dialog",
        buttons: [
            {
                label: 'Open',
                type: MDWC.dialog.actions.type.CONFIRMING,
                id: "btn-dialog-confirm",
                default: true
            },
            {
                label: 'Cancel',
                type: MDWC.dialog.actions.type.DISMISSIVE,
                id: "btn-dialog-dismiss"
            }
        ],
        openCallback: function(){
            // Hide all relevant elements when dialog opens
            resetMarketplaceVendorPopupState();

            // Fetch vendor apps and populate the dialog
            fetchVendorApps(url);

            // Upgrade MDL components for ripple effects. Timeout of 0 ms will run when the call stack clears,
            //  which should be after the dialog content is added to the DOM.
            setTimeout(function() {
                if (window.componentHandler) {

                    componentHandler.upgradeDom();
                }
            }, 0);
        },
        closeCallback: function (type){
            if (type === MDWC.dialog.actions.type.CONFIRMING) {
                openVendorApp();
            }
            return true;
        }
    }, content);
}
