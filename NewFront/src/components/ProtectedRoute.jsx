import { Navigate, useLocation } from 'react-router-dom';

/** Redirect unauthenticated users to login before rendering app routes. */
const ProtectedRoute = ({ children }) => {
  const location = useLocation();
  const token = sessionStorage.getItem('token');

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
};

export default ProtectedRoute;
