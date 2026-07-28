import React, { createContext, useContext, useRef } from 'react';

interface CacheContextType {
  audioCacheRef: React.MutableRefObject<Map<string, string>>;
}

const CacheContext = createContext<CacheContextType | null>(null);

export const CacheProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const audioCacheRef = useRef<Map<string, string>>(new Map());

  return (
    <CacheContext.Provider value={{ audioCacheRef }}>
      {children}
    </CacheContext.Provider>
  );
};

export const useCache = () => {
  const context = useContext(CacheContext);
  if (!context) {
    throw new Error('useCache must be used within a CacheProvider');
  }
  return context;
};
