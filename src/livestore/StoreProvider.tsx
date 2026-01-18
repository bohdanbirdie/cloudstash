import { StoreRegistry } from '@livestore/livestore'
import { StoreRegistryProvider } from '@livestore/react'
import { useState, type ReactNode } from 'react'

interface StoreProviderProps {
  children: ReactNode
}

export const StoreProvider = ({ children }: StoreProviderProps) => {
  const [storeRegistry] = useState(() => new StoreRegistry())

  return (
    <StoreRegistryProvider storeRegistry={storeRegistry}>
      {children}
    </StoreRegistryProvider>
  )
}
