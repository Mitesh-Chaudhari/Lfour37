import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createPublicClient, http } from 'viem'
import { mainnet, polygon, bsc, base } from 'wagmi/chains'
import { CONTRACT_ADDRESSES, MERCHANT_ADDRESS, TOKEN_DECIMALS } from '@/lib/crypto/contracts'
import { NETWORK_REQUIRED_CONFIRMATIONS } from '@/lib/crypto/contracts'
import { sendOrderConfirmationEmail } from '@/lib/email'
import logger from '@/lib/logger'
import { z } from 'zod'
import { type CryptoNetwork, type CryptoToken } from '@/types'
import { createDelhiveryShipmentForOrder } from '@/lib/delhivery-shipping'

const CHAINS = {
  ethereum: mainnet,
  polygon,
  bsc,
  base,
}

const schema = z.object({
  order_id: z.string().uuid(),
  transaction_hash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  network: z.enum(['ethereum', 'polygon', 'bsc', 'base']),
  token: z.enum(['USDT', 'USDC']),
  from_address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
})

const ERC20_TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = schema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const data = parsed.data

    // Check for double-spend: verify this tx hash isn't already used
    const { data: existingTx } = await supabase
      .from('crypto_transactions')
      .select('id, status')
      .eq('transaction_hash', data.transaction_hash)
      .single()

    if (existingTx && existingTx.status === 'completed') {
      return NextResponse.json({ error: 'Transaction already processed' }, { status: 400 })
    }

    // Verify order belongs to user
    const { data: order } = await supabase
      .from('orders')
      .select('*, items:order_items(*), user:users(email)')
      .eq('id', data.order_id)
      .eq('user_id', user.id)
      .single()

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    if (order.payment_status === 'completed') {
      return NextResponse.json({ error: 'Order already paid' }, { status: 400 })
    }

    // Verify transaction on-chain
    const chain = CHAINS[data.network as CryptoNetwork]
    const publicClient = createPublicClient({
      chain,
      transport: http(),
    })

    const receipt = await publicClient.getTransactionReceipt({
      hash: data.transaction_hash as `0x${string}`,
    })

    if (!receipt || receipt.status !== 'success') {
      return NextResponse.json({ error: 'Transaction failed or not found' }, { status: 400 })
    }

    const contractAddress = CONTRACT_ADDRESSES[data.network as CryptoNetwork][data.token as CryptoToken]
    const decimals = TOKEN_DECIMALS[data.token as CryptoToken]
    const expectedAmount = BigInt(Math.round(order.total * 10 ** decimals))
    const tolerance = BigInt(Math.round(0.01 * 10 ** decimals)) // $0.01 tolerance

    // Verify ERC20 Transfer event
    const transferLog = receipt.logs.find((log) => {
      if (log.address.toLowerCase() !== contractAddress.toLowerCase()) return false
      if (log.topics[0] !== ERC20_TRANSFER_TOPIC) return false
      if (!log.topics[1] || !log.topics[2]) return false

      const from = '0x' + log.topics[1].slice(26)
      const to = '0x' + log.topics[2].slice(26)

      if (from.toLowerCase() !== data.from_address.toLowerCase()) return false
      if (to.toLowerCase() !== MERCHANT_ADDRESS.toLowerCase()) return false

      const amount = BigInt(log.data)
      const diff = amount > expectedAmount ? amount - expectedAmount : expectedAmount - amount

      return diff <= tolerance
    })

    if (!transferLog) {
      logger.warn('Transfer event not found in tx', {
        hash: data.transaction_hash,
        network: data.network,
        orderId: data.order_id,
      })
      return NextResponse.json({ error: 'Invalid transaction: transfer not found or amount mismatch' }, { status: 400 })
    }

    const blockNumber = Number(receipt.blockNumber)
    const currentBlock = await publicClient.getBlockNumber()
    const confirmations = Number(currentBlock) - blockNumber

    // Update crypto transaction
    await supabase
      .from('crypto_transactions')
      .update({
        transaction_hash: data.transaction_hash,
        status: confirmations >= NETWORK_REQUIRED_CONFIRMATIONS[data.network as CryptoNetwork] ? 'completed' : 'pending',
        block_number: blockNumber,
        confirmations: Math.min(confirmations, NETWORK_REQUIRED_CONFIRMATIONS[data.network as CryptoNetwork]),
        verified_at: confirmations >= NETWORK_REQUIRED_CONFIRMATIONS[data.network as CryptoNetwork] ? new Date().toISOString() : null,
      })
      .eq('order_id', data.order_id)

    // Update order & payment (even with fewer confirmations, we optimistically mark as paid)
    await supabase
      .from('orders')
      .update({ status: 'paid', payment_status: 'completed' })
      .eq('id', data.order_id)

    await supabase
      .from('payments')
      .update({ status: 'completed' })
      .eq('order_id', data.order_id)
      .eq('payment_method', 'crypto')

    try {
      await createDelhiveryShipmentForOrder(order.id)
    } catch (error) {
      logger.error('Delhivery shipment creation failed after crypto payment', {
        error,
        orderId: order.id,
      })
    }

    const { data: updatedOrder } = await supabase
      .from('orders')
      .select('tracking_number')
      .eq('id', data.order_id)
      .single()

    // Analytics
    await supabase.from('analytics_events').insert({
      event_type: 'crypto_payment_verified',
      user_id: user.id,
      order_id: data.order_id,
      properties: {
        network: data.network,
        token: data.token,
        tx_hash: data.transaction_hash,
        confirmations,
      },
    })

    // Send confirmation email
    const orderUser = Array.isArray(order.user) ? order.user[0] : order.user
    if (orderUser?.email) {
      sendOrderConfirmationEmail(
        {
          ...order,
          status: 'paid',
          payment_status: 'completed',
          tracking_number:
            updatedOrder?.tracking_number || order.tracking_number,
        },
        orderUser.email
      ).catch((error) =>
        logger.error('Crypto order confirmation email failed', {
          error,
          orderId: order.id,
        })
      )
    }

    logger.info('Crypto payment verified', {
      orderId: data.order_id,
      txHash: data.transaction_hash,
      network: data.network,
      confirmations,
    })

    return NextResponse.json({ success: true, confirmations })
  } catch (error) {
    logger.error('Crypto verification error', { error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
