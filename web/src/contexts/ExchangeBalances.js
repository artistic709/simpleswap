import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useMemo,
  useEffect
} from 'react'
import { useBlockNumber } from '../contexts/Application'
import { useWeb3React } from '../hooks'
import { safeAccess, isAddress, getExchangeBalance } from '../utils'

const UPDATE = 'UPDATE'

const ExchangeBalancesContext = createContext()

export function useExchangeBalancesContext() {
  return useContext(ExchangeBalancesContext)
}

function reducer(state, { type, payload }) {
  switch (type) {
    case UPDATE: {
      const { chainId, account, exchangeAddress, tokenAddress, value, blockNumber } = payload
      return {
        ...state,
        [chainId]: {
          ...(safeAccess(state, [chainId]) || {}),
          [account]: {
            ...(safeAccess(state, [chainId, account]) || {}),
            [exchangeAddress]: {
              ...(safeAccess(state, [chainId, account, exchangeAddress]) || {}),
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
      throw Error(`Unexpected action type in ExchangeBalances reducer: ${type}`)
    }
  }
}

export default function Provider({ children }) {
  const [state, dispatch] = useReducer(reducer, {})
  const update = useCallback((
    chainId,
    account,
    exchangeAddress,
    tokenAddress,
    value,
    blockNumber,
  ) => 
    dispatch({
      type: UPDATE,
      payload: {
        chainId,
        account,
        exchangeAddress,
        tokenAddress,
        value,
        blockNumber,
      }
    })
  , [])
  const value = useMemo(() => [state, { update }], [state, update])

  return (
    <ExchangeBalancesContext.Provider value={value}>{children}</ExchangeBalancesContext.Provider>
  )
}

export function useExchangeBalance(account, exchangeAddress, tokenAddress) {
  const { chainId, library } = useWeb3React()

  const globalBlockNumber = useBlockNumber()

  const [state, { update }] = useExchangeBalancesContext()
  const { value, blockNumber } = safeAccess(state, [chainId, account, exchangeAddress, tokenAddress]) || {}

  useEffect(() => {
    if (
      isAddress(account) && isAddress(exchangeAddress) && isAddress(tokenAddress) &&
      (value === undefined || blockNumber !== globalBlockNumber) &&
      (chainId || chainId === 0) &&
      library
    ) {
      let stale = false

      getExchangeBalance(exchangeAddress, tokenAddress, account, library)
        .then(value => {
          if (!stale) {
            update(chainId, account, exchangeAddress, tokenAddress, value, globalBlockNumber)
          }
        })
        .catch(() => {
          if (!stale) {
            update(chainId, account, exchangeAddress, tokenAddress, null, globalBlockNumber)
          }
        })

      return () => {
        stale = true
      }
    }
  }, [account, blockNumber, chainId, exchangeAddress, globalBlockNumber, library, tokenAddress, update, value])

  return value
}
