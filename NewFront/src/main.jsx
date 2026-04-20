import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@mantine/core/styles.css';
import { createTheme, MantineProvider } from '@mantine/core';
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import NavigationBar from '../Utilities/Navigation/NavigationBar.jsx'
import './index.css'
import App from './App.jsx'
import HomePage from '../Pages/Home/HomePage.jsx';
import LoginPage from '../Pages/Login/LoginPage.jsx';
import AppHome from '../Pages/AppHome/AppHome.jsx';
import StripePage from '../Pages/Stripe/StripePage.jsx';

const theme = createTheme({
  fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif",
  fontFamilyMonospace: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  headings: {
    fontFamily: "Inter, system-ui, sans-serif",
    fontWeight: '600',
    sizes: {
      h1: { fontSize: '2.75rem', lineHeight: '1.15' },
      h2: { fontSize: '2rem', lineHeight: '1.2' },
      h3: { fontSize: '1.5rem', lineHeight: '1.25' },
      h4: { fontSize: '1.125rem', lineHeight: '1.35' },
    },
  },
  primaryColor: 'intrinsiq',
  primaryShade: { light: 6, dark: 5 },
  defaultRadius: 'md',
  colors: {
    // Muted blue primary — calmer than Mantine's default blue.
    intrinsiq: [
      '#eaf1ff', '#cddcf8', '#a4beef', '#7ba0e6', '#5887dc',
      '#3c74d5', '#2f6ac9', '#245aaf', '#1a4d95', '#0f3e7e',
    ],
    // Near-black navy for chrome/backgrounds.
    ink: [
      '#e9ecf3', '#c5ccda', '#9ea7bb', '#77819e', '#555e7a',
      '#3a4260', '#262d47', '#1b2136', '#121726', '#0b0f1a',
    ],
    // Semantic positive (calm green).
    gain: [
      '#e5f7ee', '#c6ecd6', '#9cdcba', '#6fcc9c', '#48bd82',
      '#2fae6e', '#22975d', '#1a7c4c', '#13613b', '#0d4a2c',
    ],
    // Semantic negative (calm red).
    loss: [
      '#fdeaea', '#fac9c9', '#f4a2a2', '#ee7a7a', '#e75858',
      '#d94242', '#c63333', '#a72929', '#862020', '#661818',
    ],
  },
  other: {
    bgPage: '#0b0f1a',
    bgCard: '#111724',
    bgCardHover: '#161d2d',
    borderSubtle: 'rgba(255, 255, 255, 0.06)',
    textPrimary: '#e7ecf5',
    textMuted: '#8a94ab',
    accent: '#5c94ff',
  },
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme='dark'>
      <BrowserRouter>
        <NavigationBar/>
        <Routes>
          <Route path='/'>
            <Route index element={<HomePage />} />
            <Route path='login' element={<LoginPage />} />
            <Route path='AppHome' element={<AppHome />} />
            <Route path='Stripe' element={<StripePage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </MantineProvider>
  </StrictMode>,
)
