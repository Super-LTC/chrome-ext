function updateDialogStyles(){
    let dialogElement = document.querySelectorAll('dialog.pccOverlay')[0];
    let dialogHeaderElement = document.querySelectorAll('dialog.pccOverlay h3')[0];
    let dialogBodyElement = document.querySelectorAll('dialog.pccOverlay div.dialogBody')[0];
    let dialogActionButtonRowElement = document.querySelectorAll('dialog.pccOverlay div.actionButtonRow')[0];

    if(dialogElement){
        let dialogHeaderHeight = dialogHeaderElement.offsetHeight;
        let dialogActionButtonRowHeight = dialogActionButtonRowElement.offsetHeight;
        dialogBodyElement.style.maxHeight = 'calc(80vh - ' + (dialogHeaderHeight + dialogActionButtonRowHeight + 10) + 'px)';

        if(dialogBodyElement.scrollHeight > dialogBodyElement.offsetHeight){
            dialogBodyElement.classList.add('currentlyOverflowing');
        } else {
            dialogBodyElement.classList.remove('currentlyOverflowing');
        }
    }
}

function showAlert(config){
    let title = config.title || '';
    let body = config.body || 'Attention!';
    let okHandler = (config.actions && config.actions.ok && config.actions.ok.fn) ? config.actions.ok.fn : function(){};

    let dialogId = 'pcc-alert-dialog'; //All alert dialogs use the same DOM
    let okButtonText = config.actions?.ok?.text || 'OK';
    let okButtonId = dialogId + '_ok';
    // Flush any existing dialog
    let dialog = document.getElementById(dialogId);
    if(dialog){
        dialog.parentNode.removeChild(dialog);
    }
    dialog = document.createElement('dialog');
    dialog.id = dialogId;
    dialog.className = 'pccOverlay evergreen';
    dialog.innerHTML = '<h3>' + title + '</h3>' +
        '<div class="dialogBody">' + body + '</div>' +
        '<div class="actionButtonRow">' +
        '<button class="primary" id="' + okButtonId + '">' + okButtonText + '</button>' +
        '</div>';
    document.body.appendChild(dialog);
    // Set up ok/dismiss handler
    let okButton = document.getElementById(okButtonId);
    okButton.addEventListener('click', function(e){
        e.preventDefault();
        dialog.close('ok');
    });
    // Handle the dialog close event
    dialog.addEventListener('close', function(e){
        let dialogCloseValue = dialog.returnValue; // Will be blank if the user clicks Esc (e.g. default to cancel)
        if(dialogCloseValue == 'ok'){
            okHandler();
        } else {
            okHandler();
        }
        dialog.parentNode.removeChild(dialog);
    });
    // Show alert dialog
    dialog.showModal();
    setTimeout(updateDialogStyles, 250);
    let dialogElement = document.querySelectorAll('dialog#' + dialogId + '.pccOverlay')[0];
    new ResizeObserver(updateDialogStyles).observe(dialogElement);
}


function showConfirm(config){
    let title = config.title || '';
    let body = config.body || 'Are you sure?';
    let confirmHandler = (config.actions && config.actions.confirm && config.actions.confirm.fn) ? config.actions.confirm.fn : function(){};
    let cancelHandler = (config.actions && config.actions.cancel && config.actions.cancel.fn) ? config.actions.cancel.fn : function(){};
    let onBeforeRenderHandler = (config.onBeforeRender) ? config.onBeforeRender : function(){};

    let dialogId = 'pcc-confirm-dialog'; //All Confirm dialogs use the same DOM
    let confirmButtonText = config.actions?.confirm?.text || 'OK';
    let confirmButtonDisabled = config.actions.confirm.disabled || false;
    let cancelButtonText = config.actions?.cancel?.text || 'Cancel';
    let confirmButtonId = dialogId + '_confirm';
    let cancelButtonId = dialogId + '_cancel';
    // Flush any existing dialog
    let dialog = document.getElementById(dialogId);
    if(dialog){
        dialog.parentNode.removeChild(dialog);
    }
    dialog = document.createElement('dialog');
    dialog.id = dialogId;
    dialog.className = 'pccOverlay evergreen';
    dialog.innerHTML = '<h3>' + title + '</h3>' +
        '<div class="dialogBody">' + body + '</div>' +
        '<div class="actionButtonRow">' +
        '<button class="primary" id="' + confirmButtonId + '"' + (confirmButtonDisabled ? ' disabled' : '') + '>' + confirmButtonText + '</button>' +
        '<button class="secondary" id="' + cancelButtonId + '">' + cancelButtonText + '</button>' +
        '</div>';
    document.body.appendChild(dialog);
    // Set up confirmation and cancel handlers
    let confirmButton = document.getElementById(confirmButtonId);
    let cancelButton = document.getElementById(cancelButtonId);
    confirmButton.addEventListener('click', function(e){
        e.preventDefault();
        dialog.close('confirm');
    });
    cancelButton.addEventListener('click', function(e){
        e.preventDefault();
        dialog.close('cancel');
    });
    // Handle the dialog close event
    dialog.addEventListener('close', function(e){
        let dialogCloseValue = dialog.returnValue; // Will be blank if the user clicks Esc (e.g. default to cancel)
        if(dialogCloseValue == 'confirm'){
            confirmHandler();
        } else {
            cancelHandler();
        }
        // The jQuery UI date picker div needs to remain in the DOM (if it exists in the dialog) move it elsewhere in the body
        let jQueryUIDatePickerDiv = document.querySelector('dialog#' + dialogId + ' #ui-datepicker-div');
        if(jQueryUIDatePickerDiv){
            document.body.appendChild(jQueryUIDatePickerDiv);
        }
        dialog.parentNode.removeChild(dialog);
    });
    // Call onBeforeRender handler to allow for any last-minute DOM updates
    onBeforeRenderHandler(dialog);
    // Show confirm dialog
    dialog.showModal();
    setTimeout(updateDialogStyles, 250);
    let dialogElement = document.querySelectorAll('dialog#' + dialogId + '.pccOverlay')[0];
    new ResizeObserver(updateDialogStyles).observe(dialogElement);
}