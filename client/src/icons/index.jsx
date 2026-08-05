/**
 * Icon set — Phosphor, rendered solid.
 *
 * The app previously used lucide-react: outline only, thin strokes, and no
 * filled weight, so the icons read as flat no matter how they were coloured.
 * Phosphor ships the same glyphs with a `weight` prop; this module fixes that
 * weight to "fill" and re-exports every icon under the lucide name it replaces.
 *
 * vite.config.js aliases 'lucide-react' to this file, so the ~63 files that
 * already import from lucide keep working untouched — `<Users size={20} />`
 * still renders, just solid now. Nothing else had to change.
 *
 * To add an icon: map the lucide name to its Phosphor equivalent below. Names
 * differ between the two sets (Settings/GearSix, Tablet/DeviceTablet), which is
 * why this is an explicit table rather than a pass-through.
 *
 * Generated — see gen_shim.mjs in git history for the mapping process.
 */
import React from 'react';
import {
    AirplaneTilt as PAirplaneTilt,
    AlarmIcon as PAlarmIcon,
    ArrowCounterClockwise as PArrowCounterClockwise,
    ArrowDownRight as PArrowDownRight,
    CloudSlash as PCloudSlash,
    ArrowLeft as PArrowLeft,
    ArrowRight as PArrowRight,
    ArrowSquareOut as PArrowSquareOut,
    ArrowUpRight as PArrowUpRight,
    ArrowsClockwise as PArrowsClockwise,
    ArrowsLeftRight as PArrowsLeftRight,
    Bell as PBell,
    BellSlash as PBellSlash,
    Brain as PBrain,
    Briefcase as PBriefcase,
    Buildings as PBuildings,
    Calculator as PCalculator,
    CalendarBlank as PCalendarBlank,
    CalendarCheck as PCalendarCheck,
    CalendarDots as PCalendarDots,
    Camera as PCamera,
    CaretDoubleLeft as PCaretDoubleLeft,
    CaretDoubleRight as PCaretDoubleRight,
    CaretDown as PCaretDown,
    CaretLeft as PCaretLeft,
    CaretRight as PCaretRight,
    CaretUp as PCaretUp,
    CaretUpDown as PCaretUpDown,
    ChartBar as PChartBar,
    ChartPie as PChartPie,
    ChatCentered as PChatCentered,
    Check as PCheck,
    CheckCircle as PCheckCircle,
    CheckSquare as PCheckSquare,
    Circle as PCircle,
    CircleNotch as PCircleNotch,
    ClipboardText as PClipboardText,
    Clock as PClock,
    Coffee as PCoffee,
    Columns as PColumns,
    Command as PCommand,
    CreditCard as PCreditCard,
    Database as PDatabase,
    DeviceMobile as PDeviceMobile,
    DeviceTablet as PDeviceTablet,
    Devices as PDevices,
    DownloadSimple as PDownloadSimple,
    EnvelopeSimple as PEnvelopeSimple,
    Eye as PEye,
    EyeSlash as PEyeSlash,
    FileArrowDown as PFileArrowDown,
    FileCode as PFileCode,
    FileDashed as PFileDashed,
    FileText as PFileText,
    FileX as PFileX,
    FileXls as PFileXls,
    Fingerprint as PFingerprint,
    FloppyDisk as PFloppyDisk,
    FlowArrow as PFlowArrow,
    Folder as PFolder,
    FolderOpen as PFolderOpen,
    FunnelSimple as PFunnelSimple,
    GearSix as PGearSix,
    GitBranch as PGitBranch,
    GitCommit as PGitCommit,
    Globe as PGlobe,
    GridFour as PGridFour,
    HardDrives as PHardDrives,
    Hash as PHash,
    House as PHouse,
    Image as PImage,
    Info as PInfo,
    Key as PKey,
    Lightning as PLightning,
    List as PList,
    ListDashes as PListDashes,
    Lock as PLock,
    LockKey as PLockKey,
    MagnifyingGlass as PMagnifyingGlass,
    MagnifyingGlassMinus as PMagnifyingGlassMinus,
    MapPin as PMapPin,
    MapTrifold as PMapTrifold,
    Monitor as PMonitor,
    Moon as PMoon,
    NavigationArrow as PNavigationArrow,
    Palette as PPalette,
    PaperPlaneTilt as PPaperPlaneTilt,
    PencilSimple as PPencilSimple,
    Percent as PPercent,
    Phone as PPhone,
    PlayCircle as PPlayCircle,
    Plus as PPlus,
    Power as PPower,
    Printer as PPrinter,
    Pulse as PPulse,
    Question as PQuestion,
    RadioButton as PRadioButton,
    Scales as PScales,
    Shield as PShield,
    ShieldCheck as PShieldCheck,
    ShieldWarning as PShieldWarning,
    SignIn as PSignIn,
    SignOut as PSignOut,
    SlidersHorizontal as PSlidersHorizontal,
    SquaresFour as PSquaresFour,
    Star as PStar,
    Sun as PSun,
    Table as PTable,
    Target as PTarget,
    Timer as PTimer,
    Trash as PTrash,
    Tray as PTray,
    TreeStructure as PTreeStructure,
    TrendDown as PTrendDown,
    TrendUp as PTrendUp,
    UploadSimple as PUploadSimple,
    User as PUser,
    UserCheck as PUserCheck,
    UserCircle as PUserCircle,
    UserFocus as PUserFocus,
    UserMinus as PUserMinus,
    UserPlus as PUserPlus,
    UsersThree as PUsersThree,
    Warning as PWarning,
    WarningCircle as PWarningCircle,
    WifiHigh as PWifiHigh,
    WifiSlash as PWifiSlash,
    X as PX,
    XCircle as PXCircle,
    XSquare as PXSquare
} from '@phosphor-icons/react';

