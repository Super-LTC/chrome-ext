# Super LTC Chrome Extension - Development Guide

## 🏗️ Architecture Overview

This Chrome extension is currently in a **hybrid architecture** state:
- **Vanilla JavaScript**: Most existing features (panels, viewers, API clients)
- **Preact + Vite**: Modern build system ready for new components
- **Goal**: Gradual migration over months, not a blocking rewrite

### Current Status (Post Week 1 Migration)

✅ **Complete:**
- npm + Vite build system configured
- Preact installed and working
- Hybrid vanilla + Preact proven
- Modal component converted to Preact (with backward compatibility)
- Development workflow established

🚧 **In Progress:**
- Building new features in Preact
- Migrating existing views when modified

📦 **Build Output:**
- Bundle size: 206KB (49.56KB gzipped)
- Build time: ~270ms
- Entry point: `content/content.js` → `dist/assets/content.js-*.js`

---

## 🎯 Development Philosophy: "Preact Forward, Vanilla When Needed"

### Golden Rules

1. **New complex features → Build in Preact**
2. **Existing vanilla code → Migrate only when you touch it**
3. **Quick fixes/simple features → Vanilla is fine**
4. **Don't block feature development on migration**

---

## 🛠️ Build System & Workflow

### Development Commands

```bash
# Install dependencies (first time only)
npm install

# Development mode (auto-rebuild on file changes)
npm run dev

# Production build
npm run build

# After rebuild:
# 1. Go to chrome://extensions
# 2. Click "Reload" button on Super LTC extension
# 3. Refresh PointClickCare page
```

### Loading Extension in Chrome

1. Go to `chrome://extensions`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `dist/` folder (NOT root folder)

**Important:** Always load from `dist/`, never from the source folder.

---

## 📂 File Organization

```
content/
├── modules/                    # NEW PREACT MODULES
│   ├── [feature-name]/         # Build new features here
│   │   ├── FeatureName.jsx     # Main component
│   │   ├── components/         # Feature-specific components
│   │   └── hooks/              # Feature-specific hooks
│   └── ...
│
├── components/                 # SHARED PREACT COMPONENTS
│   ├── Modal.jsx               # ✅ Migrated (backward compatible)
│   ├── App.jsx                 # Root component (placeholder)
│   └── [new-components].jsx   # Add shared components here
│
├── stores/                     # ZUSTAND STATE STORES (future)
│   └── [feature]-store.js      # State management with Zustand
│
├── super-menu/                 # VANILLA (Migrate when touched)
│   ├── dashboard-view.js       # Dashboard rendering
│   ├── mds-view.js            # MDS analysis view (1,325 lines)
│   ├── facility-dashboard-view.js
│   ├── chat-view.js
│   ├── panel.js               # Main panel logic
│   ├── navigation.js          # Navigation state
│   ├── fab.js                 # Floating action button
│   └── [state/utils].js       # State management & utilities
│
├── queries/                    # QUERY SYSTEM (mostly vanilla)
│   ├── query-api.js           # API client (keep vanilla)
│   ├── query-state.js         # State management
│   ├── query-panel.js         # Panel rendering
│   └── query-modal.js         # Query modal
│
├── icd10-viewer/              # ICD-10 VIEWER (vanilla, 6 files)
│   ├── icd10-viewer.js        # Main viewer
│   ├── icd10-sidebar.js       # Code sidebar
│   ├── icd10-evidence-panel.js
│   ├── icd10-pdf-viewer.js
│   └── icd10-api.js           # API client (keep vanilla)
│
├── evidence-viewers.js         # EVIDENCE VIEWERS (1,582 lines - migrate priority #1)
├── section-transformers.js     # MDS section logic (keep vanilla)
├── mockData.js                # Mock data for development
│
└── content.js                 # MAIN ENTRY POINT (imports all)
```

---

## 🆕 Building New Features

### Pattern 1: New Preact Module (Complex Features)

**Use for:** Multi-step wizards, data tables, complex forms, interactive UIs

```jsx
// content/modules/patient-timeline/PatientTimeline.jsx
import { useState, useEffect } from 'preact/hooks';
import { Modal } from '../../components/Modal.jsx';

export const PatientTimeline = ({ patientId }) => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchPatientEvents(patientId)
      .then(setEvents)
      .finally(() => setLoading(false));
  }, [patientId]);

  if (loading) return <div>Loading...</div>;

  return (
    <div className="patient-timeline">
      <h2>Patient Timeline</h2>
      <div className="timeline">
        {events.map(event => (
          <TimelineEvent key={event.id} event={event} />
        ))}
      </div>
    </div>
  );
};

const TimelineEvent = ({ event }) => (
  <div className="timeline-event">
    <time>{event.date}</time>
    <p>{event.description}</p>
  </div>
);
```

**Integration with vanilla navigation:**
```javascript
// content/super-menu/navigation.js (existing vanilla file)
import { render } from 'preact';
import { PatientTimeline } from '../modules/patient-timeline/PatientTimeline.jsx';

const Navigation = {
  showPatientTimeline(patientId) {
    const container = document.getElementById('super-panel-content');
    container.innerHTML = ''; // Clear vanilla content
    render(<PatientTimeline patientId={patientId} />, container);
  }
};
```

