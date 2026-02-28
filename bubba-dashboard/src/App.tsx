import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import AdminView from './components/AdminView';
import LocationView from './components/LocationView';
import AuthWrapper from './components/AuthWrapper';

function App() {
  return (
    <Router basename="/bubba-dashboard">
      <div className="min-h-screen bg-black text-white selection:bg-brand-green selection:text-black font-sans">
        <Toaster theme="dark" position="top-center" />
        <AuthWrapper>
          <Routes>
            <Route path="/" element={<AdminView />} />
            <Route path="/user" element={<LocationView />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthWrapper>
      </div>
    </Router>
  );
}

export default App;
