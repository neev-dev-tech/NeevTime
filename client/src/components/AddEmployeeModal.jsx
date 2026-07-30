/**
 * Add Employee Modal with Validation
 * 
 * Enhanced employee creation form with:
 * - Real-time field validation
 * - Inline error messages
 * - Visual feedback (success/error states)
 * - Submit blocking until valid
 * 
 * @author DevTeam
 * @version 2.0.0
 */

import React, { useEffect } from 'react';
import { X, User, Briefcase, CreditCard } from 'lucide-react';
import { useFormValidation, validators } from '../hooks/useFormValidation';
import { FormInput, FormSelect, FormTextarea } from './FormInputs';
import Button from './ui/Button';

// Validation rules for employee form
const employeeValidationRules = {
    employee_code: [
        validators.required('Employee ID is required'),
        validators.employeeCode('Employee ID must be 2-20 alphanumeric characters')
    ],
    name: [
        validators.required('Full name is required'),
        validators.minLength(2, 'Name must be at least 2 characters'),
        validators.maxLength(100, 'Name is too long')
    ],
    email: [
        validators.email('Please enter a valid email address')
    ],
    mobile: [
        validators.phone('Please enter a valid phone number')
    ],
    department_id: [
        validators.required('Please select a department')
    ]
};

export default function AddEmployeeModal({
    isOpen,
    onClose,
    onSubmit,
    departments = [],
    positions = [],
    areas = []
}) {
    const initialValues = {
        employee_code: '',
        name: '',
        department_id: '',
        designation: '',
        area_id: '',
        card_number: '',
        password: '',
        privilege: 0,
        gender: 'Male',
        dob: '',
        joining_date: new Date().toISOString().split('T')[0],
        mobile: '',
        email: '',
        address: '',
        status: 'active',
        employment_type: 'Permanent'
    };

    const {
        values,
        errors,
        touched,
        isSubmitting,
        isValid,
        handleChange,
        handleBlur,
        handleSubmit,
        reset,
        getFieldProps
    } = useFormValidation(initialValues, employeeValidationRules);

    // Reset form when modal opens
    useEffect(() => {
        if (isOpen) {
            reset(initialValues);
        }
    }, [isOpen]);

    const onFormSubmit = async (formData) => {
        try {
            await onSubmit(formData);
            onClose();
        } catch (error) {
            console.error('Submit error:', error);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4">
            <div
                className="rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden border animate-slide-up bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                style={{ borderRadius: '16px' }}
            >
                {/* Header */}
                <div className="px-8 py-5 border-b flex justify-between items-center bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                    <div>
                        <h3 className="font-semibold text-xl text-slate-800 dark:text-slate-100">
                            Add Employee
                        </h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                            Fill in the details to create a new employee record
                        </p>
                    </div>
                    <Button variant="ghost" size="sm" icon={X} onClick={onClose} aria-label="Close" />
                </div>

                {/* Form */}
                <form
                    onSubmit={handleSubmit(onFormSubmit)}
                    className="p-8 overflow-y-auto max-h-[calc(90vh-180px)] custom-scrollbar"
                    noValidate
                >
                    {/* Personal Details Section */}
                    <div className="mb-8">
                        <div className="flex items-center gap-2 pb-3 mb-6 border-b border-slate-100 dark:border-slate-700">
                            <div className="p-2 bg-orange-50 dark:bg-orange-900/30 rounded-lg">
                                <User size={18} className="text-orange-500" />
                            </div>
                            <span className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                                Personal Details
                            </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                            <FormInput
                                label="Employee ID"
                                placeholder="e.g. EMP001"
                                required
                                {...getFieldProps('employee_code')}
                                hint="Unique identifier for the employee"
                            />

                            <FormInput
                                label="Full Name"
                                placeholder="John Doe"
                                required
                                {...getFieldProps('name')}
                            />

                            <FormSelect
                                label="Gender"
                                options={[
                                    { value: 'Male', label: 'Male' },
                                    { value: 'Female', label: 'Female' },
                                    { value: 'Other', label: 'Other' }
                                ]}
                                {...getFieldProps('gender')}
                            />

                            <FormInput
                                label="Date of Birth"
                                type="date"
                                {...getFieldProps('dob')}
                            />

                            <FormInput
                                label="Mobile Number"
                                type="tel"
                                placeholder="+91 98765 43210"
                                prefix="+91"
                                {...getFieldProps('mobile')}
                            />

                            <FormInput
                                label="Email Address"
                                type="email"
                                placeholder="john@example.com"
                                {...getFieldProps('email')}
                            />

                            <div className="md:col-span-3">
                                <FormTextarea
                                    label="Address"
                                    placeholder="Enter employee's full address"
                                    maxLength={500}
                                    showCharCount
                                    {...getFieldProps('address')}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Work Details Section */}
                    <div className="mb-8">
                        <div className="flex items-center gap-2 pb-3 mb-6 border-b border-slate-100 dark:border-slate-700">
                            <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                                <Briefcase size={18} className="text-blue-500" />
                            </div>
                            <span className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                                Work Details
                            </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                            <FormSelect
                                label="Department"
                                required
                                placeholder="Select Department"
                                options={departments.map(d => ({ value: d.id, label: d.name }))}
                                {...getFieldProps('department_id')}
                            />

                            <FormSelect
                                label="Position / Designation"
                                placeholder="Select Position"
                                options={positions.map(p => ({ value: p.name, label: p.name }))}
                                {...getFieldProps('designation')}
                            />

                            <FormSelect
                                label="Area"
                                placeholder="Select Area"
                                options={areas.map(a => ({ value: a.id, label: a.name }))}
                                {...getFieldProps('area_id')}
                            />

                            <FormInput
                                label="Joining Date"
                                type="date"
                                {...getFieldProps('joining_date')}
                            />

                            <FormSelect
                                label="Status"
                                options={[
                                    { value: 'active', label: 'Active' },
                                    { value: 'inactive', label: 'Inactive' },
                                    { value: 'resigned', label: 'Resigned' },
                                    { value: 'terminated', label: 'Terminated' }
                                ]}
                                {...getFieldProps('status')}
                            />

                            <FormSelect
                                label="Employment Type"
                                options={[
                                    { value: 'Permanent', label: 'Permanent' },
                                    { value: 'Contract', label: 'Contract' },
                                    { value: 'Intern', label: 'Intern' }
                                ]}
                                {...getFieldProps('employment_type')}
                            />
                        </div>
                    </div>

                    {/* System Access Section */}
                    <div>
                        <div className="flex items-center gap-2 pb-3 mb-6 border-b border-slate-100 dark:border-slate-700">
                            <div className="p-2 bg-purple-50 dark:bg-purple-900/30 rounded-lg">
                                <CreditCard size={18} className="text-purple-500" />
                            </div>
                            <span className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                                System & Device
                            </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                            <FormInput
                                label="Card Number"
                                placeholder="Enter card number"
                                {...getFieldProps('card_number')}
                            />

                            <FormInput
                                label="Device Password"
                                type="password"
                                placeholder="4-6 digits"
                                maxLength={6}
                                {...getFieldProps('password')}
                                hint="Used for device authentication"
                            />

                            <FormSelect
                                label="Privilege Level"
                                options={[
                                    { value: 0, label: 'User' },
                                    { value: 1, label: 'Enroller' },
                                    { value: 2, label: 'Administrator' },
                                    { value: 3, label: 'Super Admin' }
                                ]}
                                {...getFieldProps('privilege')}
                            />
                        </div>
                    </div>
                </form>

                {/* Footer */}
                <div className="px-8 py-4 border-t flex items-center justify-between bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                    <div className="text-sm text-slate-500 dark:text-slate-400">
                        {!isValid && touched.employee_code && (
                            <span className="text-red-500">
                                Please fix the validation errors above
                            </span>
                        )}
                    </div>
                    <div className="flex gap-3">
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={onClose}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            variant="primary"
                            onClick={handleSubmit(onFormSubmit)}
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? (
                                <>
                                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                'Add Employee'
                            )}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
