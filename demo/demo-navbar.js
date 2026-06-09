/**
 * Super LTC Demo Navigation Bar
 * Creates and manages the demo navigation bar
 */

(function() {
  'use strict';

  // Create and inject the navigation bar
  function createDemoNavBar() {
    // Skip vanilla navbar if Preact demo app will mount its own
    if (document.querySelector('link[href*="demo-entry.built"]') ||
        document.querySelector('script[src*="demo-entry.built"]') ||
        document.querySelector('link[href*="pcc-demo-entry.built"]') ||
        document.querySelector('script[src*="pcc-demo-entry.built"]')) {
      return;
    }
    const nav = document.createElement('div');
    nav.className = 'super-demo-nav';
    nav.innerHTML = `
      <div class="super-demo-nav__left">
        <div class="super-demo-nav__brand">
          <div class="super-demo-nav__brand-icon">S</div>
          <span>Super LTC Demo</span>
        </div>
        <div class="super-demo-nav__tabs">
          <button class="super-demo-nav__tab super-demo-nav__tab--active" data-page="medical-diagnosis">
            📋 Medical Diagnosis
          </button>
          <button class="super-demo-nav__tab" data-page="clinical-care-plan-detail">
            📋 Care Plan
          </button>
          <button class="super-demo-nav__tab" data-page="mds-section-i">
            📝 MDS Section I
          </button>
          <button class="super-demo-nav__tab" data-page="mds-section-n">
            📝 MDS Section N
          </button>
        </div>
      </div>
      <div class="super-demo-nav__right">
        <button class="super-demo-nav__button super-demo-nav__button--primary" data-action="icd10">
          🎯 ICD-10
        </button>
        <button class="super-demo-nav__button" data-action="mar">
          💊 MAR
        </button>
        <button class="super-demo-nav__button" data-action="tar">
          📋 TAR
        </button>
        <button class="super-demo-nav__button" data-action="therapy">
          🏃 Therapy
        </button>
      </div>
    `;

    // Insert at the beginning of body
    document.body.insertBefore(nav, document.body.firstChild);

    // Highlight the active tab based on current URL
    const path = window.location.pathname;
    nav.querySelectorAll('.super-demo-nav__tab').forEach(tab => {
      tab.classList.remove('super-demo-nav__tab--active');
    });
    if (path.includes('mds-section-n')) {
      nav.querySelector('[data-page="mds-section-n"]')?.classList.add('super-demo-nav__tab--active');
    } else if (path.includes('mds-section-i')) {
      nav.querySelector('[data-page="mds-section-i"]')?.classList.add('super-demo-nav__tab--active');
    } else if (path.includes('clinical-care-plan-detail')) {
      nav.querySelector('[data-page="clinical-care-plan-detail"]')?.classList.add('super-demo-nav__tab--active');
    } else if (path.includes('mds-summary')) {
      nav.querySelector('[data-page="mds-summary"]')?.classList.add('super-demo-nav__tab--active');
    } else if (path.includes('pcc-demo')) {
      nav.querySelector('[data-page="pcc-demo"]')?.classList.add('super-demo-nav__tab--active');
    } else if (path.includes('medical-diagnosis')) {
      nav.querySelector('[data-page="medical-diagnosis"]')?.classList.add('super-demo-nav__tab--active');
    }

    // Set up event listeners
    setupNavListeners(nav);
  }

  function setupNavListeners(nav) {
    // Tab clicks
    nav.querySelectorAll('.super-demo-nav__tab').forEach(tab => {
      tab.addEventListener('click', function() {
        const page = this.dataset.page;
        handlePageChange(page);
        
        // Update active state
        nav.querySelectorAll('.super-demo-nav__tab').forEach(t => {
          t.classList.remove('super-demo-nav__tab--active');
        });
        this.classList.add('super-demo-nav__tab--active');
      });
    });

    // Action button clicks
    nav.querySelectorAll('.super-demo-nav__button').forEach(btn => {
      btn.addEventListener('click', function() {
        const action = this.dataset.action;
        handleAction(action);
      });
    });
  }

  function handlePageChange(page) {
    console.log('[Demo Nav] Changing to page:', page);
    
    const pageUrls = {
      'medical-diagnosis': './medical-diagnosis.html',
      'clinical-care-plan-detail': './clinical-care-plan-detail.html',
      'mds-summary': './mds-summary.html',
      'mds-section-i': './mds-section-i.html',
      'mds-section-n': './mds-section-n.html',
      'simple-demo': './index.html',
      'pcc-demo': './pcc-demo.html'
    };

    const url = pageUrls[page];
    if (url) {
      console.log('[Demo Nav] Navigating to:', url);
      window.location.href = url;
    }
  }

  function handleAction(action) {
    console.log('[Demo Nav] Action clicked:', action);
    
    switch (action) {
      case 'icd10':
        if (window.ICD10Viewer) {
          window.ICD10Viewer.open();
        } else {
          alert('ICD-10 Viewer: This would open the ICD-10 diagnosis viewer');
        }
        break;
      case 'mar':
        alert('MAR: This would open the Medication Administration Record');
        break;
      case 'tar':
        alert('TAR: This would open the Treatment Administration Record');
        break;
      case 'therapy':
        alert('Therapy: This would open the Therapy module');
        break;
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createDemoNavBar);
  } else {
    createDemoNavBar();
  }

})();
