/**
 * UI Components Index
 * 
 * Central export for all reusable UI components.
 * Import components from this file for cleaner imports:
 * 
 * import { Card, StatCard, DataTable, FormInput, EmptyNoData, useToast, RippleButton } from '../components';
 */

// Cards
export {
    Card,
    CardHeader,
    CardBody,
    CardFooter,
    StatCard,
    SummaryCard,
    ActionCard,
    InfoCard,
    FeatureCard,
    ListCard
} from './Card';

// Data Display
export { default as DataTable, createColumn, columnPresets } from './DataTable';

// Form Components
export {
    FormInput,
    FormSelect,
    FormTextarea,
    FormCheckbox,
    FormToggle,
    FormRadioGroup
} from './FormInputs';

// Empty States
export {
    EmptyState,
    EmptyNoData,
    EmptySearchResults,
    EmptyEmployees,
    EmptyDevices,
    EmptyAttendance,
    EmptyReports,
    EmptyError,
    EmptySuccess,
    EmptyOffline,
    EmptyDepartments,
    EmptyShifts,
    EmptyLoading
} from './EmptyState';

// Toast Notifications
export {
    ToastProvider,
    useToast
} from './Toast';

// Animations
export {
    Ripple,
    RippleButton,
    PageTransition,
    StaggerChildren,
    HoverScale,
    AnimateOnScroll,
    Pulse,
    Bounce,
    Skeleton
} from './Animations';

// Theme System
export {
    ThemeProvider,
    useTheme,
    DarkModeToggle,
    ThemePanel,
    ThemeButton
} from './Theme';

// Modals
export { default as AddEmployeeModal } from './AddEmployeeModal';
export { default as EmployeeFormModal } from './EmployeeFormModal';

// Re-export validation hook for convenience
export { useFormValidation, validators, PATTERNS } from '../hooks/useFormValidation';

// Standard UI kit
export { default as Button } from "./ui/Button";
export { default as PageHeader } from "./ui/PageHeader";
export { default as ExportMenu } from "./ExportMenu";
