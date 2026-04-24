import { type Address } from 'viem'
import { CryptoNetwork, CryptoToken } from '@/types'

export const ERC20_ABI = [
  {
    inputs: [
      { name: 'recipient', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'transfer',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

export const TOKEN_DECIMALS: Record<CryptoToken, number> = {
  USDT: 6,
  USDC: 6,
}

export const CONTRACT_ADDRESSES: Record<CryptoNetwork, Record<CryptoToken, Address>> = {
  ethereum: {
    USDT: (process.env.NEXT_PUBLIC_USDT_ETHEREUM || '0xdAC17F958D2ee523a2206206994597C13D831ec7') as Address,
    USDC: (process.env.NEXT_PUBLIC_USDC_ETHEREUM || '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48') as Address,
  },
  polygon: {
    USDT: (process.env.NEXT_PUBLIC_USDT_POLYGON || '0xc2132D05D31c914a87C6611C10748AEb04B58e8F') as Address,
    USDC: (process.env.NEXT_PUBLIC_USDC_POLYGON || '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359') as Address,
  },
  bsc: {
    USDT: (process.env.NEXT_PUBLIC_USDT_BSC || '0x55d398326f99059fF775485246999027B3197955') as Address,
    USDC: (process.env.NEXT_PUBLIC_USDC_BSC || '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d') as Address,
  },
  base: {
    USDT: (process.env.NEXT_PUBLIC_USDT_BASE || '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2') as Address,
    USDC: (process.env.NEXT_PUBLIC_USDC_BASE || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913') as Address,
  },
}

export const MERCHANT_ADDRESS = (
  process.env.NEXT_PUBLIC_MERCHANT_WALLET || '0x0000000000000000000000000000000000000000'
) as Address

export const NETWORK_REQUIRED_CONFIRMATIONS: Record<CryptoNetwork, number> = {
  ethereum: 12,
  polygon: 64,
  bsc: 15,
  base: 12,
}

export function toTokenUnits(amount: number, token: CryptoToken): bigint {
  const decimals = TOKEN_DECIMALS[token]
  return BigInt(Math.round(amount * 10 ** decimals))
}

export function fromTokenUnits(amount: bigint, token: CryptoToken): number {
  const decimals = TOKEN_DECIMALS[token]
  return Number(amount) / 10 ** decimals
}
