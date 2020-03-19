import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useMemo,
  useEffect,
} from 'react'
import { useBlockNumber } from '../contexts/Application'
import { useWeb3React } from '../hooks'
import { safeAccess, isAddress, getExchangeReserves } from '../utils'

const UPDATE = 'UPDATE'

const ExchangesContext = createContext()

export function useExchangesContext() {
  return useContext(ExchangesContext)
}

function reducer(state, { type, payload }) {
  switch(type) {
    case UPDATE: {
      const {
        chainId,
        exchangeAddress,
        tokenAddress,
        coinReserve,
        tokenReserve,
        blockNumber
      } = payload
      return {
        ...state,
        [chainId]: {
          ...safeAccess(state, [chainId]),
          [exchangeAddress]: {
            ...safeAccess(state, [chainId, exchangeAddress]),
            [tokenAddress]: {
              ...safeAccess(state, [chainId, exchangeAddress, tokenAddress]),
              coinReserve,
              tokenReserve,
              blockNumber,
            }
          }
        }
      }
    }
    default: {
      throw Error(`Unexpected action type in ExchangesContext reducer: '${type}'.`)
    }
  }
}

export default function Provider({ children }) {
  const [state, dispatch] = useReducer(reducer, {})
  const update = useCallback((chainId, exchangeAddress, tokenAddress, coinReserve, tokenReserve, blockNumber) => 
    dispatch({ type: UPDATE, payload: { chainId, exchangeAddress, tokenAddress, coinReserve, tokenReserve, blockNumber } })
  , [])
  const value = useMemo(() => [state, { update }], [state, update])

  return (
    <ExchangesContext.Provider value={value}>{children}</ExchangesContext.Provider>
  )
}

export function useExchangeReserves(exchangeAddress, tokenAddress) {
  const { chainId, library } = useWeb3React()

  const globalBlockNumber = useBlockNumber()

  const [state, { update }] = useExchangesContext()
  const { coinReserve, tokenReserve, blockNumber } = safeAccess(state, [chainId, exchangeAddress, tokenAddress]) || {}

  useEffect(() => {
    if (
      isAddress(exchangeAddress) &&
      isAddress(tokenAddress) &&
      (coinReserve === undefined || tokenReserve === undefined || blockNumber !== globalBlockNumber) &&
      (chainId || chainId === 0) &&
      library
    ) {
      let stale = false
      
      getExchangeReserves(exchangeAddress, tokenAddress, library)
        .then(({ coinReserve, tokenReserve }) => {
          if (!stale) {
            update(chainId, exchangeAddress, tokenAddress, coinReserve, tokenReserve, globalBlockNumber)
          }
        })
        .catch((err) => {
          if (!stale) {
            update(chainId, exchangeAddress, tokenAddress, null, null, globalBlockNumber)
          }
        })

      return () => {
        stale = true
      }
    }
  }, [exchangeAddress, tokenAddress, coinReserve, tokenReserve, globalBlockNumber, library, chainId, blockNumber, update])

  return { coinReserve, tokenReserve }
}
