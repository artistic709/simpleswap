import React, { createContext, useContext, useReducer, useMemo, useCallback, useEffect } from 'react'

import { useWeb3React } from '../hooks'
import {
  isAddress,
  getTokenName,
  getTokenSymbol,
  getTokenDecimals,
  safeAccess
} from '../utils'

import TokenWhiteList from '../constants/tokenWhiteList.json'

const NAME = 'name'
const SYMBOL = 'symbol'
const DECIMALS = 'decimals'

const UPDATE = 'UPDATE'

// const ETH = {
//   ETH: {
//     [NAME]: 'Ethereum',
//     [SYMBOL]: 'ETH',
//     [DECIMALS]: 18
//   }
// }

const INITIAL_TOKENS_CONTEXT = {
  1: TokenWhiteList,
  4: {
    '0x19b0EcD07d9AB6C751ea804b60C60433B8cA1785': {
      [NAME]: 'CryptoCow',
      [SYMBOL]: 'COW',
      [DECIMALS]: 18
    },
    '0x30CD74091E33f61Cd1D130f726db43DCF6F23746': {
      [NAME]: 'Token 1',
      [SYMBOL]: 'T1',
      [DECIMALS]: 18
    },
    '0x9b7ADE0Ab7B123DF831C471F68fb7C018EeEd625': {
      [NAME]: 'Token 2',
      [SYMBOL]: 'T2',
      [DECIMALS]: 18
    },
    '0xaf21bb8ae7b7a5eec37964e478583cd486fd12e2': {
      [NAME]: 'Test Token',
      [SYMBOL]: 'TEST',
      [DECIMALS]: 18
    },
    '0xdBCFff49D5F48DDf6e6df1f2C9B96E1FC0F31371': {
      [NAME]: 'UUDD',
      [SYMBOL]: 'USDx',
      [DECIMALS]: 18
    },
    '0xe668af4AD014334670c029e59c6Ff57eBBDe30f6': {
      [NAME]: 'Tether USD',
      [SYMBOL]: 'USDT',
      [DECIMALS]: 6
    }
  }
}

const TokensContext = createContext()

function useTokensContext() {
  return useContext(TokensContext)
}

function reducer(state, { type, payload }) {
  switch (type) {
    case UPDATE: {
      const { chainId, tokenAddress, name, symbol, decimals } = payload
      return {
        ...state,
        [chainId]: {
          ...(safeAccess(state, [chainId]) || {}),
          [tokenAddress]: {
            [NAME]: name,
            [SYMBOL]: symbol,
            [DECIMALS]: decimals
          }
        }
      }
    }
    default: {
      throw Error(`Unexpected action type in TokensContext reducer: '${type}'.`)
    }
  }
}

export default function Provider({ children }) {
  const [state, dispatch] = useReducer(reducer, INITIAL_TOKENS_CONTEXT)

  const update = useCallback((chainId, tokenAddress, name, symbol, decimals, exchangeAddress) => {
    dispatch({ type: UPDATE, payload: { chainId, tokenAddress, name, symbol, decimals, exchangeAddress } })
  }, [])

  return (
    <TokensContext.Provider value={useMemo(() => [state, { update }], [state, update])}>
      {children}
    </TokensContext.Provider>
  )
}

export function useTokenDetails(tokenAddress) {
  const { chainId, library } = useWeb3React()

  const [state, { update }] = useTokensContext()
  const allTokensInNetwork = { ...(safeAccess(state, [chainId]) || {}) }
  const { [NAME]: name, [SYMBOL]: symbol, [DECIMALS]: decimals } =
    safeAccess(allTokensInNetwork, [tokenAddress]) || {}

  useEffect(() => {
    if (
      isAddress(tokenAddress) &&
      (name === undefined || symbol === undefined || decimals === undefined ) &&
      (chainId || chainId === 0) &&
      library
    ) {
      let stale = false

      const namePromise = getTokenName(tokenAddress, library).catch(() => null)
      const symbolPromise = getTokenSymbol(tokenAddress, library).catch(() => null)
      const decimalsPromise = getTokenDecimals(tokenAddress, library).catch(() => null)

      Promise.all([namePromise, symbolPromise, decimalsPromise]).then(
        ([resolvedName, resolvedSymbol, resolvedDecimals]) => {
          if (!stale && resolvedName && resolvedSymbol && resolvedDecimals) {
            update(chainId, tokenAddress, resolvedName, resolvedSymbol, resolvedDecimals)
          }
        }
      )
      return () => {
        stale = true
      }
    }
  }, [tokenAddress, name, symbol, decimals, chainId, library, update])

  return { name, symbol, decimals }
}

export function useAllTokenDetails(requireExchange = false) {
  const { chainId } = useWeb3React()

  const [state] = useTokensContext()
  const tokenDetails = { ...(safeAccess(state, [chainId]) || {}) }

  return tokenDetails
}
