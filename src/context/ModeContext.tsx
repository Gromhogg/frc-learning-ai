import { createContext, useContext, useState, type ReactNode } from "react";

interface ModeContextType {
  isAdmin: boolean;
  setIsAdmin: (v: boolean) => void;
}

const ModeContext = createContext<ModeContextType>({
  isAdmin: false,
  setIsAdmin: () => {},
});

export function useModeContext() {
  return useContext(ModeContext);
}

export function ModeProvider({ children }: { children: ReactNode }) {
  const [isAdmin, setIsAdmin] = useState(false);
  return (
    <ModeContext.Provider value={{ isAdmin, setIsAdmin }}>
      {children}
    </ModeContext.Provider>
  );
}
