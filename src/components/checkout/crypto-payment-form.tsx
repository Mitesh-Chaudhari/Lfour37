'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { parseUnits } from 'viem'
import { CryptoNetwork, CryptoToken } from '@/types'
import { CONTRACT_ADDRESSES, MERCHANT_ADDRESS, ERC20_ABI, TOKEN_DECIMALS } from '@/lib/crypto/contracts'
import { NETWORK_TO_CHAIN_ID, NETWORK_NAMES, getExplorerTxUrl } from '@/lib/crypto/networks'
import { useCartStore } from '@/store/cart-store'
import { Button } from '@/components/ui/button'
import { formatPrice } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { Shield, ExternalLink, Loader2, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'

interface CryptoPaymentFormProps {
  orderId: string
  amount: number
}

const NETWORKS: { id: CryptoNetwork; name: string }[] = [
  { id: 'ethereum', name: 'Ethereum' },
  { id: 'polygon', name: 'Polygon' },
  { id: 'bsc', name: 'BNB Chain' },
  { id: 'base', name: 'Base' },
]

const TOKENS: CryptoToken[] = ['USDT', 'USDC']

export function CryptoPaymentForm({ orderId, amount }: CryptoPaymentFormProps) {
  const router = useRouter()
  const { clearCart } = useCartStore()
  const { address, isConnected, chain } = useAccount()
  const { switchChain } = useSwitchChain()

  const [selectedNetwork, setSelectedNetwork] = useState<CryptoNetwork>('polygon')
  const [selectedToken, setSelectedToken] = useState<CryptoToken>('USDC')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const requiredChainId = NETWORK_TO_CHAIN_ID[selectedNetwork]
  const isOnCorrectChain = chain?.id === requiredChainId
  const contractAddress = CONTRACT_ADDRESSES[selectedNetwork][selectedToken]
  const tokenAmount = parseUnits(amount.toFixed(6), TOKEN_DECIMALS[selectedToken])

  const {
    writeContract,
    data: txHash,
    isPending: isWritePending,
    error: writeError,
  } = useWriteContract()

  const {
    isLoading: isConfirming,
    isSuccess: isTxConfirmed,
  } = useWaitForTransactionReceipt({
    hash: txHash,
    confirmations: 1, // Wait for 1 confirmation before showing success (backend verifies more)
  })

  useEffect(() => {
    if (isTxConfirmed && txHash) {
      handleVerifyPayment(txHash)
    }
  }, [isTxConfirmed, txHash])

  useEffect(() => {
    if (writeError) {
      toast.error(writeError.message || 'Transaction failed')
      setIsSubmitting(false)
    }
  }, [writeError])

  const handleSwitchChain = async () => {
    try {
      await switchChain({ chainId: requiredChainId })
    } catch {
      toast.error('Failed to switch network. Please switch manually in your wallet.')
    }
  }

  const handlePay = async () => {
    if (!isConnected || !address) {
      toast.error('Please connect your wallet')
      return
    }

    if (!isOnCorrectChain) {
      await handleSwitchChain()
      return
    }

    setIsSubmitting(true)

    try {
      // Create crypto transaction record first
      await fetch('/api/payments/crypto/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          network: selectedNetwork,
          token: selectedToken,
          from_address: address,
          to_address: MERCHANT_ADDRESS,
          amount: amount,
        }),
      })

      writeContract({
        address: contractAddress,
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [MERCHANT_ADDRESS, tokenAmount],
      })
    } catch {
      toast.error('Failed to initiate payment')
      setIsSubmitting(false)
    }
  }

  const handleVerifyPayment = async (hash: string) => {
    try {
      const res = await fetch('/api/payments/crypto/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          transaction_hash: hash,
          network: selectedNetwork,
          token: selectedToken,
          from_address: address,
        }),
      })

      if (res.ok) {
        toast.success('Payment submitted! Confirming on blockchain...')
        clearCart()
        router.push(`/checkout/success?order_id=${orderId}&tx=${hash}`)
      } else {
        toast.error('Payment verification failed. Please contact support with your transaction hash.')
      }
    } catch {
      toast.error('Verification failed. Keep your transaction hash: ' + hash)
    }
  }

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">Pay with Stablecoins</h3>

      {/* Wallet connect */}
      <div>
        <p className="text-sm text-gray-600 mb-3">Connect your wallet to proceed</p>
        <ConnectButton showBalance={false} />
      </div>

      {isConnected && (
        <>
          {/* Network selection */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Select Network</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {NETWORKS.map(({ id, name }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSelectedNetwork(id)}
                  className={cn(
                    'px-3 py-2 text-sm font-medium rounded-lg border-2 transition-all',
                    selectedNetwork === id
                      ? 'border-purple-600 bg-purple-50 text-purple-700'
                      : 'border-gray-200 text-gray-600 hover:border-purple-300'
                  )}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          {/* Token selection */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Select Token</p>
            <div className="flex gap-3">
              {TOKENS.map((token) => (
                <button
                  key={token}
                  type="button"
                  onClick={() => setSelectedToken(token)}
                  className={cn(
                    'px-6 py-2 text-sm font-bold rounded-lg border-2 transition-all',
                    selectedToken === token
                      ? 'border-purple-600 bg-purple-50 text-purple-700'
                      : 'border-gray-200 text-gray-600 hover:border-purple-300'
                  )}
                >
                  {token}
                </button>
              ))}
            </div>
          </div>

          {/* Payment details */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Amount to pay</span>
              <span className="font-bold">{amount.toFixed(2)} {selectedToken}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Network</span>
              <span className="font-medium">{NETWORK_NAMES[selectedNetwork]}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Recipient</span>
              <span className="font-mono text-xs">
                {MERCHANT_ADDRESS.slice(0, 6)}...{MERCHANT_ADDRESS.slice(-4)}
              </span>
            </div>
          </div>

          {/* Chain mismatch warning */}
          {!isOnCorrectChain && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
              <p className="text-sm text-yellow-800 mb-2">
                Your wallet is on the wrong network. Switch to {NETWORK_NAMES[selectedNetwork]}.
              </p>
              <Button size="sm" variant="outline" onClick={handleSwitchChain}>
                Switch to {NETWORK_NAMES[selectedNetwork]}
              </Button>
            </div>
          )}

          {/* Transaction status */}
          {txHash && (
            <div className={cn(
              'rounded-xl p-4',
              isTxConfirmed ? 'bg-green-50 border border-green-200' : 'bg-blue-50 border border-blue-200'
            )}>
              <div className="flex items-center gap-2 mb-2">
                {isTxConfirmed ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : (
                  <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
                )}
                <p className="text-sm font-medium">
                  {isTxConfirmed ? 'Transaction confirmed!' : 'Transaction submitted, waiting for confirmation...'}
                </p>
              </div>
              <a
                href={getExplorerTxUrl(selectedNetwork, txHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
              >
                View on Explorer <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}

          <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
            <Shield className="h-4 w-4 text-green-600 flex-shrink-0" />
            <span>
              Transaction verified on-chain. Send exactly {amount.toFixed(2)} {selectedToken} to complete your order.
            </span>
          </div>

          <Button
            onClick={handlePay}
            variant="brand"
            size="lg"
            className="w-full"
            disabled={!isOnCorrectChain || isWritePending || isConfirming || isTxConfirmed || isSubmitting}
            loading={isWritePending || isConfirming}
          >
            {!isOnCorrectChain
              ? `Switch to ${NETWORK_NAMES[selectedNetwork]}`
              : isWritePending
              ? 'Confirm in Wallet...'
              : isConfirming
              ? 'Confirming on Chain...'
              : isTxConfirmed
              ? 'Payment Confirmed!'
              : `Pay ${amount.toFixed(2)} ${selectedToken}`}
          </Button>
        </>
      )}
    </div>
  )
}
