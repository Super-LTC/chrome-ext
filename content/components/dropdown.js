// Searchable Dropdown Component for Super LTC Chrome Extension
// Provides a nice, keyboard-navigable dropdown for practitioner selection

const SuperDropdown = {
  activeDropdown: null,

  /** Normalize IDs for comparisons (DOM data-* attrs are always strings). */
  _idKey(id) {
    return id == null ? '' : String(id);
  },

  _findItem(items, id) {
    const key = this._idKey(id);
    return items.find(i => this._idKey(i.id) === key);
  },

  /**
   * Create a searchable dropdown
   * @param {HTMLElement} container - Container element to render into
   * @param {Object} options
   * @param {Array} options.items - Array of {id, label, subtitle?, avatar?}
   * @param {string} options.placeholder - Placeholder text
   * @param {string} options.searchPlaceholder - Search input placeholder
   * @param {Function} options.onSelect - Callback when item selected
   * @param {string} options.selectedId - Initially selected item ID
   * @param {string} options.emptyMessage - Message when no items match
   */
  create(container, options) {
    const {
      items = [],
      placeholder = 'Select an option...',
      searchPlaceholder = 'Search...',
      onSelect,
      selectedId = '',
      emptyMessage = 'No results found'
    } = options;

    // Find selected item
    const selectedItem = this._findItem(items, selectedId);

    const dropdown = document.createElement('div');
    dropdown.className = 'super-dropdown';
    dropdown.innerHTML = `
      <button type="button" class="super-dropdown__trigger" aria-haspopup="listbox"> <!-- NO_TRACK: generic dropdown open/close trigger -->
        <span class="super-dropdown__value">
          ${selectedItem ? this._renderSelectedItem(selectedItem) : `<span class="super-dropdown__placeholder">${placeholder}</span>`}
        </span>
        <span class="super-dropdown__arrow">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </span>
      </button>
      <div class="super-dropdown__menu" role="listbox">
        <div class="super-dropdown__search-wrapper">
          <input
            type="text"
            class="super-dropdown__search"
            placeholder="${searchPlaceholder}"
            autocomplete="off"
          />
        </div>
        <div class="super-dropdown__list">
          ${this._renderItems(items, selectedId)}
        </div>
        <div class="super-dropdown__empty" style="display: none;">
          ${emptyMessage}
        </div>
      </div>
    `;

    // Store data
    dropdown._items = items;
    dropdown._selectedId = selectedId;
    dropdown._onSelect = onSelect;
    dropdown._options = options;

    // Setup event handlers
    this._setupHandlers(dropdown);

    container.innerHTML = '';
    container.appendChild(dropdown);

    return dropdown;
  },

  /**
   * Get selected value from a dropdown
   * @param {HTMLElement} dropdown
   * @returns {string|null}
   */
  getValue(dropdown) {
    return dropdown?._selectedId || null;
  },

  /**
   * Set selected value
   * @param {HTMLElement} dropdown
   * @param {string} id
   */
  setValue(dropdown, id) {
    if (!dropdown) return;

    const item = this._findItem(dropdown._items, id);
    dropdown._selectedId = item ? item.id : id;

    const valueEl = dropdown.querySelector('.super-dropdown__value');
    if (item) {
      valueEl.innerHTML = this._renderSelectedItem(item);
    } else {
      valueEl.innerHTML = `<span class="super-dropdown__placeholder">${dropdown._options.placeholder}</span>`;
    }

    // Update selected state in list
    const selectedKey = this._idKey(dropdown._selectedId);
    dropdown.querySelectorAll('.super-dropdown__item').forEach(el => {
      el.classList.toggle('super-dropdown__item--selected', this._idKey(el.dataset.id) === selectedKey);
    });
  },

  // Private methods

  _renderItems(items, selectedId) {
    if (items.length === 0) {
      return '<div class="super-dropdown__no-items">No options available</div>';
    }

    const selectedKey = this._idKey(selectedId);
    return items.map(item => `
      <div
        class="super-dropdown__item ${this._idKey(item.id) === selectedKey ? 'super-dropdown__item--selected' : ''}"
        data-id="${item.id}"
        role="option"
        tabindex="-1"
      >
        ${item.avatar ? `
          <div class="super-dropdown__avatar">
            ${item.avatar.startsWith('http') ? `<img src="${item.avatar}" alt="" />` : item.avatar}
          </div>
        ` : `
          <div class="super-dropdown__avatar super-dropdown__avatar--initials">
            ${this._getInitials(item.label)}
          </div>
        `}
        <div class="super-dropdown__item-content">
          <div class="super-dropdown__item-label">${item.label}</div>
          ${item.subtitle ? `<div class="super-dropdown__item-subtitle">${item.subtitle}</div>` : ''}
        </div>
        ${this._idKey(item.id) === selectedKey ? '<span class="super-dropdown__check">&#10003;</span>' : ''}
      </div>
    `).join('');
  },

  _renderSelectedItem(item) {
    return `
      <span class="super-dropdown__selected">
        <span class="super-dropdown__selected-avatar">
          ${item.avatar?.startsWith('http') ? `<img src="${item.avatar}" alt="" />` : this._getInitials(item.label)}
        </span>
        <span class="super-dropdown__selected-label">${item.label}</span>
      </span>
    `;
  },

  _getInitials(name) {
    return name
      .split(' ')
      .map(n => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  },

  _setupHandlers(dropdown) {
    const trigger = dropdown.querySelector('.super-dropdown__trigger');
    const menu = dropdown.querySelector('.super-dropdown__menu');
    const search = dropdown.querySelector('.super-dropdown__search');
    const list = dropdown.querySelector('.super-dropdown__list');
    const empty = dropdown.querySelector('.super-dropdown__empty');

    let highlightedIndex = -1;

    const open = () => {
      if (dropdown.classList.contains('super-dropdown--open')) return;

      // Close any other open dropdowns
      document.querySelectorAll('.super-dropdown--open').forEach(d => {
        d.classList.remove('super-dropdown--open');
      });

      dropdown.classList.add('super-dropdown--open');
      this.activeDropdown = dropdown;

      // Focus search
      setTimeout(() => search.focus({ preventScroll: true }), 50);

      // Reset filter
      search.value = '';
      this._filterItems(dropdown, '');

      // Add click outside listener
      setTimeout(() => {
        document.addEventListener('click', closeOnClickOutside);
      }, 0);
    };

    const close = () => {
      dropdown.classList.remove('super-dropdown--open');
      this.activeDropdown = null;
      highlightedIndex = -1;
      document.removeEventListener('click', closeOnClickOutside);
    };

    const closeOnClickOutside = (e) => {
      if (!dropdown.contains(e.target)) {
        close();
      }
    };

    const selectItem = (id) => {
      const item = this._findItem(dropdown._items, id);
      if (!item) return;

      this.setValue(dropdown, item.id);
      close();

      if (dropdown._onSelect) {
        dropdown._onSelect(item);
      }
    };

    // Trigger click
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (dropdown.classList.contains('super-dropdown--open')) {
        close();
      } else {
        open();
      }
    });

    // Search input
    search.addEventListener('input', (e) => {
      this._filterItems(dropdown, e.target.value);
      highlightedIndex = -1;
    });

    // Keyboard navigation
    search.addEventListener('keydown', (e) => {
      const visibleItems = list.querySelectorAll('.super-dropdown__item:not([style*="display: none"])');

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          highlightedIndex = Math.min(highlightedIndex + 1, visibleItems.length - 1);
          this._updateHighlight(visibleItems, highlightedIndex);
          break;

        case 'ArrowUp':
          e.preventDefault();
          highlightedIndex = Math.max(highlightedIndex - 1, 0);
          this._updateHighlight(visibleItems, highlightedIndex);
          break;

        case 'Enter':
          e.preventDefault();
          if (highlightedIndex >= 0 && visibleItems[highlightedIndex]) {
            selectItem(visibleItems[highlightedIndex].dataset.id);
          }
          break;

        case 'Escape':
          e.preventDefault();
          close();
          trigger.focus();
          break;

        case 'Tab':
          close();
          break;
      }
    });

    // Item click
    list.addEventListener('click', (e) => {
      const item = e.target.closest('.super-dropdown__item');
      if (item) {
        e.preventDefault();
        e.stopPropagation();
        selectItem(item.dataset.id);
      }
    });

    // Item hover
    list.addEventListener('mouseover', (e) => {
      const item = e.target.closest('.super-dropdown__item');
      if (item) {
        const visibleItems = list.querySelectorAll('.super-dropdown__item:not([style*="display: none"])');
        highlightedIndex = Array.from(visibleItems).indexOf(item);
        this._updateHighlight(visibleItems, highlightedIndex);
      }
    });
  },

  _filterItems(dropdown, query) {
    const list = dropdown.querySelector('.super-dropdown__list');
    const empty = dropdown.querySelector('.super-dropdown__empty');
    const items = list.querySelectorAll('.super-dropdown__item');
    const lowerQuery = query.toLowerCase();

    let visibleCount = 0;

    items.forEach(item => {
      const label = item.querySelector('.super-dropdown__item-label')?.textContent || '';
      const subtitle = item.querySelector('.super-dropdown__item-subtitle')?.textContent || '';
      const matches = label.toLowerCase().includes(lowerQuery) || subtitle.toLowerCase().includes(lowerQuery);

      item.style.display = matches ? '' : 'none';
      if (matches) visibleCount++;
    });

    empty.style.display = visibleCount === 0 ? '' : 'none';
  },

  _updateHighlight(items, index) {
    items.forEach((item, i) => {
      item.classList.toggle('super-dropdown__item--highlighted', i === index);
      if (i === index) {
        item.scrollIntoView({ block: 'nearest' });
      }
    });
  }
};

// Make available globally
window.SuperDropdown = SuperDropdown;
