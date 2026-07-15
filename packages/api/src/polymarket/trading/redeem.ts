import type { Transaction } from '@polymarket/builder-relayer-client'
import { encodeFunctionData } from 'viem'
import {
  CONTRACTS,
  CTF_GET_COLLECTION_ID_ABI,
  CTF_GET_POSITION_ID_ABI,
  ERC1155_BALANCE_OF_ABI,
  ERC1155_SET_APPROVAL_ABI,
  polygonProvider,
  ZERO_BYTES32,
} from './contracts.js'

const CTF_REDEEM_ABI = [{
  name: 'redeemPositions', type: 'function',
  inputs: [
    { name: 'collateralToken', type: 'address' },
    { name: 'parentCollectionId', type: 'bytes32' },
    { name: 'conditionId', type: 'bytes32' },
    { name: 'indexSets', type: 'uint256[]' },
  ],
  outputs: [],
}] as const

const REDEEM_INDEX_SETS = [1n, 2n] as const
const REDEEM_COLLATERALS = [
  { label: 'pUSD', address: CONTRACTS.PUSD },
  { label: 'USDC.e', address: CONTRACTS.USDC_E },
] as const

export type RedeemCollateralBalance = {
  label: string
  collateralToken: string
  positions: {
    indexSet: string
    positionId: string
    balanceRaw: string
    balance: number
  }[]
  totalBalanceRaw: string
  totalBalance: number
}

export function buildCtfRedeemData(collateralToken: string, conditionId: string) {
  return encodeFunctionData({
    abi: CTF_REDEEM_ABI,
    functionName: 'redeemPositions',
    args: [
      collateralToken as `0x${string}`,
      ZERO_BYTES32,
      conditionId as `0x${string}`,
      REDEEM_INDEX_SETS,
    ],
  })
}

export async function getCtfPositionBalance(account: string, positionId: bigint): Promise<bigint> {
  const balanceData = encodeFunctionData({
    abi: ERC1155_BALANCE_OF_ABI,
    functionName: 'balanceOf',
    args: [account as `0x${string}`, positionId],
  })
  const balanceRaw = await polygonProvider.call({ to: CONTRACTS.CTF, data: balanceData })
  return BigInt(balanceRaw)
}

export async function getRedeemCollateralBalances(
  tradingAddress: string,
  conditionId: string,
): Promise<RedeemCollateralBalance[]> {
  const balances: RedeemCollateralBalance[] = []
  for (const collateral of REDEEM_COLLATERALS) {
    const positions: RedeemCollateralBalance['positions'] = []
    let totalBalanceRaw = 0n
    for (const indexSet of REDEEM_INDEX_SETS) {
      const collectionData = encodeFunctionData({
        abi: CTF_GET_COLLECTION_ID_ABI,
        functionName: 'getCollectionId',
        args: [ZERO_BYTES32, conditionId as `0x${string}`, indexSet],
      })
      const collectionId = await polygonProvider.call({ to: CONTRACTS.CTF, data: collectionData }) as `0x${string}`
      const positionData = encodeFunctionData({
        abi: CTF_GET_POSITION_ID_ABI,
        functionName: 'getPositionId',
        args: [collateral.address as `0x${string}`, collectionId],
      })
      const positionIdRaw = await polygonProvider.call({ to: CONTRACTS.CTF, data: positionData })
      const positionId = BigInt(positionIdRaw)
      const balanceRaw = await getCtfPositionBalance(tradingAddress, positionId)
      totalBalanceRaw += balanceRaw
      positions.push({
        indexSet: indexSet.toString(),
        positionId: positionId.toString(),
        balanceRaw: balanceRaw.toString(),
        balance: Number(balanceRaw) / 1e6,
      })
    }
    balances.push({
      label: collateral.label,
      collateralToken: collateral.address,
      positions,
      totalBalanceRaw: totalBalanceRaw.toString(),
      totalBalance: Number(totalBalanceRaw) / 1e6,
    })
  }
  return balances
}

export function buildSetApprovalForAllTx(operator: string): Transaction {
  return {
    to: CONTRACTS.CTF,
    data: encodeFunctionData({
      abi: ERC1155_SET_APPROVAL_ABI,
      functionName: 'setApprovalForAll',
      args: [operator as `0x${string}`, true],
    }),
    value: '0',
  }
}

export function isPusdCollateral(collateral: RedeemCollateralBalance) {
  return collateral.collateralToken.toLowerCase() === CONTRACTS.PUSD.toLowerCase()
}
