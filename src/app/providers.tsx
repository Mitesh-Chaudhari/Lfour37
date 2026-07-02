'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit'
import { wagmiConfig } from '@/lib/crypto/wagmi-config'
import { useState } from 'react'

import '@rainbow-me/rainbowkit/styles.css'
import { Suspense } from 'react'
import { NavigationLoader } from '@/components/layout/navigation-loader'

function NavigationLoaderFallback() {
  return null
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 60 * 1000, retry: 1 },
        },
      })
  )

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: '#d946ef',
            accentColorForeground: 'white',
            borderRadius: 'large',
          })}
        >
          <Suspense fallback={<NavigationLoaderFallback />}>
            <NavigationLoader />
          </Suspense>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
