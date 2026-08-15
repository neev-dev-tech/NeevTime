# UI Component Library

## Overview

This document describes the enhanced UI component library for the NeevTime Attendance Management System.

## Quick Import

```jsx
import { 
    // Cards
    Card, CardHeader, CardBody, CardFooter,
    StatCard, SummaryCard, ActionCard, InfoCard, FeatureCard, ListCard,
    
    // Data Display
    DataTable, createColumn,
    
    // Forms
    FormInput, FormSelect, FormTextarea, FormCheckbox, FormToggle, FormRadioGroup,
    useFormValidation, validators,
    
    // Empty States
    EmptyNoData, EmptySearchResults, EmptyEmployees, EmptyDevices,
    EmptyAttendance, EmptyReports, EmptyError, EmptySuccess
} from '../components';
```

---

## 1. Card Components

### Basic Card
```jsx
<Card variant="default" size="md" hover>
    <CardHeader title="Card Title" subtitle="Optional subtitle" icon={<Users />} />
    <CardBody>
        Your content here...
    </CardBody>
    <CardFooter>
        <button>Action</button>
    </CardFooter>
</Card>
```

### Card Variants
- `default` - White background with subtle border and shadow
- `elevated` - Stronger shadow for emphasis
- `outlined` - Prominent border, no shadow
- `glass` - Glassmorphism effect with backdrop blur
- `gradient` - Subtle gradient background

### StatCard (Dashboard Stats)
```jsx
<StatCard
    label="Total Employees"
    value={156}
    icon={<Users />}
    color="green"  // 'orange', 'green', 'blue', 'red', 'purple'
    trend="up"
    trendValue="+12%"
/>
```

### SummaryCard
```jsx
<SummaryCard
    title="Attendance Summary"
    icon={<Calendar />}
    items={[
        { label: 'Present', value: '85', color: 'green' },
        { label: 'Absent', value: '10', color: 'red' },
        { label: 'Late', value: '5', color: 'orange' }
    ]}
/>
```

### ActionCard
```jsx
<ActionCard
    title="Quick Actions"
    description="Perform common tasks quickly"
    icon={<Zap />}
    actionLabel="Get Started"
    onAction={() => navigate('/action')}
/>
```

### ListCard
```jsx
<ListCard
    title="Recent Activity"
    maxItems={5}
    onViewAll={() => navigate('/activity')}
    items={[
        { primary: 'John Doe', secondary: 'Checked in at 9:00 AM', icon: <User /> },
        { primary: 'Jane Smith', secondary: 'Checked out at 6:00 PM', icon: <User /> }
    ]}
/>
```

---

## 2. DataTable Component

### Basic Usage
```jsx
<DataTable
    data={employees}
    columns={[
        { key: 'employee_code', label: 'ID', sortable: true },
        { key: 'name', label: 'Name', sortable: true },
        { key: 'status', label: 'Status', type: 'status' }
    ]}
    selectable={true}
    searchable={true}
    showColumnToggle={true}
    pageSize={25}
/>
```

### Column Types
- `text` (default)
- `date` - Formats ISO dates
- `time` - Formats timestamps
- `status` - Shows colored badge
- `currency` - Formats as INR
- `percentage` - Adds % suffix

### Props
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `data` | array | [] | Data to display |
| `columns` | array | [] | Column definitions |
| `selectable` | bool | false | Enable row selection |
| `searchable` | bool | true | Show search input |
| `showColumnToggle` | bool | true | Show column visibility menu |
| `stickyHeader` | bool | true | Sticky table header |
| `stickyFirstColumn` | bool | false | Freeze first column |
| `pageSize` | number | 25 | Rows per page |
| `onExport` | func | - | Export handler |

---

## 3. Form Components

### FormInput with Validation
```jsx
const { values, errors, touched, handleChange, handleBlur, handleSubmit, isValid } = 
    useFormValidation(initialValues, {
        email: [validators.required(), validators.email()],
        name: [validators.required(), validators.minLength(2)]
    });

<FormInput
    label="Email"
    type="email"
    required
    value={values.email}
    error={touched.email && errors.email}
    onChange={(e) => handleChange('email', e.target.value)}
    onBlur={() => handleBlur('email')}
    hint="We'll never share your email"
/>
```

