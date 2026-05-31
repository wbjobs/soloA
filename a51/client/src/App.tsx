import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Home, Room, Sessions, Playback } from './pages';

const App: React.FC = () => {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/room/:roomId" element={<Room />} />
        <Route path="/sessions" element={<Sessions />} />
        <Route path="/playback/:roomId" element={<Playback />} />
      </Routes>
    </Router>
  );
};

export default App;
