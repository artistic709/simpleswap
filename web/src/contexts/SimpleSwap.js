import React, {
  createContext, useContext, useReducer, useMemo, useCallback, useEffect
} from 'react'
import { useWeb3Context } from 'web3-react'
import { safeAccess, isAddress, getUSDXReserveOf, getTokenReserveOf, getSimpleSwapBalanceOf } from '../utils'
import { useBlockNumber } from './Application'

const UPDATE_USDX_RESERVES = 'UPDATE_USDX_RESERVES'
const UPDATE_TOKEN_RESERVES = 'UPDATE_TOKEN_RESERVES'
const UPDATE_BALANCES = 'UPDATE_BALANCES'

const SimpleSwapContext = createContext()

const useSimpleSwapContext = () => {
  return useContext(SimpleSwapContext)
}

const initialState = {
  usdxReserves: {},
  tokenReserves: {},
  balances: {}
}

function reducer(state, { type, payload }) {
  switch (type) {
    case UPDATE_USDX_RESERVES: {
      const { networkId, tokenAddress, value, blockNumber } = payload
      return {
        ...state,
        usdxReserves: {
          ...safeAccess(state, ['usdxReserves']),
          [networkId]: {
            ...safeAccess(state, ['usdxReserves', networkId]),
            [tokenAddress]: {
              value,
              blockNumber
            }
          }
        }
      }
    }
    case UPDATE_TOKEN_RESERVES: {
      const { networkId, tokenAddress, value, blockNumber } = payload
      return {
        ...state,
        tokenReserves: {
          ...safeAccess(state, ['tokenReserves']),
          [networkId]: {
            ...safeAccess(state, ['tokenReserves', networkId]),
            [tokenAddress]: {
              value,
              blockNumber
            }
          }
        }
      }
    }
    case UPDATE_BALANCES: {
      const { networkId, account, tokenAddress, value, blockNumber } = payload
      return {
        ...state,
        balances: {
          ...safeAccess(state, ['balances']),
          [networkId]: {
            ...safeAccess(state, ['balances', networkId]),
            [account]: {
              ...safeAccess(state, ['balances', networkId, account]),
              [tokenAddress]: {
                value,
                blockNumber
              }
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

  const updateUSDXReserves = useCallback((networkId, tokenAddress, value, blockNumber) => {
    dispatch({ type: UPDATE_USDX_RESERVES, payload: { networkId, tokenAddress, value, blockNumber } })
  }, [])

  const updateTokenReserves = useCallback((networkId, tokenAddress, value, blockNumber) => {
    dispatch({ type: UPDATE_TOKEN_RESERVES, payload: { networkId, tokenAddress, value, blockNumber } })
  }, [])

  const updateBalances = useCallback((networkId, account, tokenAddress, value, blockNumber) => {
    dispatch({ type: UPDATE_BALANCES, payload: { networkId, account, tokenAddress, value, blockNumber } })
  }, [])

  const value = useMemo(
    () => [state, { updateUSDXReserves, updateTokenReserves, updateBalances }],
    [state, updateUSDXReserves, updateTokenReserves, updateBalances]
  )

  return (
    <SimpleSwapContext.Provider value={value}>
      {children}
    </SimpleSwapContext.Provider>
  )
}

export const useUSDXReserveOf = (tokenAddress) => {
  const { networkId, library } = useWeb3Context()

  const globalBlockNumber = useBlockNumber()

  const [state, { updateUSDXReserves }] = useSimpleSwapContext()
  const { value, blockNumber } = safeAccess(state, ['usdxReserves', networkId, tokenAddress]) || {}

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
            updateUSDXReserves(networkId, tokenAddress, reserve, globalBlockNumber)
          }
        })
        .catch(() => {
          if (!stale) {
            updateUSDXReserves(networkId, tokenAddress, null, globalBlockNumber)
          }
        })
      return () => {
        stale = true
      }
    }
  }, [updateUSDXReserves, networkId, tokenAddress, value, blockNumber, globalBlockNumber, library])
  
  return value
}

export const useTokenReserveOf = (tokenAddress) => {
  const { networkId, library } = useWeb3Context()

  const globalBlockNumber = useBlockNumber()

  const [state, { updateTokenReserves }] = useSimpleSwapContext()
  const { value, blockNumber } = safeAccess(state, ['tokenReserves', networkId, tokenAddress]) || {}

  useEffect(() => {
    if (
      isAddress(tokenAddress) &&
      (value === undefined || blockNumber !== globalBlockNumber) &&
      (networkId || networkId === 0) &&
      library
    ) {
      let stale = false
      getTokenReserveOf(tokenAddress, networkId, library)
        .then(reserve => {
          if (!stale) {
            updateTokenReserves(networkId, tokenAddress, reserve, globalBlockNumber)
          }
        })
        .catch(() => {
          if (!stale) {
            updateTokenReserves(networkId, tokenAddress, null, globalBlockNumber)
          }
        })
      return () => {
        stale = true
      }
    }
  }, [updateTokenReserves, networkId, tokenAddress, value, blockNumber, globalBlockNumber, library])
  
  return value
}

export const useSimpleSwapReserveOf = (tokenAddress) => {
  const reserveUSDX = useUSDXReserveOf(tokenAddress)
  const reserveToken = useTokenReserveOf(tokenAddress)

  return { reserveUSDX, reserveToken }
}

export const useSimpleSwapBalanceOf = (ownerAddress, tokenAddress) => {
  const { networkId, library } = useWeb3Context()

  const globalBlockNumber = useBlockNumber()
  const [state, { updateBalances }] = useSimpleSwapContext()
  const { value, blockNumber } = safeAccess(state, ['balances', networkId, ownerAddress, tokenAddress]) || {}

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
            updateBalances(networkId, ownerAddress, tokenAddress, balance, globalBlockNumber)
          }
        })
        .catch(() => {
          if (!stale) {
            updateBalances(networkId, ownerAddress, tokenAddress, null, globalBlockNumber)
          }
        })
      return () => {
        stale = true
      }
    }
  }, [updateBalances, ownerAddress, tokenAddress, value, networkId, blockNumber, globalBlockNumber, library])

  return value
}
