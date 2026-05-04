import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import InviterPage from './features/inviter/InviterPage.jsx';
import InviteePage from './features/invitee/InviteePage.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* /inviter — frame creator (beta prototype entry point) */}
        <Route path="/inviter" element={<InviterPage />} />
        {/* /invitee — invitee camera view */}
        <Route path="/invitee" element={<InviteePage />} />
        {/* Legacy root → redirect to /inviter for local dev convenience */}
        <Route path="/" element={<InviterPage />} />
      </Routes>
    </BrowserRouter>
  );
}
