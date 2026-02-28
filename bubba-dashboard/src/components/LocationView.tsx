import { useState, useCallback, useEffect, useContext, useRef } from 'react';
import { Settings, MapPin, Power, ShieldCheck, AlertTriangle, RefreshCw, ChevronDown } from 'lucide-react';
import { fetchLocationStatus, toggleLocationStatus } from '../api/sheetApi';
import { AuthContext } from './AuthWrapper';
import { toast } from 'sonner';

const LocationView = () => {
    const { locationId, changeLocation } = useContext(AuthContext);

    // Local state for the toggle
    const [isOpen, setIsOpen] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [locationName, setLocationName] = useState('Unknown Location');
    const [error, setError] = useState<string | null>(null);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Initial Data Fetch
    useEffect(() => {
        const loadData = async () => {
            if (!locationId) {
                setError('No Location ID provided by Auth Gate');
                setIsLoading(false);
                return;
            }

            setIsLoading(true);

            try {
                const data = await fetchLocationStatus(locationId);
                if (data) {
                    setIsOpen(data.status === 'Open');
                    setLocationName(data.username);
                } else {
                    setError(`Location ID #${locationId} not found in database.`);
                }
            } catch (err) {
                setError('Connection to Bubba_DB failed.');
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };

        loadData();
    }, [locationId]);

    const handleToggle = useCallback(async () => {
        if (!locationId) return;

        const previousState = isOpen;
        const newState = !isOpen;

        // Optimistic UI Update
        setIsOpen(newState);
        setIsUpdating(true);
        setError(null);

        try {
            const targetStatusString = newState ? 'Open' : 'Closed';
            const success = await toggleLocationStatus(locationId, targetStatusString);

            if (!success) {
                throw new Error("API returned failure");
            }

            toast.success(`Location status updated to ${targetStatusString}`);
        } catch (err) {
            // Revert Optimistic UI if it fails
            setIsOpen(previousState);
            setError("Failed to sync status. Reverted to previous state.");
            toast.error("Failed to sync status");
            console.error(err);
        } finally {
            setIsUpdating(false);
        }
    }, [isOpen, locationId]);

    if (isLoading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center p-6 text-zinc-500">
                <RefreshCw className="w-8 h-8 mb-4 animate-spin opacity-50" />
                <p className="font-medium tracking-wide">Connecting to Bubba_DB...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col min-h-screen p-6 md:p-8 max-w-md mx-auto">

            {/* Header */}
            <header className="flex items-center justify-between mb-8 animate-fade-in relative z-50">
                <div className="flex items-center gap-3">
                    <div className="bg-zinc-900 p-3 rounded-xl border border-zinc-800 shadow-sm relative">
                        <MapPin className="w-5 h-5 text-zinc-400" />
                        <div className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-black ${isOpen ? 'bg-brand-green' : 'bg-brand-red'}`} />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold tracking-tight">{locationName}</h1>
                        <div className="flex items-center gap-2">
                            <p className="text-xs text-zinc-500 font-medium">Location #{locationId?.toString().padStart(2, '0')}</p>
                            <div className="relative" ref={dropdownRef}>
                                <button
                                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                    className="text-xs text-zinc-400 hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
                                    aria-label="Switch Location"
                                >
                                    Change <ChevronDown className="w-3 h-3" />
                                </button>

                                {isDropdownOpen && (
                                    <div className="absolute top-6 left-0 w-44 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl py-2 z-50 animate-fade-in origin-top-left">
                                        <div className="px-4 py-2 text-[10px] font-bold text-zinc-500 uppercase tracking-widest border-b border-zinc-800/50 mb-1">
                                            Switch Location
                                        </div>
                                        <div className="max-h-60 overflow-y-auto custom-scrollbar-minimal">
                                            {Array.from({ length: 16 }, (_, i) => i + 1).map(id => (
                                                <button
                                                    key={id}
                                                    onClick={() => {
                                                        setIsDropdownOpen(false);
                                                        changeLocation(id);
                                                    }}
                                                    className={`w-full text-left px-4 py-2 text-sm transition-colors cursor-pointer flex items-center gap-2 ${locationId === id
                                                            ? 'text-brand-green bg-brand-green/10 font-medium'
                                                            : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
                                                        }`}
                                                >
                                                    <div className={`w-1.5 h-1.5 rounded-full ${locationId === id ? 'bg-brand-green' : 'bg-transparent'}`} />
                                                    Loc #{id.toString().padStart(2, '0')}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
                <button className="text-zinc-500 hover:text-white transition-colors p-2 cursor-pointer">
                    <Settings className="w-5 h-5" />
                </button>
            </header>

            {/* Error Toast */}
            {error && (
                <div className="mb-8 bg-brand-red/10 border border-brand-red/30 p-4 rounded-xl flex items-start gap-3 text-brand-red animate-fade-in relative z-50">
                    <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                    <div>
                        <h3 className="font-semibold text-sm">Sync Error</h3>
                        <p className="text-xs opacity-90">{error}</p>
                        {error.includes("not found") && (
                            <p className="text-xs mt-2 underline cursor-pointer" onClick={() => {
                                localStorage.removeItem('scwlkr_bubba_current_loc');
                                window.location.href = '/bubba-dashboard/user';
                            }}>Return to login</p>
                        )}
                    </div>
                </div>
            )}

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col items-center justify-center -mt-8 relative z-10 w-full">
                <p className="text-sm font-bold uppercase tracking-widest text-zinc-500 mb-8 flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5" /> Current Status
                </p>

                {/* The Tactile Toggle Button - Made larger for better touch targeting */}
                <button
                    onClick={handleToggle}
                    disabled={isUpdating || !!error?.includes('not found')}
                    className={`
            relative group flex flex-col items-center justify-center w-72 h-72 sm:w-80 sm:h-80 rounded-full transition-all duration-500 ease-out cursor-pointer
            ${isOpen
                            ? 'bg-brand-green/20 border-brand-green/50 shadow-[0_0_100px_rgba(47,191,113,0.4)] ring-8 ring-brand-green/20'
                            : 'bg-zinc-900 border-zinc-700 shadow-[0_0_50px_rgba(0,0,0,0.6)] hover:bg-zinc-800'}
            border-4 overflow-hidden
            ${isUpdating || !!error?.includes('not found') ? 'opacity-70 scale-95 pointer-events-none' : 'hover:scale-105 active:scale-95'}
          `}
                >
                    {/* Inner Glow Effect for Open state */}
                    <div className={`absolute inset-0 rounded-full transition-opacity duration-500 ${isOpen ? 'opacity-100 animate-pulse' : 'opacity-0'} bg-gradient-to-b from-brand-green/30 to-transparent`} />

                    <Power
                        className={`w-20 h-20 mb-6 transition-all duration-500 z-10 
              ${isOpen ? 'text-brand-green drop-shadow-[0_0_20px_rgba(47,191,113,1)]' : 'text-zinc-500'}
              ${isUpdating ? 'animate-ping' : ''}
            `}
                    />

                    <span className={`text-4xl tracking-widest transition-all duration-500 z-10
            ${isOpen ? 'font-black text-brand-green drop-shadow-lg' : 'font-bold text-zinc-500'}
          `}>
                        {isOpen ? 'OPEN' : 'CLOSED'}
                    </span>
                </button>

                <p className={`mt-12 text-center text-sm font-medium transition-colors duration-300 ${isOpen ? 'text-brand-green/80' : 'text-zinc-500'}`}>
                    {isUpdating ? 'Syncing status...' : isOpen ? 'Location is currently OPEN.' : 'Location is currently CLOSED.'}
                </p>
            </main>
        </div>
    );
};

export default LocationView;
