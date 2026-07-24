import React from 'react';
import { Trash2, Edit, Download, Copy, MoreVertical, X } from 'lucide-react';
import { toast } from './ToastContainer';

/**
 * BulkActions Component
 * Provides bulk operation UI for selected items
 * 
 * @param {Array} selectedItems - Array of selected item IDs
 * @param {Function} onClearSelection - Function to clear selection
 * @param {Object} actions - Available bulk actions
 * @param {Function} onAction - Callback when action is triggered
 */
export default function BulkActions({
    selectedItems = [],
    onClearSelection,
    actions = {},
    onAction
}) {
    const [showMenu, setShowMenu] = React.useState(false);

    if (selectedItems.length === 0) return null;

    const defaultActions = {
        delete: {
            label: 'Delete',
            icon: Trash2,
            color: 'text-red-600',
            bgColor: 'bg-red-50 hover:bg-red-100',
            onClick: async () => {
                if (onAction) {
                    await onAction('delete', selectedItems);
                }
            }
        },
        edit: {
            label: 'Edit',
            icon: Edit,
            color: 'text-blue-600',
            bgColor: 'bg-blue-50 hover:bg-blue-100',
            onClick: async () => {
                if (onAction) {
                    await onAction('edit', selectedItems);
                }
            }
        },
        export: {
            label: 'Export',
            icon: Download,
            color: 'text-green-600',
            bgColor: 'bg-green-50 hover:bg-green-100',
            onClick: async () => {
                if (onAction) {
                    await onAction('export', selectedItems);
                }
            }
        },
        copy: {
            label: 'Copy',
            icon: Copy,
            color: 'text-slate-600',
            bgColor: 'bg-slate-50 hover:bg-slate-100',
            onClick: async () => {
                if (onAction) {
                    await onAction('copy', selectedItems);
                }
            }
        }
    };

    const availableActions = { ...defaultActions, ...actions };

    const handleAction = async (action) => {
        try {
            if (availableActions[action]?.onClick) {
                await availableActions[action].onClick();
            }
            setShowMenu(false);
        } catch (err) {
            toast.error(`Failed to ${action}: ${err.message}`);
        }
    };

    return (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center gap-4">
                {/* Selection Count */}
                <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                        {selectedItems.length} {selectedItems.length === 1 ? 'item' : 'items'} selected
                    </span>
                </div>

                {/* Divider */}
                <div className="h-6 w-px bg-slate-300 dark:bg-slate-600"></div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2">
                    {Object.entries(availableActions).map(([key, action]) => {
                        const Icon = action.icon;
                        return (
                            <button
                                key={key}
                                onClick={() => handleAction(key)}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${action.bgColor} ${action.color}`}
                                title={action.label}
                            >
                                <Icon size={16} />
                                <span className="hidden sm:inline">{action.label}</span>
                            </button>
                        );
                    })}
                </div>

                {/* Clear Selection */}
                <button
                    onClick={onClearSelection}
                    className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
                    title="Clear selection"
                >
                    <X size={18} />
                </button>
            </div>
        </div>
    );
}

/**
 * useBulkSelection Hook
 * Manages bulk selection state
 */
export const useBulkSelection = (items = []) => {
    const [selectedItems, setSelectedItems] = React.useState([]);

    const toggleSelection = (id) => {
        setSelectedItems(prev =>
            prev.includes(id)
                ? prev.filter(item => item !== id)
                : [...prev, id]
        );
    };

    const selectAll = () => {
        setSelectedItems(items.map(item => item.id || item));
    };

    const clearSelection = () => {
        setSelectedItems([]);
    };

    const isSelected = (id) => {
        return selectedItems.includes(id);
    };

    const isAllSelected = () => {
        return items.length > 0 && selectedItems.length === items.length;
    };

    const isIndeterminate = () => {
        return selectedItems.length > 0 && selectedItems.length < items.length;
    };

    return {
        selectedItems,
        toggleSelection,
        selectAll,
        clearSelection,
        isSelected,
        isAllSelected,
        isIndeterminate
    };
};

