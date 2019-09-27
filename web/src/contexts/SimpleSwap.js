import React, {
  createContext, useContext, useReducer, useMemo, useCallback, useEffect
} from 'react'
import { useWeb3Context } from 'web3-react'
import { safeAccess, isAddress, getUSDXReserveOf, getSimpleSwapBalanceOf } from '../utils'
import { useBlockNumber } from './Application'
import { useAddressBalance } from './Balances'
import { SIMPLESWAP_ADDRESSES } from '../constants'

const UPDATE_RESERVES = 'UPDATE_RESERVES'
const UPDATE_BALANCES = 'UPDATE_BALANCES'

const SimpleSwapContext = createContext()

const useSimpleSwapContext = () => {
  return useContext(SimpleSwapContext)
}

const initialState = {
  reserves: {},
  balances: {}
}

function reducer(state, { type, payload }) {
  switch (type) {
    case UPDATE_RESERVES: {
      const { networkId, tokenAddress, value, blockNumber } = payload
      return {
        ...state,
        reserves: {
          ...safeAccess(state, ['reserves']),
          [networkId]: {
            ...safeAccess(state, ['reserves', networkId]),
            [tokenAddress]: {
              value,
              blockNumber
            }
          }
        }
      }
    }
    case UPDATE_BALANCES: {
      const { networkId, account, value, blockNumber } = payload
      return {
        ...state,
        balances: {
          ...safeAccess(state, ['balances']),
          [networkId]: {
            ...safeAccess(state, ['balances', networkId]),
            [account]: {
              value,
              blockNumber
            }
          }
        }
      }
    }
    default: {
      throw Error(`Unexpected action type in SimpleSwapContext reducer: '${type}'.`)
    }
  }
}

export default function Provider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  const updateReserves = useCallback((networkId, tokenAddress, value, blockNumber) => {
    dispatch({ type: UPDATE_RESERVES, payload: { networkId, tokenAddress, value, blockNumber } })
  }, [])

  const updateBalances = useCallback((networkId, account, value, blockNumber) => {
    dispatch({ type: UPDATE_BALANCES, payload: { networkId, account, value, blockNumber } })
  }, [])

  const value = useMemo(() => [state, { updateReserves, updateBalances }], [state, updateReserves, updateBalances])

  return (
    <SimpleSwapContext.Provider value={value}>
      {children}
    </SimpleSwapContext.Provider>
  )
}

export const useUSDXReserveOf = (tokenAddress) => {
  const { networkId, library } = useWeb3Context()

  const globalBlockNumber = useBlockNumber()

  const [state, { updateReserves }] = useSimpleSwapContext()
  const { value, blockNumber } = safeAccess(state, ['reserves', networkId, tokenAddress]) || {}

  useEffect(() => {
    if (
      isAddress(tokenAddress) &&
      (value === undefined || blockNumber !== globalBlockNumber) &&
      (networkId || networkId === 0) &&
      library
    ) {
      let stale = false
      getUSDXReserveOf(tokenAddress, networkId, library)
        .then(reserve => {
          if (!stale) {
            updateReserves(networkId, tokenAddress, reserve, blockNumber)
          }
        })
        .catch(() => {
          if (!stale) {
            updateReserves(networkId, tokenAddress, null, blockNumber)
          }
        })
      return () => {
        stale = true
      }
    }
  }, [updateReserves, networkId, tokenAddress, value, blockNumber, globalBlockNumber, library])
  
  return value
}

export const useSimpleSwapReserveOf = (tokenAddress) => {
  const { networkId } = useWeb3Context()

  const reserveUSDX = useUSDXReserveOf(tokenAddress)
  const reserveToken = useAddressBalance(SIMPLESWAP_ADDRESSES[networkId], tokenAddress)

  return { reserveUSDX, reserveToken }
}

export const useSimpleSwapBalanceOf = (ownerAddress, tokenAddress) => {
  const { networkId, library } = useWeb3Context()

  const globalBlockNumber = useBlockNumber()
  const [state, { updateBalances }] = useSimpleSwapContext()
  const { value, blockNumber } = safeAccess(state, ['balances', networkId, ownerAddress]) || {}

  useEffect(() => {
    if (
      isAddress(ownerAddress) && isAddress(tokenAddress) &&
      (value === undefined || blockNumber !== globalBlockNumber) &&
      (networkId || networkId === 0) &&
      library
    ) {
      let stale = false
      getSimpleSwapBalanceOf(ownerAddress, tokenAddress, networkId, library)
        .then(balance => {
          if (!stale) {
            updateBalances(networkId, ownerAddress, balance, blockNumber)
          }
        })
        .catch(() => {
          if (!stale) {
            updateBalances(networkId, ownerAddress, null, blockNumber)
          }
        })
      return () => {
        stale = true
      }
    }
  }, [updateBalances, ownerAddress, tokenAddress, value, networkId, blockNumber, globalBlockNumber, library])

  return value
}
