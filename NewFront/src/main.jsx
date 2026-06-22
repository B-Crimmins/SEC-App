import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './index.css';
import NavigationBar from '../Utilities/Navigation/NavigationBar.jsx';
import HomePage from '../Pages/Home/HomePage.jsx';
import LoginPage from '../Pages/Login/LoginPage.jsx';
import AppHome from '../Pages/AppHome/AppHome.jsx';
import StripePage from '../Pages/Stripe/StripePage.jsx';
import { TooltipProvider } from './components/ui/tooltip';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <div className="dark">
      <TooltipProvider delayDuration={200}>
        <BrowserRouter>
          <NavigationBar />
          <Routes>
            <Route path="/">
              <Route index element={<HomePage />} />
              <Route path="login" element={<LoginPage />} />
              <Route path="AppHome" element={<AppHome />} />
              <Route path="Stripe" element={<StripePage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </div>
  </StrictMode>,
);
