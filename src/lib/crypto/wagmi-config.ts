import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { mainnet, polygon, bsc, base } from 'wagmi/chains'

export const wagmiConfig = getDefaultConfig({
  appName: process.env.NEXT_PUBLIC_APP_NAME || 'Lfour37',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'default_project_id',
  chains: [mainnet, polygon, bsc, base],
  ssr: true,
})
