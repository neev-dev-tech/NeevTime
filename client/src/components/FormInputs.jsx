/**
 * Form Input Components
 * 
 * Enhanced form components with:
 * - Inline error messages
 * - Success states
 * - Input masking
 * - Floating labels (optional)
 * - Character counters
 * 
 * @author DevTeam
 * @version 1.0.0
 */

import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, Eye, EyeOff } from 'lucide-react';

/**
 * Enhanced text input with validation display
 */
export const FormInput = ({
    label,
    name,
    type = 'text',
    placeholder,
    value,
    onChange,
    onBlur,
    error,
    touched,
    required,
    disabled,
    maxLength,
    showCharCount,
    hint,
    prefix,
    suffix,
    className = '',
    inputClassName = '',
    showSuccessState = true,
    ...props
}) => {
    const [showPassword, setShowPassword] = useState(false);
    const isPassword = type === 'password';
    const hasError = touched && error;
    const isValid = touched && !error && value && showSuccessState;

    return (
        <div className={`form-field ${className}`}>
            {label && (
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                    {label}
                    {required && <span className="text-red-500 ml-1">*</span>}
                </label>
            )}
            <div className="relative">
                {prefix && (
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                        {prefix}
                    </span>
                )}
                <input
                    type={isPassword && showPassword ? 'text' : type}
                    name={name}
                    value={value ?? ''}
                    onChange={onChange}
                    onBlur={onBlur}
                    placeholder={placeholder}
                    disabled={disabled}
                    maxLength={maxLength}
                    className={`
                        w-full border rounded-[10px] px-4 py-2.5 text-sm dark:text-slate-100
                        transition-all duration-200 ease-in-out
                        placeholder:text-slate-400
                        ${prefix ? 'pl-10' : ''}
                        ${suffix || isPassword ? 'pr-10' : ''}
                        ${hasError
                            ? 'border-red-400 bg-red-50/50 dark:bg-red-900/20 focus:border-red-500 focus:ring-2 focus:ring-red-200'
                            : isValid
                                ? 'border-green-400 bg-green-50/30 dark:bg-green-900/20 focus:border-green-500 focus:ring-2 focus:ring-green-200'
                                : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 focus:border-orange-400 focus:ring-2 focus:ring-orange-100'
                        }
                        ${disabled ? 'bg-slate-100 dark:bg-slate-700 cursor-not-allowed opacity-60' : ''}
                        focus:outline-none
                        ${inputClassName}
                    `}
                    {...props}
                />
                {/* Password toggle or suffix */}
                {isPassword ? (
                    <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                    >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                ) : suffix ? (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                        {suffix}
                    </span>
                ) : null}
                {/* Validation icon */}
                {hasError && (
                    <AlertCircle
                        size={18}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-red-500"
                        style={{ right: isPassword || suffix ? '40px' : '12px' }}
                    />
                )}
                {isValid && !isPassword && !suffix && (
                    <CheckCircle2
                        size={18}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500"
                    />
                )}
            </div>
            {/* Error message or hint */}
            <div className="min-h-[20px] mt-1 flex items-center justify-between">
                {hasError ? (
                    <span className="text-xs text-red-500 flex items-center gap-1 animate-fade-in">
                        {error}
                    </span>
                ) : hint ? (
                    <span className="text-xs text-slate-400">{hint}</span>
                ) : (
                    <span></span>
                )}
                {showCharCount && maxLength && (
                    <span className={`text-xs ${value?.length >= maxLength ? 'text-red-500' : 'text-slate-400'}`}>
                        {value?.length || 0}/{maxLength}
                    </span>
                )}
            </div>
        </div>
    );
};

/**
 * Enhanced select dropdown with validation
 */
export const FormSelect = ({
    label,
    name,
    value,
    onChange,
    onBlur,
    options = [],
    error,
    touched,
    required,
    disabled,
    placeholder = 'Select...',
    className = '',
    ...props
}) => {
    const hasError = touched && error;
    const isValid = touched && !error && value;

    return (
        <div className={`form-field ${className}`}>
            {label && (
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                    {label}
                    {required && <span className="text-red-500 ml-1">*</span>}
                </label>
            )}
            <div className="relative">
                <select
                    name={name}
                    value={value ?? ''}
                    onChange={onChange}
                    onBlur={onBlur}
                    disabled={disabled}
                    className={`
                        w-full border rounded-[10px] px-4 py-2.5 text-sm dark:text-slate-100 appearance-none
                        transition-all duration-200 ease-in-out
                        ${hasError
                            ? 'border-red-400 bg-red-50/50 dark:bg-red-900/20 focus:border-red-500'
                            : isValid
                                ? 'border-green-400 bg-green-50/30 dark:bg-green-900/20 focus:border-green-500'
                                : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 focus:border-orange-400'
                        }
                        ${disabled ? 'bg-slate-100 dark:bg-slate-700 cursor-not-allowed opacity-60' : ''}
                        focus:outline-none focus:ring-2 
                        ${hasError ? 'focus:ring-red-200' : 'focus:ring-orange-100'}
                    `}
                    {...props}
                >
                    <option value="">{placeholder}</option>
                    {options.map((opt, i) => (
                        <option
                            key={opt.value ?? opt.id ?? i}
                            value={opt.value ?? opt.id ?? opt}
                        >
                            {opt.label ?? opt.name ?? opt}
                        </option>
                    ))}
                </select>
                {/* Dropdown arrow */}
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                </div>
            </div>
            {hasError && (
                <span className="text-xs text-red-500 mt-1 block animate-fade-in">
                    {error}
                </span>
            )}
        </div>
    );
};

