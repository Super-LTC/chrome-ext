'use strict';

(function(_NS) {
  _NS.formControls = {
    init: function() {
      this._addEventHandlers();
      this.updateTextFields();
    },
    
    updateTextFields: function(rootElem) {
      (rootElem || document)
        .querySelectorAll(
          '.mdwc-text-field--outlined:not(.mdwc-text-field--disabled)'
        )
        .forEach(function(elem) {
          var input = elem.querySelector('.mdwc-text-field__form-control');
          if (String(input.value).trim().length > 0) {
            input.focus();
            input.blur();
          }
        });
    },

    setTextFieldValue: function(selector, value) {
      var inputRef = document.querySelector(selector), 
        container = inputRef.closest('.mdwc-text-field--outlined'),
        notch = container.querySelector('.mdwc-notched-outline__notch'),
        label = notch.querySelector('.mdwc-floating-label');

      inputRef.value = value;
      this._changeNotchWidth(label, notch);
      notch.classList.add('mdwc-notched-outline__notch--notched');
    },

    disableTextField: function(selector) {
      var inputRef = document.querySelector(selector);
      inputRef.disabled = true;
      inputRef.closest('.mdwc-text-field--outlined').classList.add("mdwc-text-field--disabled")
    },
    
    _changeNotchWidth: function(label, notch) {
      if (!notch.classList.contains('mdwc-notched-outline__notch--notched')) {
        var transformedWidth;
        label.style.transform = 'scale(0.75, 0.75)';
        label.style.transition = 'none';
        transformedWidth = label.getBoundingClientRect().width + 10;
        label.style.removeProperty('transform');
        label.style.removeProperty('transition');
        notch.style.width = transformedWidth + 'px';
      }
    },

    _addEventHandlers: function() {
      document.addEventListener(
          'focus',
          function(e) {
            if (e.target instanceof Element === false) return;
            if (
              e.target.closest(
                '.mdwc-text-field--outlined:not(.mdwc-text-field--disabled)'
              )
            ) {
              var container = e.target.closest('.mdwc-text-field--outlined'),
                notch = container.querySelector('.mdwc-notched-outline__notch'),
                label = notch.querySelector('.mdwc-floating-label');

              this._changeNotchWidth(label, notch);

              container.classList.add('mdwc-text-field--focused');
              notch.classList.add('mdwc-notched-outline__notch--notched');
            }
          }.bind(this),
          true
        );
      
      document.addEventListener(
          'blur',
          function(e) {
            if (e.target instanceof Element === false) return;
            if (
              e.target.matches('.mdwc-text-field__form-control') &&
              e.target.closest('.mdwc-text-field--outlined')
            ) {
              var container = e.target.closest('.mdwc-text-field--outlined'),
                notch = container.querySelector('.mdwc-notched-outline__notch');

              container.classList.remove('mdwc-text-field--focused');
              if (!e.target.value) {
                notch.classList.remove('mdwc-notched-outline__notch--notched');
                notch.style.removeProperty('width');
              }
            }
          },
          true
        );
    }
  };
  
  // Address FF bug on number change not focusing in input
  document.addEventListener('change', function(e){
    if(e.target.type === 'number') {
      e.target.focus();
      e.target.blur();
    }
  });
})(MDWC);