### Pattern 2: Preact Component in Vanilla View

**Use for:** Adding a chart, table, or interactive widget to existing vanilla view

```javascript
// content/super-menu/dashboard-view.js (existing vanilla file)
import { render } from 'preact';
import { FancyChart } from '../components/FancyChart.jsx';

const DashboardView = {
  render() {
    // Vanilla HTML structure
    document.querySelector('.content').innerHTML = `
      <h1>Dashboard</h1>
      <div class="stats">...</div>
      <div id="chart-container"></div>
    `;

    // Mount Preact component in specific spot
    const chartContainer = document.getElementById('chart-container');
    render(<FancyChart data={this.data} />, chartContainer);
  }
};
```

### Pattern 3: Quick Vanilla Feature (Simple Stuff)

**Use for:** Simple buttons, text displays, quick fixes

```javascript
// Just keep it vanilla if it's fast
const QuickFeature = {
  show() {
    document.querySelector('.container').innerHTML = `
      <div class="quick-feature">
        <h2>Quick Thing</h2>
        <button onclick="doThing()">Click</button>
      </div>
    `;
  }
};
```

---

## ♻️ Migrating Existing Features

### When to Migrate

✅ **Migrate when:**
- Adding substantial new functionality to an old view
- Fixing complex bugs in view rendering logic
- Refactoring for new requirements
- View has grown too complex (>500 lines, lots of DOM manipulation)
- You're rewriting >30% of the code anyway

❌ **Don't migrate when:**
- One-line bug fixes
- Small CSS/styling tweaks
- Quick patches before deadlines
- Code works fine and you're not touching logic

### Migration Priority

**High Priority** (Migrate first when you touch them):
1. `evidence-viewers.js` (1,582 lines) - Heavy DOM manipulation, 6+ viewer types
2. `super-menu/mds-view.js` (1,325 lines) - Complex state, 3-level hierarchy
3. `super-menu/facility-dashboard-view.js` (708 lines) - Table rendering, tabs

**Medium Priority** (Migrate if convenient):
4. `super-menu/chat-view.js` (259 lines)
5. `icd10-viewer/*.js` (6 files, ~800 lines total)
6. Query modals

**Low Priority** (Keep vanilla):
- API clients (`query-api.js`, `icd10-api.js`) - Work fine as-is
- Utilities (`context.js`, `session.js`, `utils.js`) - Simple, no UI
- `background/background.js` - No UI, no reason to migrate
- `section-transformers.js` - Pure data transformation logic

---

## 🎨 Component Patterns & Best Practices

### Using the Migrated Modal Component

**In Preact:**
```jsx
import { Modal } from '../components/Modal.jsx';

const MyComponent = () => {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <button onClick={() => setShowModal(true)}>Open</button>

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Confirm Action"
        size="medium"
        actions={[
          { label: 'Cancel', variant: 'secondary', onClick: () => setShowModal(false) },
          { label: 'Confirm', variant: 'primary', onClick: handleConfirm }
        ]}
      >
        <p>Are you sure?</p>
      </Modal>
    </>
  );
};
```

**In Vanilla JS (backward compatibility):**
```javascript
// Old API still works!
SuperModal.show({
  title: 'My Modal',
  content: '<p>HTML content here</p>',
  actions: [
    { label: 'OK', onClick: () => SuperModal.close() }
  ]
});
```

### State Management

**For component-local state:**
```jsx
import { useState } from 'preact/hooks';

const MyComponent = () => {
  const [count, setCount] = useState(0);
  // ...
};
```

**For shared state (future - Zustand):**
```javascript
// content/stores/dashboard-store.js
import { create } from 'zustand';

export const useDashboardStore = create((set) => ({
  data: null,
  loading: false,

  loadData: async () => {
    set({ loading: true });
    const data = await fetchDashboardData();
    set({ data, loading: false });
  }
}));

// In component:
import { useDashboardStore } from '../stores/dashboard-store';

const Dashboard = () => {
  const { data, loading, loadData } = useDashboardStore();
  // ...
};
```

### API Integration

**Keep API clients vanilla, use them from Preact:**

```javascript
// content/queries/query-api.js (vanilla - leave as-is)
const QueryAPI = {
  async fetchQueries() {
    const response = await fetch('/api/queries');
    return response.json();
  }
};
```

```jsx
// Use from Preact component
import { QueryAPI } from '../queries/query-api.js';

const QueryList = () => {
  const [queries, setQueries] = useState([]);

  useEffect(() => {
    QueryAPI.fetchQueries().then(setQueries);
  }, []);

  return <div>...</div>;
};
```

---

## 🔧 Common Tasks

### Adding a New Navigation Tab

**Option 1: Vanilla (Current Pattern)**
```javascript
// content/super-menu/navigation.js
const Navigation = {
  tabs: {
    dashboard: { label: 'Dashboard', view: DashboardView },
    mds: { label: 'MDS', view: MDSView },
    newTab: { label: 'New Feature', view: NewFeatureView }  // Add here
  }
};
```