### Available Validators
- `validators.required(message)`
- `validators.email(message)`
- `validators.phone(message)`
- `validators.minLength(min, message)`
- `validators.maxLength(max, message)`
- `validators.pattern(regex, message)`
- `validators.employeeCode(message)`
- `validators.numeric(message)`
- `validators.min(value, message)`
- `validators.max(value, message)`

### FormSelect
```jsx
<FormSelect
    label="Department"
    required
    options={departments.map(d => ({ value: d.id, label: d.name }))}
    {...getFieldProps('department_id')}
/>
```

### FormToggle
```jsx
<FormToggle
    label="Enable Notifications"
    description="Receive email alerts for important events"
    checked={settings.notifications}
    onChange={(e) => updateSetting('notifications', e.target.checked)}
/>
```

---

## 4. Empty State Components

### Usage
```jsx
// No data
{data.length === 0 && !loading && <EmptyNoData onAction={() => fetchData()} />}

// No search results
{data.length === 0 && searchTerm && (
    <EmptySearchResults searchTerm={searchTerm} onClear={() => setSearchTerm('')} />
)}

// Error state
{error && <EmptyError message={error.message} onRetry={() => retry()} />}

// Context-specific
<EmptyEmployees onAdd={() => setShowModal(true)} />
<EmptyDevices onAdd={() => navigate('/devices/add')} />
<EmptyAttendance onSync={() => syncDevices()} />
```

### Available Presets
| Component | Use Case |
|-----------|----------|
| `EmptyNoData` | Generic empty state |
| `EmptySearchResults` | No search matches |
| `EmptyEmployees` | Employee list empty |
| `EmptyDevices` | No devices connected |
| `EmptyAttendance` | No attendance records |
| `EmptyReports` | No reports generated |
| `EmptyError` | Error occurred |
| `EmptySuccess` | Operation successful |
| `EmptyOffline` | Network offline |
| `EmptyDepartments` | No departments |
| `EmptyShifts` | No shifts configured |

---

## 5. PDF Export

### Basic Export
```jsx
import { exportToPDF } from '../utils/pdfExport';

exportToPDF({
    data: reportData,
    title: 'Daily Attendance Report',
    dateRange: '2024-12-01 to 2024-12-31',
    orientation: 'landscape'
});
```

### With Summary Cards
```jsx
exportToPDF({
    data: reportData,
    title: 'Monthly Summary',
    summaryData: [
        { label: 'Present', value: 85, color: 'success' },
        { label: 'Absent', value: 10, color: 'error' },
        { label: 'Late', value: 5, color: 'warning' }
    ],
    showSignature: true,
    signatureLabels: ['Prepared By', 'Approved By', 'HR Manager']
});
```

---

## Design Tokens

### Colors (Tailwind Classes)
- **Primary**: `orange-500`, `orange-600`
- **Success**: `green-500`, `emerald-500`
- **Warning**: `amber-500`, `yellow-500`
- **Error**: `red-500`, `rose-500`
- **Info**: `blue-500`, `indigo-500`

### Border Radius
- Cards: `rounded-2xl` (16px)
- Buttons: `rounded-xl` (12px)
- Inputs: `rounded-[10px]`
- Badges: `rounded-full`

### Shadows
- Default: `shadow-sm`
- Elevated: `shadow-md`
- Modal: `shadow-2xl`
- Hover: `hover:shadow-lg`

---

## 6. Toast Notifications

### Setup
Wrap your app with `ToastProvider`:
```jsx
// App.jsx
import { ToastProvider } from './components';

function App() {
    return (
        <ToastProvider position="top-right">
            <YourApp />
        </ToastProvider>
    );
}
```

### Usage
```jsx
import { useToast } from '../components';

function MyComponent() {
    const { toast } = useToast();
    
    // Simple toasts
    toast.success('Employee added successfully!');
    toast.error('Failed to save changes');
    toast.warning('Unsaved changes will be lost');
    toast.info('Tip: You can use keyboard shortcuts');
    
    // With options
    toast.success('Saved!', {
        duration: 3000,
        actionLabel: 'Undo',
        action: () => handleUndo()
    });
    
    // Promise-based toast
    await toast.promise(
        saveEmployee(data),
        {
            loading: 'Saving employee...',
            success: 'Employee saved!',
            error: 'Failed to save'
        }
    );
}
```

