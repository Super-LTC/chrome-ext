/**
 * ICD-10 Viewer Sidebar — vanilla shim
 *
 * The sidebar itself is now a Preact component at
 * content/modules/icd10-sidebar/Sidebar.jsx. This shim preserves the
 * original public API (ICD10Sidebar.init / updateData / selected* fields)
 * so the vanilla icd10-viewer.js keeps working unchanged, and so the demo
 * HTML pages that load this file as a classic <script> keep working too.
 *
 * Preact + the Sidebar component are expected on window (set by
 * content/content.js in the extension, demo/demo-entry.jsx and
 * demo/pcc-demo-entry.jsx in the demo). Falls back to dynamic imports.
 */

const ICD10Sidebar = {
  // Kept for backwards compatibility with icd10-viewer.js close() cleanup.
  selectedCategory: null,
  selectedBaseCode: null,
  selectedGroupId: null,

  // Internal
  _container: null,
  _data: { topRanked: [], approved: [], annotations: [], approvedDiagnoses: [], flatGroups: null, stagedBaseCodes: [], approvedBaseCodes: [] },
  _onSelectionChange: null,
  _preact: null,
  _Sidebar: null,
  _ready: false,
  _pendingRender: false,

  init(container, data, onSelectionChange) {
    this._container = container;
    this._data = {
      topRanked: data.topRanked || [],
      approved: data.approved || [],
      annotations: data.annotations || [],
      approvedDiagnoses: data.approvedDiagnoses || [],
      flatGroups: data.flatGroups || null,
    };
    this._onSelectionChange = onSelectionChange;
    this.selectedCategory = null;
    this.selectedBaseCode = null;
    this.selectedGroupId = null;

    this._ensureDepsAndRender();
  },

  updateData(data) {
    if (data.topRanked !== undefined) this._data.topRanked = data.topRanked;
    if (data.approved !== undefined) this._data.approved = data.approved;
    if (data.annotations !== undefined) this._data.annotations = data.annotations;
    if (data.approvedDiagnoses !== undefined) this._data.approvedDiagnoses = data.approvedDiagnoses;
    if (data.flatGroups !== undefined) this._data.flatGroups = data.flatGroups;
    if (data.stagedBaseCodes !== undefined) this._data.stagedBaseCodes = data.stagedBaseCodes;
    if (data.approvedBaseCodes !== undefined) this._data.approvedBaseCodes = data.approvedBaseCodes;

    if (this._ready) {
      this._render();
    } else {
      this._pendingRender = true;
    }
  },

  getSelection() {
    return {
      category: this.selectedCategory,
      baseCode: this.selectedBaseCode,
      groupId: this.selectedGroupId,
    };
  },

  async _ensureDepsAndRender() {
    if (this._ready) {
      this._render();
      return;
    }

    try {
      if (window.__preact && window.__ICD10SidebarComponent) {
        this._preact = window.__preact;
        this._Sidebar = window.__ICD10SidebarComponent;
      } else {
        const [preactMod, sbMod] = await Promise.all([
          import('preact'),
          import('../modules/icd10-sidebar/Sidebar.jsx'),
        ]);
        this._preact = preactMod;
        this._Sidebar = sbMod.Sidebar;
        // Cache for subsequent mounts in the same page load.
        if (!window.__preact) window.__preact = preactMod;
        if (!window.__ICD10SidebarComponent) window.__ICD10SidebarComponent = sbMod.Sidebar;
      }
      this._ready = true;
      this._render();
      this._pendingRender = false;
    } catch (err) {
      console.error('[ICD10Sidebar] Failed to load Preact sidebar:', err);
      if (this._container) {
        this._container.innerHTML =
          '<div style="padding:16px;color:#b91c1c;font-size:13px">Failed to load sidebar. Check console.</div>';
      }
    }
  },

  _render() {
    if (!this._container || !this._preact || !this._Sidebar) return;
    const { render, h } = this._preact;
    render(
      h(this._Sidebar, {
        topRanked: this._data.topRanked,
        approved: this._data.approved,
        annotations: this._data.annotations,
        approvedDiagnoses: this._data.approvedDiagnoses,
        flatGroups: this._data.flatGroups,
        stagedBaseCodes: this._data.stagedBaseCodes,
        approvedBaseCodes: this._data.approvedBaseCodes,
        onSelect: (selection) => this._handleSelect(selection),
      }),
      this._container
    );
  },

  _handleSelect(selection) {
    if (!selection) return;
    this.selectedCategory = selection.category || null;
    this.selectedBaseCode = selection.baseCode || null;
    this.selectedGroupId = selection.groupId || null;
    if (typeof this._onSelectionChange === 'function') {
      this._onSelectionChange(selection);
    }
  },
};

window.ICD10Sidebar = ICD10Sidebar;
