import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@mantine/core/styles.css';
import { MantineProvider } from '@mantine/core';
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import NavigationBar from '../Utilities/Navigation/NavigationBar.jsx'
import './index.css'
import App from './App.jsx'
import HomePage from '../Pages/Home/HomePage.jsx';
import LoginPage from '../Pages/Login/LoginPage.jsx';
import AppHome from '../Pages/AppHome/AppHome.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MantineProvider defaultColorScheme='dark'>
      <BrowserRouter>
        <NavigationBar/>
        <Routes>
          <Route path='/'>
            <Route index element={<HomePage />} />
            <Route path='login' element={<LoginPage />} />
            <Route path='AppHome' element={<AppHome />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </MantineProvider>
  </StrictMode>,
)
