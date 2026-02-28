import { useState, useMemo } from 'react';
import { Users, Search, Activity, User, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';

// Dummy Data
const initialUsers = [
    { id: 1, name: "User Alpha", status: "Open", role: "Field Agent", lastActive: "Just now" },
    { id: 2, name: "User Bravo", status: "Closed", role: "Field Agent", lastActive: "10m ago" },
    { id: 3, name: "User Charlie", status: "Open", role: "Supervisor", lastActive: "2m ago" },
    { id: 4, name: "User Delta", status: "Closed", role: "Field Agent", lastActive: "1h ago" },
    { id: 5, name: "User Echo", status: "Closed", role: "Analyst", lastActive: "3h ago" },
];

const AdminView = () => {
    const [users] = useState(initialUsers);
    const [searchQuery, setSearchQuery] = useState("");

    const filteredUsers = useMemo(() => {
        return users.filter(user => user.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }, [users, searchQuery]);

    const openCount = users.filter(u => u.status === 'Open').length;

    return (
        <div className="min-h-screen p-6 md:p-12 lg:p-16 max-w-7xl mx-auto flex flex-col font-sans">

            {/* Header section */}
            <header className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight mb-2 flex items-center gap-3">
                        <Activity className="w-8 h-8 text-brand-green" />
                        Bubba Dashboard
                    </h1>
                    <p className="text-zinc-400 font-medium">Administrator Operations Overview</p>
                </div>

                <div className="flex gap-4 items-center">
                    <div className="bg-zinc-900 border border-zinc-800 px-4 py-2 flex items-center gap-2 rounded-lg">
                        <span className="w-3 h-3 rounded-full bg-brand-green animate-pulse"></span>
                        <span className="text-sm font-semibold">{openCount} Users Active</span>
                    </div>

                    <Link to="/user" className="bg-white text-black px-4 py-2 rounded-lg font-semibold text-sm hover:bg-zinc-200 transition-colors flex items-center gap-2">
                        View Agent App <ExternalLink className="w-4 h-4" />
                    </Link>
                </div>
            </header>

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
                                        <h3 className="font-semibold text-lg leading-tight">{user.name}</h3>
                                        <p className="text-xs text-zinc-500 font-medium">{user.role}</p>
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
                                    Active {user.lastActive}
                                </span>
                            </div>

                            {/* Decorative side accent for Open status */}
                            {user.status === 'Open' && (
                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand-green shadow-[0_0_10px_rgba(47,191,113,0.8)]" />
                            )}
                        </div>
                    ))}

                    {filteredUsers.length === 0 && (
                        <div className="col-span-full py-12 flex flex-col items-center justify-center text-zinc-500 border border-dashed border-zinc-800 rounded-xl">
                            <Search className="w-8 h-8 mb-3 opacity-50" />
                            <p>No users found matching "{searchQuery}"</p>
                        </div>
                    )}
                </div>

                {/* Placeholder for Phase 2 API Loaders */}
                {/* <div className="mt-8 text-center text-xs text-zinc-600">
             [Phase 2] Real-time data sync active.
        </div> */}
            </main>
        </div>
    );
};

export default AdminView;