/**
 * Enhanced textarea with validation
 */
export const FormTextarea = ({
    label,
    name,
    value,
    onChange,
    onBlur,
    error,
    touched,
    required,
    disabled,
    maxLength,
    showCharCount = true,
    rows = 3,
    placeholder,
    className = '',
    ...props
}) => {
    const hasError = touched && error;
    const isValid = touched && !error && value;

    return (
        <div className={`form-field ${className}`}>
            {label && (
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                    {label}
                    {required && <span className="text-red-500 ml-1">*</span>}
                </label>
            )}
            <textarea
                name={name}
                value={value ?? ''}
                onChange={onChange}
                onBlur={onBlur}
                placeholder={placeholder}
                disabled={disabled}
                maxLength={maxLength}
                rows={rows}
                className={`
                    w-full border rounded-[10px] px-4 py-2.5 text-sm dark:text-slate-100 resize-none
                    transition-all duration-200 ease-in-out
                    placeholder:text-slate-400
                    ${hasError
                        ? 'border-red-400 bg-red-50/50 dark:bg-red-900/20 focus:border-red-500'
                        : isValid
                            ? 'border-green-400 bg-green-50/30 dark:bg-green-900/20 focus:border-green-500'
                            : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 focus:border-orange-400'
                    }
                    ${disabled ? 'bg-slate-100 dark:bg-slate-700 cursor-not-allowed opacity-60' : ''}
                    focus:outline-none focus:ring-2 
                    ${hasError ? 'focus:ring-red-200' : 'focus:ring-orange-100'}
                `}
                {...props}
            />
            <div className="flex items-center justify-between mt-1">
                {hasError ? (
                    <span className="text-xs text-red-500 animate-fade-in">{error}</span>
                ) : (
                    <span></span>
                )}
                {showCharCount && maxLength && (
                    <span className={`text-xs ${value?.length >= maxLength ? 'text-red-500' : 'text-slate-400'}`}>
                        {value?.length || 0}/{maxLength}
                    </span>
                )}
            </div>
        </div>
    );
};

/**
 * Enhanced checkbox with better styling
 */
export const FormCheckbox = ({
    label,
    name,
    checked,
    onChange,
    disabled,
    className = '',
    ...props
}) => {
    return (
        <label className={`flex items-center gap-3 cursor-pointer group ${disabled ? 'opacity-60 cursor-not-allowed' : ''} ${className}`}>
            <div className="relative">
                <input
                    type="checkbox"
                    name={name}
                    checked={checked ?? false}
                    onChange={onChange}
                    disabled={disabled}
                    className="sr-only peer"
                    {...props}
                />
                <div className="w-5 h-5 border-2 border-slate-300 dark:border-slate-600 rounded-md transition-all duration-200
                    peer-checked:bg-orange-500 peer-checked:border-orange-500
                    peer-focus:ring-2 peer-focus:ring-orange-200
                    group-hover:border-orange-400
                    flex items-center justify-center"
                >
                    <svg
                        className="w-3 h-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                    </svg>
                </div>
            </div>
            {label && <span className="text-sm text-slate-700 dark:text-slate-300">{label}</span>}
        </label>
    );
};

/**
 * Enhanced toggle switch
 */
export const FormToggle = ({
    label,
    name,
    checked,
    onChange,
    disabled,
    description,
    className = '',
    ...props
}) => {
    return (
        <div className={`flex items-center justify-between ${className}`}>
            <div>
                {label && <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>}
                {description && <p className="text-xs text-slate-400 mt-0.5">{description}</p>}
            </div>
            <label className={`relative inline-flex items-center cursor-pointer ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}>
                <input
                    type="checkbox"
                    name={name}
                    checked={checked ?? false}
                    onChange={onChange}
                    disabled={disabled}
                    className="sr-only peer"
                    {...props}
                />
                <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 rounded-full peer 
                    peer-checked:bg-green-500
                    peer-focus:ring-2 peer-focus:ring-green-200
                    transition-all duration-300
                    after:content-[''] after:absolute after:top-0.5 after:left-0.5
                    after:bg-white after:rounded-full after:h-5 after:w-5
                    after:transition-all after:duration-300 after:shadow-md
                    peer-checked:after:translate-x-5"
                />
            </label>
        </div>
    );
};

/**
 * Radio button group
 */
export const FormRadioGroup = ({
    label,
    name,
    value,
    onChange,
    options = [],
    error,
    touched,
    required,
    disabled,
    inline = false,
    className = '',
}) => {
    const hasError = touched && error;

    return (
        <div className={`form-field ${className}`}>
            {label && (
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">
                    {label}
                    {required && <span className="text-red-500 ml-1">*</span>}
                </label>
            )}
            <div className={`${inline ? 'flex flex-wrap gap-4' : 'space-y-2'}`}>
                {options.map((opt, i) => (
                    <label
                        key={opt.value ?? i}
                        className={`flex items-center gap-2 cursor-pointer ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                        <input
                            type="radio"
                            name={name}
                            value={opt.value ?? opt}
                            checked={value === (opt.value ?? opt)}
                            onChange={onChange}
                            disabled={disabled}
                            className="w-4 h-4 text-orange-500 border-slate-300 dark:border-slate-600 focus:ring-orange-400"
                        />
                        <span className="text-sm text-slate-700 dark:text-slate-300">{opt.label ?? opt}</span>
                    </label>
                ))}
            </div>
            {hasError && (
                <span className="text-xs text-red-500 mt-1 block animate-fade-in">
                    {error}
                </span>
            )}
        </div>
    );
};

export default FormInput;
