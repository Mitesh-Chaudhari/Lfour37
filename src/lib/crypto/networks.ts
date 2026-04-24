import { mainnet, polygon, bsc, base } from 'wagmi/chains'
import { CryptoNetwork } from '@/types'

export const SUPPORTED_CHAINS = [mainnet, polygon, bsc, base] as const

export const CHAIN_ID_TO_NETWORK: Record<number, CryptoNetwork> = {
  1: 'ethereum',
  137: 'polygon',
  56: 'bsc',
  8453: 'base',
}

export const NETWORK_TO_CHAIN_ID: Record<CryptoNetwork, number> = {
  ethereum: 1,
  polygon: 137,
  bsc: 56,
  base: 8453,
}

export const NETWORK_NAMES: Record<CryptoNetwork, string> = {
  ethereum: 'Ethereum',
  polygon: 'Polygon',
  bsc: 'BNB Smart Chain',
  base: 'Base',
}

export const NETWORK_EXPLORERS: Record<CryptoNetwork, string> = {
  ethereum: 'https://etherscan.io',
  polygon: 'https://polygonscan.com',
  bsc: 'https://bscscan.com',
  base: 'https://basescan.org',
}

export function getExplorerTxUrl(network: CryptoNetwork, txHash: string): string {
  return `${NETWORK_EXPLORERS[network]}/tx/${txHash}`
}

export function getExplorerAddressUrl(network: CryptoNetwork, address: string): string {
  return `${NETWORK_EXPLORERS[network]}/address/${address}`
}
