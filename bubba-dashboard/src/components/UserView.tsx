import { useState, useCallback } from 'react';
import { Settings, User, Power, ShieldCheck } from 'lucide-react';

const UserView = () => {
    // Local state for the toggle
    const [isOpen, setIsOpen] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);

    const handleToggle = useCallback(async () => {
        setIsUpdating(true);

        // TODO: [Phase 2] Replace this timeout with actual Fetch API call
        // Example: await fetch('/api/user/status', { method: 'POST', body: JSON.stringify({ status: !isOpen ? 'Open' : 'Closed' }) });

        setTimeout(() => {
            setIsOpen((prev) => !prev);
            setIsUpdating(false);
        }, 400); // simulated network delay
    }, [isOpen]);

    return (
        <div className="flex flex-col min-h-screen p-6 md:p-8 max-w-md mx-auto">
            {/* Header */}
            <header className="flex items-center justify-between mb-12 animate-fade-in">
                <div className="flex items-center gap-3">
                    <div className="bg-zinc-900 p-2 rounded-xl border border-zinc-800 shadow-sm">
                        <User className="w-5 h-5 text-zinc-400" />
                    </div>
                    <div>
                        <h1 className="text-lg font-semibold tracking-tight">John Doe</h1>
                        <p className="text-xs text-zinc-500 font-medium">Field Agent</p>
                    </div>
                </div>
                <button className="text-zinc-500 hover:text-white transition-colors p-2 cursor-pointer">
                    <Settings className="w-5 h-5" />
                </button>
            </header>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col items-center justify-center -mt-16">
                <p className="text-sm font-medium uppercase tracking-widest text-zinc-500 mb-6 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4" /> Current Status
                </p>

                {/* The Tactile Toggle Button */}
                <button
                    onClick={handleToggle}
                    disabled={isUpdating}
                    className={`
            relative group flex flex-col items-center justify-center w-64 h-64 rounded-full transition-all duration-500 ease-out cursor-pointer
            ${isOpen
                            ? 'bg-brand-green/10 border-brand-green/30 shadow-[0_0_80px_rgba(47,191,113,0.3)] ring-4 ring-brand-green/20'
                            : 'bg-zinc-900 border-zinc-800 shadow-[0_0_40px_rgba(0,0,0,0.5)] hover:bg-zinc-800'}
            border-2 overflow-hidden
            ${isUpdating ? 'opacity-70 scale-95 pointer-events-none' : 'hover:scale-105 active:scale-95'}
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
                    {isOpen ? 'You are currently active and receiving tasks.' : 'You are offline. Press to go active.'}
                </p>
            </main>
        </div>
    );
};

export default UserView;
