import React, {
  createContext, useContext, useReducer, useMemo, useCallback, useEffect
} from 'react'
import { safeAccess, isAddress, getUSDXReserveOf, getTokenReserveOf, getSimpleSwapBalanceOf } from '../utils'
import { useBlockNumber } from './Application'
import { useWeb3React } from '../hooks'

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
      const { chainId, tokenAddress, value, blockNumber } = payload
      return {
        ...state,
        usdxReserves: {
          ...safeAccess(state, ['usdxReserves']),
          [chainId]: {
            ...safeAccess(state, ['usdxReserves', chainId]),
            [tokenAddress]: {
              value,
              blockNumber
            }
          }
        }
      }
    }
    case UPDATE_TOKEN_RESERVES: {
      const { chainId, tokenAddress, value, blockNumber } = payload
      return {
        ...state,
        tokenReserves: {
          ...safeAccess(state, ['tokenReserves']),
          [chainId]: {
            ...safeAccess(state, ['tokenReserves', chainId]),
            [tokenAddress]: {
              value,
              blockNumber
            }
          }
        }
      }
    }
    case UPDATE_BALANCES: {
      const { chainId, account, tokenAddress, value, blockNumber } = payload
      return {
        ...state,
        balances: {
          ...safeAccess(state, ['balances']),
          [chainId]: {
            ...safeAccess(state, ['balances', chainId]),
            [account]: {
              ...safeAccess(state, ['balances', chainId, account]),
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

  const updateUSDXReserves = useCallback((chainId, tokenAddress, value, blockNumber) => {
    dispatch({ type: UPDATE_USDX_RESERVES, payload: { chainId, tokenAddress, value, blockNumber } })
  }, [])

  const updateTokenReserves = useCallback((chainId, tokenAddress, value, blockNumber) => {
    dispatch({ type: UPDATE_TOKEN_RESERVES, payload: { chainId, tokenAddress, value, blockNumber } })
  }, [])

  const updateBalances = useCallback((chainId, account, tokenAddress, value, blockNumber) => {
    dispatch({ type: UPDATE_BALANCES, payload: { chainId, account, tokenAddress, value, blockNumber } })
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
  const { chainId, library } = useWeb3React()

  const globalBlockNumber = useBlockNumber()

  const [state, { updateUSDXReserves }] = useSimpleSwapContext()
  const { value, blockNumber } = safeAccess(state, ['usdxReserves', chainId, tokenAddress]) || {}

  useEffect(() => {
    if (
      isAddress(tokenAddress) &&
      (value === undefined || blockNumber !== globalBlockNumber) &&
      (chainId || chainId === 0) &&
      library
    ) {
      let stale = false
      getUSDXReserveOf(tokenAddress, chainId, library)
        .then(reserve => {
          if (!stale) {
            updateUSDXReserves(chainId, tokenAddress, reserve, globalBlockNumber)
          }
        })
        .catch(() => {
          if (!stale) {
            updateUSDXReserves(chainId, tokenAddress, null, globalBlockNumber)
          }
        })
      return () => {
        stale = true
      }
    }
  }, [updateUSDXReserves, chainId, tokenAddress, value, blockNumber, globalBlockNumber, library])
  
  return value
}

export const useTokenReserveOf = (tokenAddress) => {
  const { chainId, library } = useWeb3React()

  const globalBlockNumber = useBlockNumber()

  const [state, { updateTokenReserves }] = useSimpleSwapContext()
  const { value, blockNumber } = safeAccess(state, ['tokenReserves', chainId, tokenAddress]) || {}

  useEffect(() => {
    if (
      isAddress(tokenAddress) &&
      (value === undefined || blockNumber !== globalBlockNumber) &&
      (chainId || chainId === 0) &&
      library
    ) {
      let stale = false
      getTokenReserveOf(tokenAddress, chainId, library)
        .then(reserve => {
          if (!stale) {
            updateTokenReserves(chainId, tokenAddress, reserve, globalBlockNumber)
          }
        })
        .catch(() => {
          if (!stale) {
            updateTokenReserves(chainId, tokenAddress, null, globalBlockNumber)
          }
        })
      return () => {
        stale = true
      }
    }
  }, [updateTokenReserves, chainId, tokenAddress, value, blockNumber, globalBlockNumber, library])
  
  return value
}

export const useSimpleSwapReserveOf = (tokenAddress) => {
  const reserveUSDX = useUSDXReserveOf(tokenAddress)
  const reserveToken = useTokenReserveOf(tokenAddress)

  return { reserveUSDX, reserveToken }
}

export const useSimpleSwapBalanceOf = (ownerAddress, tokenAddress) => {
  const { chainId, library } = useWeb3React()

  const globalBlockNumber = useBlockNumber()
  const [state, { updateBalances }] = useSimpleSwapContext()
  const { value, blockNumber } = safeAccess(state, ['balances', chainId, ownerAddress, tokenAddress]) || {}

  useEffect(() => {
    if (
      isAddress(ownerAddress) && isAddress(tokenAddress) &&
      (value === undefined || blockNumber !== globalBlockNumber) &&
      (chainId || chainId === 0) &&
      library
    ) {
      let stale = false
      getSimpleSwapBalanceOf(ownerAddress, tokenAddress, chainId, library)
        .then(balance => {
          if (!stale) {
            updateBalances(chainId, ownerAddress, tokenAddress, balance, globalBlockNumber)
          }
        })
        .catch(() => {
          if (!stale) {
            updateBalances(chainId, ownerAddress, tokenAddress, null, globalBlockNumber)
          }
        })
      return () => {
        stale = true
      }
    }
  }, [updateBalances, ownerAddress, tokenAddress, value, chainId, blockNumber, globalBlockNumber, library])

  return value
}
