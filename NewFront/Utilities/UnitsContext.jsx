import { createContext, useContext } from 'react';

export const UnitsContext = createContext('M');
export const useUnits = () => useContext(UnitsContext);