/** Wrap a Phosphor icon so it defaults to the solid weight. */
const solid = (Icon, displayName) => {
    const Wrapped = React.forwardRef(({ weight, strokeWidth, ...props }, ref) => (
        // strokeWidth is swallowed: it is a lucide prop with no Phosphor meaning,
        // and passing it through would land invalid DOM attributes on the <svg>.
        <Icon ref={ref} weight={weight || 'fill'} {...props} />
    ));
    Wrapped.displayName = displayName;
    return Wrapped;
};

export const Activity = solid(PPulse, 'Activity');
export const AlarmClock = solid(PAlarmIcon, 'AlarmClock');
export const AlertCircle = solid(PWarningCircle, 'AlertCircle');
export const AlertTriangle = solid(PWarning, 'AlertTriangle');
export const ArrowDownRight = solid(PArrowDownRight, 'ArrowDownRight');
export const ArrowLeft = solid(PArrowLeft, 'ArrowLeft');
export const ArrowLeftRight = solid(PArrowsLeftRight, 'ArrowLeftRight');
export const ArrowRight = solid(PArrowRight, 'ArrowRight');
export const ArrowRightLeft = solid(PArrowsLeftRight, 'ArrowRightLeft');
export const ArrowUpRight = solid(PArrowUpRight, 'ArrowUpRight');
export const BarChart3 = solid(PChartBar, 'BarChart3');
export const Bell = solid(PBell, 'Bell');
export const BellOff = solid(PBellSlash, 'BellOff');
export const Brain = solid(PBrain, 'Brain');
export const Briefcase = solid(PBriefcase, 'Briefcase');
export const Building = solid(PBuildings, 'Building');
export const Building2 = solid(PBuildings, 'Building2');
export const Calculator = solid(PCalculator, 'Calculator');
export const Calendar = solid(PCalendarBlank, 'Calendar');
export const CalendarCheck = solid(PCalendarCheck, 'CalendarCheck');
export const CalendarDays = solid(PCalendarDots, 'CalendarDays');
export const Camera = solid(PCamera, 'Camera');
export const Check = solid(PCheck, 'Check');
export const CheckCircle = solid(PCheckCircle, 'CheckCircle');
export const CheckCircle2 = solid(PCheckCircle, 'CheckCircle2');
export const CheckSquare = solid(PCheckSquare, 'CheckSquare');
export const ChevronDown = solid(PCaretDown, 'ChevronDown');
export const ChevronLeft = solid(PCaretLeft, 'ChevronLeft');
export const ChevronRight = solid(PCaretRight, 'ChevronRight');
export const ChevronUp = solid(PCaretUp, 'ChevronUp');
export const ChevronsLeft = solid(PCaretDoubleLeft, 'ChevronsLeft');
export const ChevronsRight = solid(PCaretDoubleRight, 'ChevronsRight');
export const ChevronsUpDown = solid(PCaretUpDown, 'ChevronsUpDown');
export const Circle = solid(PCircle, 'Circle');
export const CircleDot = solid(PRadioButton, 'CircleDot');
export const ClipboardEdit = solid(PClipboardText, 'ClipboardEdit');
export const ClipboardList = solid(PClipboardText, 'ClipboardList');
export const Clock = solid(PClock, 'Clock');
export const Coffee = solid(PCoffee, 'Coffee');
export const Columns3 = solid(PColumns, 'Columns3');
export const Command = solid(PCommand, 'Command');
export const CreditCard = solid(PCreditCard, 'CreditCard');
export const Database = solid(PDatabase, 'Database');
export const Download = solid(PDownloadSimple, 'Download');
export const Edit = solid(PPencilSimple, 'Edit');
export const Edit2 = solid(PPencilSimple, 'Edit2');
export const ExternalLink = solid(PArrowSquareOut, 'ExternalLink');
export const Eye = solid(PEye, 'Eye');
export const EyeOff = solid(PEyeSlash, 'EyeOff');
export const FileBarChart = solid(PFileText, 'FileBarChart');
export const FileCheck = solid(PFileArrowDown, 'FileCheck');
export const FileCode = solid(PFileCode, 'FileCode');
export const FileDown = solid(PFileArrowDown, 'FileDown');
export const FileQuestion = solid(PFileDashed, 'FileQuestion');
export const FileSpreadsheet = solid(PFileXls, 'FileSpreadsheet');
export const FileText = solid(PFileText, 'FileText');
export const FileX = solid(PFileX, 'FileX');
export const Filter = solid(PFunnelSimple, 'Filter');
export const Fingerprint = solid(PFingerprint, 'Fingerprint');
export const Folder = solid(PFolder, 'Folder');
export const FolderOpen = solid(PFolderOpen, 'FolderOpen');
export const GitBranch = solid(PGitBranch, 'GitBranch');
export const GitCommit = solid(PGitCommit, 'GitCommit');
export const Globe = solid(PGlobe, 'Globe');
export const Grid = solid(PGridFour, 'Grid');
export const HardDrive = solid(PHardDrives, 'HardDrive');
export const Hash = solid(PHash, 'Hash');
export const HelpCircle = solid(PQuestion, 'HelpCircle');
export const Home = solid(PHouse, 'Home');
export const Image = solid(PImage, 'Image');
export const Inbox = solid(PTray, 'Inbox');
export const Info = solid(PInfo, 'Info');
export const KeyRound = solid(PKey, 'KeyRound');
export const LayoutDashboard = solid(PSquaresFour, 'LayoutDashboard');
export const LayoutList = solid(PListDashes, 'LayoutList');
export const List = solid(PList, 'List');
export const Loader = solid(PCircleNotch, 'Loader');
export const Loader2 = solid(PCircleNotch, 'Loader2');
export const Lock = solid(PLock, 'Lock');
export const LockKeyhole = solid(PLockKey, 'LockKeyhole');
export const LogIn = solid(PSignIn, 'LogIn');
export const LogOut = solid(PSignOut, 'LogOut');
export const Mail = solid(PEnvelopeSimple, 'Mail');
export const Map = solid(PMapTrifold, 'Map');
export const MapPin = solid(PMapPin, 'MapPin');
export const MessageSquare = solid(PChatCentered, 'MessageSquare');
export const Monitor = solid(PMonitor, 'Monitor');
export const Moon = solid(PMoon, 'Moon');
export const Navigation = solid(PNavigationArrow, 'Navigation');
export const Network = solid(PTreeStructure, 'Network');
export const Palette = solid(PPalette, 'Palette');
export const Percent = solid(PPercent, 'Percent');
export const Phone = solid(PPhone, 'Phone');
export const PieChart = solid(PChartPie, 'PieChart');
export const Plane = solid(PAirplaneTilt, 'Plane');
export const PlayCircle = solid(PPlayCircle, 'PlayCircle');
export const Plus = solid(PPlus, 'Plus');
export const Power = solid(PPower, 'Power');
export const Printer = solid(PPrinter, 'Printer');
export const RefreshCw = solid(PArrowsClockwise, 'RefreshCw');
export const RotateCcw = solid(PArrowCounterClockwise, 'RotateCcw');
export const Save = solid(PFloppyDisk, 'Save');
export const Scale = solid(PScales, 'Scale');
export const ScanFace = solid(PUserFocus, 'ScanFace');
export const Search = solid(PMagnifyingGlass, 'Search');
export const SearchX = solid(PMagnifyingGlassMinus, 'SearchX');
export const Send = solid(PPaperPlaneTilt, 'Send');
export const Server = solid(PHardDrives, 'Server');
export const Settings = solid(PGearSix, 'Settings');
export const Settings2 = solid(PSlidersHorizontal, 'Settings2');
export const Shield = solid(PShield, 'Shield');
export const ShieldAlert = solid(PShieldWarning, 'ShieldAlert');
export const ShieldCheck = solid(PShieldCheck, 'ShieldCheck');
export const Smartphone = solid(PDeviceMobile, 'Smartphone');
export const Star = solid(PStar, 'Star');
export const StarOff = solid(PStar, 'StarOff');
export const Sun = solid(PSun, 'Sun');
export const Table2 = solid(PTable, 'Table2');
export const Tablet = solid(PDeviceTablet, 'Tablet');
export const TabletSmartphone = solid(PDevices, 'TabletSmartphone');
export const Target = solid(PTarget, 'Target');
export const Timer = solid(PTimer, 'Timer');
export const Trash2 = solid(PTrash, 'Trash2');
export const TrendingDown = solid(PTrendDown, 'TrendingDown');
export const TrendingUp = solid(PTrendUp, 'TrendingUp');
export const Upload = solid(PUploadSimple, 'Upload');
export const User = solid(PUser, 'User');
export const UserCheck = solid(PUserCheck, 'UserCheck');
export const UserCircle = solid(PUserCircle, 'UserCircle');
export const UserMinus = solid(PUserMinus, 'UserMinus');
export const UserPlus = solid(PUserPlus, 'UserPlus');
export const UserX = solid(PUserMinus, 'UserX');
export const Users = solid(PUsersThree, 'Users');
export const Wifi = solid(PWifiHigh, 'Wifi');
export const WifiOff = solid(PWifiSlash, 'WifiOff');
// Attendance not reaching an external HRMS — same slash idiom as WifiOff.
export const CloudOff = solid(PCloudSlash, 'CloudOff');
export const Workflow = solid(PFlowArrow, 'Workflow');
export const X = solid(PX, 'X');
export const XCircle = solid(PXCircle, 'XCircle');
export const XSquare = solid(PXSquare, 'XSquare');
export const Zap = solid(PLightning, 'Zap');
