import { useState, useMemo, useEffect, useCallback } from 'react';
import { Search, Activity, MapPin, ExternalLink, RefreshCw, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { fetchAllLocations } from '../api/sheetApi';
import type { LocationRow } from '../api/sheetApi';

const AdminView = () => {
    const [locations, setLocations] = useState<LocationRow[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadData = useCallback(async (isRefresh = false) => {
        if (isRefresh) setIsRefreshing(true);
        else setIsLoading(true);
        setError(null);

        try {
            const data = await fetchAllLocations();
            setLocations(data);
        } catch (err) {
            setError('Connection to Bubba_DB failed. Data may be stale.');
            console.error(err);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, []);

    // Initial load & Polling (every 60s)
    useEffect(() => {
        loadData();
        const interval = setInterval(() => {
            loadData(true);
        }, 60000);

        return () => clearInterval(interval);
    }, [loadData]);

    const filteredLocations = useMemo(() => {
        return locations.filter(loc => loc.username.toLowerCase().includes(searchQuery.toLowerCase()));
    }, [locations, searchQuery]);

    const openCount = locations.filter(l => l.status === 'Open').length;

    return (
        <div className="min-h-screen p-6 md:p-12 lg:p-16 max-w-[1600px] mx-auto flex flex-col font-sans bg-black text-white">

            {/* Header section */}
            <header className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-6">
                <div>
                    <h1 className="text-4xl font-black tracking-tight mb-2 flex items-center gap-4">
                        <Activity className="w-10 h-10 text-white" />
                        Bubba Dashboard
                    </h1>
                    <p className="text-zinc-400 font-medium text-lg">Location Status Operations</p>
                </div>

                <div className="flex flex-wrap gap-4 items-center">
                    <div className="bg-zinc-900 border border-zinc-800 px-5 py-3 flex items-center gap-3 rounded-lg">
                        <span className={`w-3 h-3 rounded-full ${isLoading ? 'bg-zinc-500' : 'bg-brand-green animate-pulse shadow-[0_0_10px_rgba(47,191,113,0.8)]'}`}></span>
                        <span className="text-sm font-bold tracking-wide">{openCount} / {locations.length} Locations OPEN</span>
                    </div>

                    <button
                        onClick={() => loadData(true)}
                        disabled={isRefreshing || isLoading}
                        className="bg-zinc-900 border border-zinc-700 px-5 py-3 rounded-lg font-bold text-sm hover:bg-zinc-800 transition-colors flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                    >
                        <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>

                    <Link to="/user" className="bg-white text-black px-5 py-3 rounded-lg font-bold text-sm hover:bg-zinc-200 transition-colors flex items-center gap-2 shadow-lg">
                        Location App <ExternalLink className="w-4 h-4" />
                    </Link>
                </div>
            </header>

            {/* Error Banner */}
            {error && (
                <div className="mb-8 bg-brand-red/10 border border-brand-red/30 p-4 rounded-xl flex items-start gap-3 text-brand-red">
                    <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                    <div>
                        <h3 className="font-bold text-sm tracking-wide">Offline Warning</h3>
                        <p className="text-xs font-medium opacity-90 mt-1">{error}</p>
                    </div>
                </div>
            )}

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col gap-8">

                {/* Controls */}
                <div className="flex items-center justify-between bg-zinc-900/80 p-3 rounded-xl border border-zinc-800 backdrop-blur-md">
                    <div className="relative w-full max-w-md">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                        <input
                            type="text"
                            placeholder="Search locations..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-black/50 border border-zinc-700 rounded-lg py-3 pl-12 pr-4 text-sm focus:outline-none focus:border-zinc-500 text-white placeholder:text-zinc-500 transition-colors"
                        />
                    </div>

                    <div className="hidden sm:flex items-center gap-2 pr-4 text-sm font-bold text-zinc-400 uppercase tracking-widest">
                        <MapPin className="w-5 h-5" />
                        Total: {filteredLocations.length}
                    </div>
                </div>

                {/* Location Data Grid - 4x4 responsive layout */}
                {isLoading && !isRefreshing ? (
                    <div className="py-32 flex flex-col items-center justify-center text-zinc-500">
                        <RefreshCw className="w-10 h-10 mb-6 animate-spin opacity-50" />
                        <p className="font-bold tracking-widest uppercase">Syncing with Base...</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        {filteredLocations.map(loc => (
                            <div
                                key={loc.id}
                                className={`group bg-zinc-950 border ${loc.status === 'Open' ? 'border-brand-green/30 hover:border-brand-green/60 shadow-[0_0_15px_rgba(47,191,113,0.05)]' : 'border-zinc-800 hover:border-zinc-600'} rounded-2xl p-6 transition-all duration-300 flex flex-col gap-5 relative overflow-hidden`}
                            >
                                {/* Top Row: Name and Status Badge */}
                                <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-4">
                                        <div className={`p-3 rounded-xl ${loc.status === 'Open' ? 'bg-brand-green/20 text-brand-green' : 'bg-zinc-900 text-zinc-500'}`}>
                                            <MapPin className={`w-6 h-6 ${loc.status === 'Open' ? 'animate-pulse' : ''}`} />
                                        </div>
                                        <div>
                                            <h3 className="font-black text-xl tracking-tight text-white">{loc.username}</h3>
                                            <p className="text-sm text-zinc-500 font-semibold mt-0.5">Location #{loc.id.toString().padStart(2, '0')}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Status Badge */}
                                <div className="flex items-center">
                                    <div className={`w-full text-center py-2.5 rounded-lg text-sm font-black uppercase tracking-widest border ${loc.status === 'Open'
                                        ? 'border-brand-green text-black bg-brand-green shadow-[0_0_20px_rgba(47,191,113,0.3)]'
                                        : 'border-zinc-800 text-zinc-400 bg-zinc-900'
                                        }`}>
                                        {loc.status}
                                    </div>
                                </div>

                                {/* Bottom Row: Metadata */}
                                <div className="flex justify-between items-center border-t border-zinc-800/80 pt-4 mt-1">
                                    <span className="text-xs text-zinc-600 font-bold uppercase tracking-wider">Sync Status</span>
                                    <span className="text-xs font-bold px-2 py-1 bg-zinc-900 rounded text-zinc-400 flex items-center gap-1">
                                        {new Date(loc.last_updated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>

                                {/* Decorative side accent for Open status */}
                                {loc.status === 'Open' && (
                                    <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-brand-green shadow-[0_0_15px_rgba(47,191,113,1)]" />
                                )}
                            </div>
                        ))}

                        {filteredLocations.length === 0 && !error && (
                            <div className="col-span-full py-20 flex flex-col items-center justify-center text-zinc-600 border-2 border-dashed border-zinc-800 rounded-2xl">
                                <Search className="w-10 h-10 mb-4 opacity-30" />
                                <p className="font-bold tracking-wide">No locations found matching "{searchQuery}"</p>
                            </div>
                        )}
                    </div>
                )}

            </main>
        </div>
    );
};

export default AdminView;
