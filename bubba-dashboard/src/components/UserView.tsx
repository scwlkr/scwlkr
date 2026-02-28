import { useState, useCallback, useEffect, useContext } from 'react';
import { Settings, User, Power, ShieldCheck, AlertTriangle, RefreshCw } from 'lucide-react';
import { fetchUserStatus, toggleUserStatus } from '../api/sheetApi';
import { AuthContext } from './AuthWrapper';

const UserView = () => {
    const { userId } = useContext(AuthContext);

    // Local state for the toggle
    const [isOpen, setIsOpen] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [userName, setUserName] = useState('Unknown Agent');
    const [error, setError] = useState<string | null>(null);

    // Initial Data Fetch
    useEffect(() => {
        const loadData = async () => {
            if (!userId) {
                setError('No User ID provided by Auth Gate');
                setIsLoading(false);
                return;
            }

            try {
                const userData = await fetchUserStatus(userId);
                if (userData) {
                    setIsOpen(userData.status === 'Open');
                    setUserName(userData.username);
                } else {
                    setError(`Agent ID #${userId} not found in database.`);
                }
            } catch (err) {
                setError('Connection to Bubba_DB failed.');
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };

        loadData();
    }, [userId]);

    const handleToggle = useCallback(async () => {
        if (!userId) return;

        const previousState = isOpen;
        const newState = !isOpen;

        // Optimistic UI Update
        setIsOpen(newState);
        setIsUpdating(true);
        setError(null);

        try {
            const targetStatusString = newState ? 'Open' : 'Closed';
            const success = await toggleUserStatus(userId, targetStatusString);

            if (!success) {
                throw new Error("API returned failure");
            }
        } catch (err) {
            // Revert Optimistic UI if it fails
            setIsOpen(previousState);
            setError("Failed to sync status. Reverted to previous state.");
            console.error(err);
        } finally {
            setIsUpdating(false);
        }
    }, [isOpen, userId]);

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
            <header className="flex items-center justify-between mb-8 animate-fade-in">
                <div className="flex items-center gap-3">
                    <div className="bg-zinc-900 p-2 rounded-xl border border-zinc-800 shadow-sm relative">
                        <User className="w-5 h-5 text-zinc-400" />
                        <div className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-black ${isOpen ? 'bg-brand-green' : 'bg-brand-red'}`} />
                    </div>
                    <div>
                        <h1 className="text-lg font-semibold tracking-tight">{userName}</h1>
                        <p className="text-xs text-zinc-500 font-medium">Agent #{userId?.toString().padStart(4, '0')}</p>
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
                            <p className="text-xs mt-2 underline cursor-pointer" onClick={() => window.location.reload()}>Return to login</p>
                        )}
                    </div>
                </div>
            )}

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col items-center justify-center -mt-8 relative z-10">
                <p className="text-sm font-medium uppercase tracking-widest text-zinc-500 mb-6 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4" /> Current Status
                </p>

                {/* The Tactile Toggle Button */}
                <button
                    onClick={handleToggle}
                    disabled={isUpdating || !!error?.includes('not found')}
                    className={`
            relative group flex flex-col items-center justify-center w-64 h-64 rounded-full transition-all duration-500 ease-out cursor-pointer
            ${isOpen
                            ? 'bg-brand-green/10 border-brand-green/30 shadow-[0_0_80px_rgba(47,191,113,0.3)] ring-4 ring-brand-green/20'
                            : 'bg-zinc-900 border-zinc-800 shadow-[0_0_40px_rgba(0,0,0,0.5)] hover:bg-zinc-800'}
            border-2 overflow-hidden
            ${isUpdating || !!error?.includes('not found') ? 'opacity-70 scale-95 pointer-events-none' : 'hover:scale-105 active:scale-95'}
          `}
                >
                    {/* Inner Glow Effect for Open state */}
                    <div className={`absolute inset-0 rounded-full transition-opacity duration-500 ${isOpen ? 'opacity-100' : 'opacity-0'} bg-gradient-to-b from-brand-green/20 to-transparent`} />

                    <Power
                        className={`w-16 h-16 mb-4 transition-all duration-500 z-10 
              ${isOpen ? 'text-brand-green drop-shadow-[0_0_15px_rgba(47,191,113,0.8)]' : 'text-zinc-500'}
              ${isUpdating ? 'animate-pulse' : ''}
            `}
                    />

                    <span className={`text-3xl tracking-widest transition-all duration-500 z-10
            ${isOpen ? 'font-black text-brand-green drop-shadow-md' : 'font-bold text-zinc-600'}
          `}>
                        {isOpen ? 'OPEN' : 'CLOSED'}
                    </span>
                </button>

                <p className={`mt-10 text-center text-sm transition-colors duration-300 ${isOpen ? 'text-brand-green/70' : 'text-zinc-600'}`}>
                    {isUpdating ? 'Syncing status...' : isOpen ? 'You are currently active and receiving tasks.' : 'You are offline. Press to go active.'}
                </p>
            </main>
        </div>
    );
};

export default UserView;