**Option 2: Future Top Bar (Week 5+)**
```jsx
// content/components/TopBar.jsx
<NavTab
  id="new-feature"
  label="New Feature"
  onClick={() => navigate('new-feature')}
/>
```

### Adding a New Dropdown/Toast

**Use existing vanilla components for now:**
```javascript
// Dropdowns
SuperDropdown.show({ options: [...], onSelect: (val) => {...} });

// Toasts
SuperToast.show({ message: 'Success!', type: 'success' });
```

**TODO:** Convert these to Preact in future (low priority).

### Accessing PointClickCare Page Context

```javascript
// Use existing vanilla context detection
import { PCCContext } from './super-menu/context.js';

// In Preact component:
useEffect(() => {
  const context = PCCContext.detect();
  console.log(context.pageType); // 'patient', 'facility', 'global'
  console.log(context.patientId); // Current patient ID if on patient page
}, []);
```

---

## 🚨 Important Notes

### CSS

- CSS files are currently loaded individually (not bundled yet)
- Keep adding CSS to existing files in `content/css/`
- Future: Will consolidate into bundled CSS

### PDF.js

- `lib/pdf.min.js` and `lib/pdf.worker.min.js` are kept separate
- These are web_accessible_resources in manifest
- Don't bundle these - they're huge and need to be separate

### Chrome Storage

```javascript
// Existing vanilla pattern (keep using)
chrome.storage.local.get(['key'], (result) => {
  console.log(result.key);
});

// Future: Zustand persistence middleware will handle this
```

### Background Service Worker

- `background/background.js` handles OAuth, messaging
- Keep this vanilla - no UI, no reason to migrate
- Preact is only for content scripts (UI)

### Analytics

- Single funnel: every event goes through `content/utils/analytics.js` (PHI guardrails, schema validation, super props)
- Dev/internal builds (`npm run build`, `npm run build:prod`) use `posthog-js` directly → `us.i.posthog.com`
- Store builds (`npm run build:store`) replace `posthog-js` (via vite alias) with `content/utils/analytics-superltc.js`, a shim that batches events and forwards them through the background worker → `POST /api/v1/analytics/events` on superltc.com → PostHog server-side
- Store-build chain is best-effort: 2s/50-event batching, no retries, errors swallowed. Never break the app for analytics
- Reviewers / users on the store build see only `superltc.com` traffic — no third-party tracking code in the bundle

---

## 📋 Migration Roadmap

### Week 1 ✅ (Complete)
- [x] npm project + Vite configured
- [x] Preact installed
- [x] Modal component migrated
- [x] Hybrid architecture proven
- [x] Development workflow established

### Week 2-4 (Future)
- [ ] Migrate Evidence Viewers → Preact components
- [ ] Migrate Facility Dashboard → Preact + Zustand
- [ ] Migrate MDS View → Preact + complex state

### Week 5-8 (Future)
- [ ] Build Top Bar navigation (like demo)
- [ ] Set up lazy loading for modules
- [ ] Migrate remaining views

### Ongoing
- Build new features in Preact
- Migrate old features when touched
- Gradually reduce vanilla codebase

---

## 🎯 Quick Decision Tree

**"Should I use Preact or Vanilla for this?"**

```
Is it a new feature?
├─ Yes → Is it complex (forms, state, tables)?
│  ├─ Yes → Use Preact
│  └─ No (simple button/display) → Vanilla is fine
│
└─ No (modifying existing) → Am I changing >30% of the code?
   ├─ Yes → Migrate to Preact
   └─ No → Keep vanilla
```

---

## 🆘 Troubleshooting

### Build Fails

```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Extension Not Loading

- Check you selected `dist/` folder, not root
- Check console for errors in DevTools
- Try: Remove extension, `npm run build`, reload extension

### Preact Not Rendering

- Check `#super-ltc-root` exists in DOM (Elements tab)
- Check console for Preact errors
- Verify component is imported correctly

### Vanilla Features Broken After Build

- Check import order in `content/content.js` matches old manifest
- Verify all files are imported
- Check for JavaScript errors in console

---

## 📚 Resources

- **Preact Docs:** https://preactjs.com/
- **Vite Docs:** https://vitejs.dev/
- **Zustand Docs:** https://github.com/pmndrs/zustand
- **Project Build Docs:** See `DEVELOPMENT.md`

---

## 💡 Tips for Claude Code Assistants

When helping with this codebase:

1. **Always check if feature should be Preact or vanilla** (see decision tree above)
2. **Don't migrate code unnecessarily** - respect the hybrid approach
3. **Keep API clients vanilla** - they work fine as-is
4. **Test builds after changes** - run `npm run build` to verify
5. **Preserve backward compatibility** - vanilla code still needs to work
6. **Follow existing patterns** - look at Modal.jsx for component structure
7. **When in doubt, ask the user** whether to use Preact or vanilla

---

**Last Updated:** Week 1 completion (February 2026)
**Architecture Status:** Hybrid (Vanilla + Preact coexisting)
**Next Major Milestone:** Evidence Viewers migration (Week 2)