### Positions
- `top-right` (default)
- `top-left`
- `top-center`
- `bottom-right`
- `bottom-left`
- `bottom-center`

---

## 7. Animations

### RippleButton
Material-design style button with ripple effect:
```jsx
import { RippleButton } from '../components';

<RippleButton 
    variant="primary"  // 'primary', 'secondary', 'outline', 'ghost', 'danger'
    size="md"          // 'sm', 'md', 'lg'
    loading={isLoading}
    icon={<Plus size={18} />}
    onClick={handleClick}
>
    Add Employee
</RippleButton>
```

### PageTransition
Animate page content on mount:
```jsx
import { PageTransition } from '../components';

<PageTransition type="slide-up" duration={300}>
    <YourPageContent />
</PageTransition>
```

**Animation Types:**
- `fade` - Simple fade in
- `slide-up` - Fade and slide from bottom
- `slide-left` - Fade and slide from right
- `slide-right` - Fade and slide from left
- `scale` - Fade and scale up

### StaggerChildren
Animate list items with staggered delay:
```jsx
import { StaggerChildren } from '../components';

<StaggerChildren staggerDelay={50} animation="fade-up">
    {items.map(item => (
        <Card key={item.id}>{item.name}</Card>
    ))}
</StaggerChildren>
```

### AnimateOnScroll
Trigger animation when element enters viewport:
```jsx
import { AnimateOnScroll } from '../components';

<AnimateOnScroll animation="fade-up" threshold={0.1}>
    <Card>This animates when scrolled into view</Card>
</AnimateOnScroll>
```

### Skeleton Loader
Shimmer loading placeholder:
```jsx
import { Skeleton } from '../components';

// Loading state
<Skeleton width="100%" height="1.5rem" rounded="md" />
<Skeleton width="200px" height="2rem" rounded="lg" />
<Skeleton width="40px" height="40px" rounded="full" />
```

---

## 8. Theme System

### Setup
Wrap your app with `ThemeProvider`:
```jsx
// App.jsx
import { ThemeProvider, ToastProvider } from './components';

function App() {
    return (
        <ThemeProvider>
            <ToastProvider>
                <YourApp />
            </ToastProvider>
        </ThemeProvider>
    );
}
```

### Dark Mode Toggle
```jsx
import { DarkModeToggle } from '../components';

// In your header/navbar
<DarkModeToggle />
```

### Theme Panel Button
Opens a side panel for full theme customization:
```jsx
import { ThemeButton } from '../components';

// In settings or header
<ThemeButton />
```

### Using Theme in Components
```jsx
import { useTheme } from '../components';

function MyComponent() {
    const { isDarkMode, themeColors, toggleDarkMode, setTheme } = useTheme();
    
    return (
        <div style={{ backgroundColor: themeColors.primary }}>
            Current theme is {isDarkMode ? 'dark' : 'light'}
        </div>
    );
}
```

### Available Theme Presets
- **NeevTime Orange** (default) - `#F97316`
- **Ocean Blue** - `#3B82F6`
- **Royal Purple** - `#8B5CF6`
- **Forest Green** - `#22C55E`
- **Rose Pink** - `#F43F5E`
- **Teal** - `#14B8A6`

### CSS Variables (Theme-aware)
```css
/* These update automatically when theme changes */
var(--color-primary)
var(--color-primary-dark)
var(--color-primary-light)
var(--color-success)
var(--color-warning)
var(--color-error)
var(--color-info)

/* Dark mode aware */
var(--color-bg-primary)
var(--color-bg-secondary)
var(--color-text-primary)
var(--color-text-secondary)
var(--color-border)
```

---

## File Structure

```
client/src/
├── components/
│   ├── index.js          # Central exports
│   ├── Card.jsx          # Card variants
│   ├── DataTable.jsx     # Sortable table
│   ├── EmptyState.jsx    # Empty states
│   ├── FormInputs.jsx    # Form components
│   ├── Toast.jsx         # Toast notifications
│   ├── Animations.jsx    # Micro-animations
│   ├── Theme.jsx         # Theme system
│   └── README.md         # This file
├── hooks/
│   └── useFormValidation.js
└── utils/
    └── pdfExport.js
```
