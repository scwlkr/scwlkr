import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import AdminView from './components/AdminView';
import UserView from './components/UserView';

function App() {
  return (
    <Router basename="/bubba-dashboard">
      <div className="min-h-screen bg-black text-white selection:bg-brand-green selection:text-black font-sans">
        <Routes>
          <Route path="/" element={<AdminView />} />
          <Route path="/user" element={<UserView />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
