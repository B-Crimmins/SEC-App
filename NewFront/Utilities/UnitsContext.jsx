import { createContext, useContext } from 'react';

export const UnitsContext = createContext('auto');
export const useUnits = () => useContext(UnitsContext);
