import React, { useState, useEffect } from 'react';
import { Lock, User as UserIcon } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

interface AuthWrapperProps {
    children: React.ReactNode;
}

// Simple context to pass the user ID down to the UserView
export const AuthContext = React.createContext<{ userId: number | null }>({ userId: null });

const AuthWrapper: React.FC<AuthWrapperProps> = ({ children }) => {
    const location = useLocation();
    const navigate = useNavigate();

    const isAdminRoute = location.pathname === '/';
    const isUserRoute = location.pathname === '/user';

    // State
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
    const [userIdInput, setUserIdInput] = useState('');
    const [adminPinInput, setAdminPinInput] = useState('');
    const [error, setError] = useState('');
    const [loggedInUserId, setLoggedInUserId] = useState<number | null>(null);

    // Hardcoded simple PIN for this phase's prototype. In production, this would be a proper hashing/auth layer.
    const ADMIN_PIN = "1234";

    // If path changes and we aren't authenticated for that path, reset error
    useEffect(() => {
        setError('');
    }, [location.pathname]);

    const handleAdminAuth = (e: React.FormEvent) => {
        e.preventDefault();
        if (adminPinInput === ADMIN_PIN) {
            setIsAdminAuthenticated(true);
            setError('');
        } else {
            setError('Invalid Admin PIN');
        }
    };

    const handleUserAuth = (e: React.FormEvent) => {
        e.preventDefault();
        const id = parseInt(userIdInput, 10);
        // For Phase 1/2 dummy rows, IDs are 1-5. We'll allow 1-100 for safety.
        if (!isNaN(id) && id > 0 && id <= 100) {
            setLoggedInUserId(id);
            setIsAuthenticated(true);
            setError('');
        } else {
            setError('Please enter a valid User ID (e.g., 1, 2, 3)');
        }
    };

    // Render Admin Gate
    if (isAdminRoute && !isAdminAuthenticated) {
        return (
            <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 font-sans">
                <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-2xl w-full max-w-sm flex flex-col items-center animate-fade-in shadow-2xl">
                    <div className="bg-brand-green/20 p-3 rounded-full mb-6 relative">
                        <Lock className="w-8 h-8 text-brand-green" />
                        <div className="absolute inset-0 bg-brand-green/20 blur-xl rounded-full" />
                    </div>
                    <h2 className="text-xl font-bold mb-2 tracking-tight">Admin Access</h2>
                    <p className="text-zinc-500 text-sm mb-6 text-center">Enter PIN to access the dashboard overview.</p>

                    <form onSubmit={handleAdminAuth} className="w-full flex flex-col gap-4">
                        <div>
                            <input
                                type="password"
                                placeholder="Admin PIN"
                                value={adminPinInput}
                                onChange={(e) => setAdminPinInput(e.target.value)}
                                className="w-full bg-black border border-zinc-700 rounded-lg px-4 py-3 text-center tracking-widest text-lg focus:outline-none focus:border-brand-green transition-colors"
                                autoFocus
                            />
                        </div>
                        {error && <p className="text-brand-red text-xs font-medium text-center">{error}</p>}
                        <button
                            type="submit"
                            className="w-full bg-white text-black font-bold py-3 rounded-lg hover:bg-zinc-200 transition-colors"
                        >
                            Unlock Dashboard
                        </button>
                    </form>

                    <button
                        onClick={() => navigate('/user')}
                        className="mt-6 text-sm text-zinc-500 hover:text-white transition-colors"
                    >
                        Switch to Agent View
                    </button>
                </div>
            </div>
        );
    }

    // Render User Gate
    if (isUserRoute && !isAuthenticated) {
        return (
            <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 font-sans">
                <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-2xl w-full max-w-sm flex flex-col items-center animate-fade-in shadow-2xl">
                    <div className="bg-zinc-800 p-3 rounded-xl mb-6 shadow-inner">
                        <UserIcon className="w-8 h-8 text-zinc-300" />
                    </div>
                    <h2 className="text-xl font-bold mb-2 tracking-tight">Agent Login</h2>
                    <p className="text-zinc-500 text-sm mb-6 text-center">Enter your assigned numeric Agent ID.</p>

                    <form onSubmit={handleUserAuth} className="w-full flex flex-col gap-4">
                        <div>
                            <input
                                type="number"
                                placeholder="Agent ID (e.g. 1)"
                                value={userIdInput}
                                onChange={(e) => setUserIdInput(e.target.value)}
                                className="w-full bg-black border border-zinc-700 rounded-lg px-4 py-3 text-center text-lg focus:outline-none focus:border-brand-green transition-colors appearance-none"
                                autoFocus
                                min="1"
                            />
                        </div>
                        {error && <p className="text-brand-red text-xs font-medium text-center">{error}</p>}
                        <button
                            type="submit"
                            className="w-full bg-brand-green text-black font-bold py-3 rounded-lg hover:bg-brand-green/90 transition-colors"
                        >
                            Connect
                        </button>
                    </form>

                    <button
                        onClick={() => navigate('/')}
                        className="mt-6 text-sm text-zinc-500 hover:text-white transition-colors"
                    >
                        Switch to Admin View
                    </button>
                </div>
            </div>
        );
    }

    // Render children normally
    return (
        <AuthContext.Provider value={{ userId: loggedInUserId }}>
            {children}
        </AuthContext.Provider>
    );
};

export default AuthWrapper;
