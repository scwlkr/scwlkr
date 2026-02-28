import { useState, useMemo, useEffect, useCallback } from 'react';
import { Users, Search, Activity, User, ExternalLink, RefreshCw, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { fetchAllUsers } from '../api/sheetApi';
import type { UserRow } from '../api/sheetApi';

const AdminView = () => {
    const [users, setUsers] = useState<UserRow[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadData = useCallback(async (isRefresh = false) => {
        if (isRefresh) setIsRefreshing(true);
        else setIsLoading(true);
        setError(null);

        try {
            const data = await fetchAllUsers();
            setUsers(data);
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

    const filteredUsers = useMemo(() => {
        return users.filter(user => user.username.toLowerCase().includes(searchQuery.toLowerCase()));
    }, [users, searchQuery]);

    const openCount = users.filter(u => u.status === 'Open').length;

    return (
        <div className="min-h-screen p-6 md:p-12 lg:p-16 max-w-7xl mx-auto flex flex-col font-sans">

            {/* Header section */}
            <header className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight mb-2 flex items-center gap-3">
                        <Activity className="w-8 h-8 text-brand-green" />
                        Bubba Dashboard
                    </h1>
                    <p className="text-zinc-400 font-medium">Administrator Operations Overview</p>
                </div>

                <div className="flex flex-wrap gap-4 items-center">
                    <div className="bg-zinc-900 border border-zinc-800 px-4 py-2 flex items-center gap-2 rounded-lg">
                        <span className={`w-3 h-3 rounded-full ${isLoading ? 'bg-zinc-500' : 'bg-brand-green animate-pulse'}`}></span>
                        <span className="text-sm font-semibold">{openCount} Users Active</span>
                    </div>

                    <button
                        onClick={() => loadData(true)}
                        disabled={isRefreshing || isLoading}
                        className="bg-zinc-900 text-white border border-zinc-800 px-4 py-2 rounded-lg font-semibold text-sm hover:bg-zinc-800 transition-colors flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                    >
                        <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>

                    <Link to="/user" className="bg-white text-black px-4 py-2 rounded-lg font-semibold text-sm hover:bg-zinc-200 transition-colors flex items-center gap-2">
                        View Agent App <ExternalLink className="w-4 h-4" />
                    </Link>
                </div>
            </header>

            {/* Error Banner */}
            {error && (
                <div className="mb-8 bg-brand-red/10 border border-brand-red/30 p-4 rounded-xl flex items-start gap-3 text-brand-red">
                    <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                    <div>
                        <h3 className="font-semibold text-sm">Offline Warning</h3>
                        <p className="text-xs opacity-90">{error}</p>
                    </div>
                </div>
            )}

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col gap-6">

                {/* Controls */}
                <div className="flex items-center justify-between bg-zinc-900/50 p-2 rounded-xl border border-zinc-800 backdrop-blur-sm">
                    <div className="relative w-full max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                        <input
                            type="text"
                            placeholder="Search agents..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-transparent border-none py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-0 text-white placeholder:text-zinc-600"
                        />
                    </div>

                    <div className="hidden sm:flex items-center gap-2 pr-4 text-xs font-medium text-zinc-500 uppercase tracking-widest">
                        <Users className="w-4 h-4" />
                        Roster: {filteredUsers.length}
                    </div>
                </div>

                {/* User Data Grid */}
                {isLoading && !isRefreshing ? (
                    <div className="py-20 flex flex-col items-center justify-center text-zinc-500">
                        <RefreshCw className="w-8 h-8 mb-4 animate-spin opacity-50" />
                        <p className="font-medium tracking-wide">Syncing with Bubba_DB...</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredUsers.map(user => (
                            <div
                                key={user.id}
                                className="group bg-zinc-900/40 border border-zinc-800 hover:border-zinc-700 rounded-xl p-5 transition-all duration-300 hover:shadow-lg flex flex-col gap-4 relative overflow-hidden"
                            >
                                {/* Top Row: Name and Status Badge */}
                                <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-lg ${user.status === 'Open' ? 'bg-brand-green/10 text-brand-green' : 'bg-zinc-800 text-zinc-500'}`}>
                                            <User className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-lg leading-tight">{user.username}</h3>
                                            <p className="text-xs text-zinc-500 font-medium">Remote Agent</p>
                                        </div>
                                    </div>

                                    {/* Status Badge */}
                                    <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide border ${user.status === 'Open'
                                        ? 'border-brand-green text-brand-green bg-brand-green/10 shadow-[0_0_15px_rgba(47,191,113,0.15)]'
                                        : 'border-zinc-700 text-zinc-500 bg-zinc-900/50'
                                        }`}>
                                        {user.status}
                                    </div>
                                </div>

                                {/* Bottom Row: Metadata */}
                                <div className="flex justify-between items-center mt-2 border-t border-zinc-800/50 pt-4">
                                    <span className="text-xs text-zinc-600 font-medium">ID: #{user.id.toString().padStart(4, '0')}</span>
                                    <span className="text-xs text-zinc-500 flex items-center gap-1">
                                        Updated: {new Date(user.last_updated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>

                                {/* Decorative side accent for Open status */}
                                {user.status === 'Open' && (
                                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand-green shadow-[0_0_10px_rgba(47,191,113,0.8)]" />
                                )}
                            </div>
                        ))}

                        {filteredUsers.length === 0 && !error && (
                            <div className="col-span-full py-12 flex flex-col items-center justify-center text-zinc-500 border border-dashed border-zinc-800 rounded-xl">
                                <Search className="w-8 h-8 mb-3 opacity-50" />
                                <p>No users found matching "{searchQuery}"</p>
                            </div>
                        )}
                    </div>
                )}

            </main>
        </div>
    );
};

export default AdminView;
