import React, { useState, useReducer, useEffect, useMemo } from 'react'
import ReactGA from 'react-ga'

import { useTranslation } from 'react-i18next'

import { ethers } from 'ethers'
import styled from 'styled-components'

import { Button } from '../../theme'
import CurrencyInputPanel from '../CurrencyInputPanel'
import AddressInputPanel from '../AddressInputPanel'
import OversizedPanel from '../OversizedPanel'
import TransactionDetails from '../TransactionDetails'
import TransactionHistory from '../TransactionHistory'
import ArrowSwap from '../../assets/svg/SVGArrowSwap'
import { amountFormatter, calculateGasMargin } from '../../utils'
import { useWeb3React, useContract } from '../../hooks'
import { useTokenDetails, useAllTokenDetails } from '../../contexts/Tokens'
import { useTransactionAdder, useHasPendingTransaction } from '../../contexts/Transactions'
import { useAddressBalance } from '../../contexts/Balances'
import { useFetchAllBalances } from '../../contexts/AllBalances'
import { useAddressAllowance } from '../../contexts/Allowances'
import { useExchangeReserves } from '../../contexts/Exchanges'
import {
  USDXSWAP_ADDRESSES,
  USDX_ADDRESSES,
  USDX_DECIMALS,
  USDTSWAP_ADDRESSES,
  USDT_ADDRESSES,
  USDT_DECIMALS,
} from '../../constants'
import EXCHANGE_ABI from '../../constants/abis/exchange.json'

const INPUT = 0
const OUTPUT = 1

const COIN_TO_TOKEN = 0
const TOKEN_TO_COIN = 1
const TOKEN_TO_TOKEN = 2

// denominated in bips
const ALLOWED_SLIPPAGE_DEFAULT = 100
const TOKEN_ALLOWED_SLIPPAGE_DEFAULT = 100

// 15 minutes, denominated in seconds
const DEADLINE_FROM_NOW = 60 * 15

// % above the calculated gas cost that we actually send, denominated in bips
const GAS_MARGIN = ethers.utils.bigNumberify(1000)

const DownArrowBackground = styled.div`
  ${({ theme }) => theme.flexRowNoWrap}
  justify-content: center;
  align-items: center;
  margin-top: 0.5rem;
`

const WrappedArrowSwap = ({ clickable, active, ...rest }) => <ArrowSwap {...rest} />
const SwapArrow = styled(WrappedArrowSwap)`
  position: relative;
  width: 2rem;
  height: 2rem;
  box-sizing: content-box;
  cursor: ${({ clickable }) => clickable && 'pointer'};
`

const ExchangeRateWrapper = styled.div`
  ${({ theme }) => theme.flexRowNoWrap};
  margin-top: 0.5rem;
  align-items: center;
  color: ${({ theme }) => theme.doveGray};
  font-size: 0.75rem;
`

const Flex = styled.div`
  display: flex;
  justify-content: center;
  padding: 1.5rem;

  button {
    max-width: 20rem;
  }
`

function calculateSlippageBounds(value, token = false, tokenAllowedSlippage, allowedSlippage) {
  if (value) {
    const offset = value.mul(token ? tokenAllowedSlippage : allowedSlippage).div(ethers.utils.bigNumberify(10000))
    const minimum = value.sub(offset)
    const maximum = value.add(offset)
    return {
      minimum: minimum.lt(ethers.constants.Zero) ? ethers.constants.Zero : minimum,
      maximum: maximum.gt(ethers.constants.MaxUint256) ? ethers.constants.MaxUint256 : maximum
    }
  } else {
    return {}
  }
}

// TODO: How if swap type if  
function getSwapType(inputCurrency, outputCurrency, chainId, exchangeAddress) {
  if (!inputCurrency || !outputCurrency || !exchangeAddress) {
    return null
  } 
  if (exchangeAddress === USDXSWAP_ADDRESSES[chainId]) {
    if (inputCurrency === USDX_ADDRESSES[chainId]) {
      return COIN_TO_TOKEN
    } else if (outputCurrency === USDX_ADDRESSES[chainId]) {
      return TOKEN_TO_COIN
    } else {
      return TOKEN_TO_TOKEN
    }
  } else if (exchangeAddress === USDTSWAP_ADDRESSES[chainId]) {
    if (inputCurrency === USDT_ADDRESSES[chainId]) {
      return COIN_TO_TOKEN
    } else if (outputCurrency === USDT_ADDRESSES[chainId]) {
      return TOKEN_TO_COIN
    } else {
      return TOKEN_TO_TOKEN
    }
  }
}

// this mocks the getInputPrice function, and calculates the required output
function calculateOutputFromInput(inputAmount, inputReserve, outputReserve) {
  const inputAmountWithFee = inputAmount.mul(ethers.utils.bigNumberify(997))
  const numerator = inputAmountWithFee.mul(outputReserve)
  const denominator = inputReserve.mul(ethers.utils.bigNumberify(1000)).add(inputAmountWithFee)
  return numerator.div(denominator)
}

// this mocks the getOutputPrice function, and calculates the required input
function calculateInputFromOutput(outputAmount, inputReserve, outputReserve) {
  const numerator = inputReserve.mul(outputAmount).mul(ethers.utils.bigNumberify(1000))
  const denominator = outputReserve.sub(outputAmount).mul(ethers.utils.bigNumberify(997))
  return numerator.div(denominator)
}

function calculateDependentValue(amount, inputCoinReserve, inputTokenReserve, outputCoinReserve, outputTokenReserve, swapType, independentField) {
  let result
  if (swapType === COIN_TO_TOKEN) {
    if (amount && outputCoinReserve && outputTokenReserve) {
      result = independentField === INPUT
        ? calculateOutputFromInput(amount, outputCoinReserve, outputTokenReserve)
        : calculateInputFromOutput(amount, outputCoinReserve, outputTokenReserve)
    }
  } else if (swapType === TOKEN_TO_COIN) {
    if (amount && inputCoinReserve && inputTokenReserve) {
      result = independentField === INPUT
        ? calculateOutputFromInput(amount, inputTokenReserve, inputCoinReserve)
        : calculateInputFromOutput(amount, inputTokenReserve, inputCoinReserve)
    }
  } else {
    if (amount && inputCoinReserve && inputTokenReserve && outputCoinReserve && outputTokenReserve) {
      if (independentField === INPUT) {
        const intermediateValue = calculateOutputFromInput(amount, inputTokenReserve, inputCoinReserve)
        if (intermediateValue.isZero()) {
          result = ethers.constants.Zero
        } else {
          result = calculateOutputFromInput(
            intermediateValue,
            outputCoinReserve,
            outputTokenReserve,
          )
        }
      } else {
        const intermediateValue = calculateInputFromOutput(amount, outputTokenReserve, outputCoinReserve)
        if (intermediateValue.isZero()) {
          result = ethers.constants.Zero
        } else {
          result = calculateInputFromOutput(
            intermediateValue,
            inputCoinReserve,
            inputTokenReserve,
          )
        }
      }
    }
  }

  return result
}

function getInitialSwapState(initialCurrencies) {
  return {
    independentValue: '', // this is a user input
    dependentValue: '', // this is a calculated number
    independentField: INPUT,
    inputCurrency: initialCurrencies.inputCurrency ? initialCurrencies.inputCurrency: '',
    outputCurrency: initialCurrencies.outputCurrency ? initialCurrencies.outputCurrency : ''
  }
}

function swapStateReducer(state, action) {
  switch (action.type) {
    case 'FLIP_INDEPENDENT': {
      const { independentField, inputCurrency, outputCurrency } = state
      return {
        ...state,
        dependentValue: '',
        independentField: independentField === INPUT ? OUTPUT : INPUT,
        inputCurrency: outputCurrency,
        outputCurrency: inputCurrency
      }
    }
    case 'SELECT_CURRENCY': {
      const { inputCurrency, outputCurrency } = state
      const { field, currency } = action.payload

      const newInputCurrency = field === INPUT ? currency : inputCurrency
      const newOutputCurrency = field === OUTPUT ? currency : outputCurrency

      if (newInputCurrency === newOutputCurrency) {
        return {
          ...state,
          inputCurrency: field === INPUT ? currency : '',
          outputCurrency: field === OUTPUT ? currency : ''
        }
      } else {
        return {
          ...state,
          inputCurrency: newInputCurrency,
          outputCurrency: newOutputCurrency
        }
      }
    }
    case 'UPDATE_INDEPENDENT': {
      const { field, value } = action.payload
      const { dependentValue, independentValue } = state
      return {
        ...state,
        independentValue: value,
        dependentValue: value === independentValue ? dependentValue : '',
        independentField: field
      }
    }
    case 'UPDATE_DEPENDENT': {
      return {
        ...state,
        dependentValue: action.payload
      }
    }
    default: {
      return getInitialSwapState()
    }
  }
}

function getExchangeRate(inputValue, inputDecimals, outputValue, outputDecimals, invert = false) {
  try {
    if (
      inputValue &&
      (inputDecimals || inputDecimals === 0) &&
      outputValue &&
      (outputDecimals || outputDecimals === 0)
    ) {
      const factor = ethers.utils.bigNumberify(10).pow(ethers.utils.bigNumberify(18))

      if (invert) {
        return inputValue
          .mul(factor)
          .div(outputValue)
          .mul(ethers.utils.bigNumberify(10).pow(ethers.utils.bigNumberify(outputDecimals)))
          .div(ethers.utils.bigNumberify(10).pow(ethers.utils.bigNumberify(inputDecimals)))
      } else {
        return outputValue
          .mul(factor)
          .div(inputValue)
          .mul(ethers.utils.bigNumberify(10).pow(ethers.utils.bigNumberify(inputDecimals)))
          .div(ethers.utils.bigNumberify(10).pow(ethers.utils.bigNumberify(outputDecimals)))
      }
    }
  } catch {}
}

function getMarketRate(
  swapType,
  coinDecimals,
  inputReserveCoin,
  inputReserveToken,
  inputTokenDecimals,
  outputReserveCoin,
  outputReserveToken,
  outputTokenDecimals,
  invert = false
) {
  if (swapType === COIN_TO_TOKEN) {
    return getExchangeRate(outputReserveCoin, coinDecimals, outputReserveToken, outputTokenDecimals, invert)
  } else if (swapType === TOKEN_TO_COIN) {
    return getExchangeRate(inputReserveToken, inputTokenDecimals, inputReserveCoin, coinDecimals, invert)
  } else if (swapType === TOKEN_TO_TOKEN) {
    const factor = ethers.utils.bigNumberify(10).pow(ethers.utils.bigNumberify(18))
    const firstRate = getExchangeRate(inputReserveToken, inputTokenDecimals, inputReserveCoin, coinDecimals)
    const secondRate = getExchangeRate(outputReserveCoin, coinDecimals, outputReserveToken, outputTokenDecimals)
    try {
      return !!(firstRate && secondRate) ? firstRate.mul(secondRate).div(factor) : undefined
    } catch {}
  }
}

export default function ExchangePage({ initialCurrency }) {
  const { t } = useTranslation()
  const { account, chainId } = useWeb3React()

  const addTransaction = useTransactionAdder()
  const hasPendingTransaction = useHasPendingTransaction()

  const [sending, setSending] = useState(false)

  const [rawSlippage, setRawSlippage] = useState(ALLOWED_SLIPPAGE_DEFAULT)
  const [rawTokenSlippage, setRawTokenSlippage] = useState(TOKEN_ALLOWED_SLIPPAGE_DEFAULT)

  const allowedSlippageBig = ethers.utils.bigNumberify(rawSlippage)
  const tokenAllowedSlippageBig = ethers.utils.bigNumberify(rawTokenSlippage)

  // analytics
  useEffect(() => {
    ReactGA.pageview(window.location.pathname + window.location.search)
  }, [])

  const allTokens = useAllTokenDetails()

  const initialCurrencies = {
    inputCurrency: USDX_ADDRESSES[chainId],
    outputCurrency: initialCurrency || Object.keys(allTokens)[0]
  }

  // core swap state
  const [swapState, dispatchSwapState] = useReducer(swapStateReducer, initialCurrencies, getInitialSwapState)

  const { independentValue, dependentValue, independentField, inputCurrency, outputCurrency } = swapState

  const [recipient, setRecipient] = useState({ address: '', name: '' })
  const [recipientError, setRecipientError] = useState()

  
  // get decimals and exchange address for each of the currency types
  const { symbol: inputSymbol, decimals: inputDecimals } = useTokenDetails(
    inputCurrency
  )
  const { symbol: outputSymbol, decimals: outputDecimals } = useTokenDetails(
    outputCurrency
  )

  const usdxSwapContract = useContract(USDXSWAP_ADDRESSES[chainId], EXCHANGE_ABI)
  const usdtSwapContract = useContract(USDTSWAP_ADDRESSES[chainId], EXCHANGE_ABI)
  const [exchangeAddress, setExchangeAddress] = useState()
  const contract = useMemo(() => {
    if (exchangeAddress === USDXSWAP_ADDRESSES[chainId]) {
      return usdxSwapContract
    } else {
      return usdtSwapContract
    }
  }, [chainId, exchangeAddress, usdtSwapContract, usdxSwapContract])

  const swapType = getSwapType(inputCurrency, outputCurrency, chainId, exchangeAddress)

  // get input allowance
  const inputAllowance = useAddressAllowance(account, inputCurrency, exchangeAddress)

  // fetch reserves for each of the currency types
  const { coinReserve: inputCoinReserveAtUsdxSwap, tokenReserve: inputTokenReserveAtUsdxSwap } = useExchangeReserves(USDXSWAP_ADDRESSES[chainId], inputCurrency)
  const { coinReserve: outputCoinReserveAtUsdxSwap, tokenReserve: outputTokenReserveAtUsdxSwap } = useExchangeReserves(USDXSWAP_ADDRESSES[chainId], outputCurrency)
  
  const { coinReserve: inputCoinReserveAtUsdtSwap, tokenReserve: inputTokenReserveAtUsdtSwap } = useExchangeReserves(USDTSWAP_ADDRESSES[chainId], inputCurrency)
  const { coinReserve: outputCoinReserveAtUsdtSwap, tokenReserve: outputTokenReserveAtUsdtSwap } = useExchangeReserves(USDTSWAP_ADDRESSES[chainId], outputCurrency)
  

  // get balances for each of the currency types
  const inputBalance = useAddressBalance(account, inputCurrency)
  const outputBalance = useAddressBalance(account, outputCurrency)
  const inputBalanceFormatted = !!(inputBalance && Number.isInteger(inputDecimals))
    ? amountFormatter(inputBalance, inputDecimals, Math.min(3, inputDecimals))
    : ''
  const outputBalanceFormatted = !!(outputBalance && Number.isInteger(outputDecimals))
    ? amountFormatter(outputBalance, outputDecimals, Math.min(3, outputDecimals))
    : ''

  // compute useful transforms of the data above
  const independentDecimals = independentField === INPUT ? inputDecimals : outputDecimals
  const dependentDecimals = independentField === OUTPUT ? inputDecimals : outputDecimals

  // declare/get parsed and formatted versions of input/output values
  const [independentValueParsed, setIndependentValueParsed] = useState()
  const dependentValueFormatted = !!(dependentValue && (dependentDecimals || dependentDecimals === 0))
    ? amountFormatter(dependentValue, dependentDecimals, Math.min(4, dependentDecimals), false)
    : ''
  const inputValueParsed = independentField === INPUT ? independentValueParsed : dependentValue
  const inputValueFormatted = independentField === INPUT ? independentValue : dependentValueFormatted
  const outputValueParsed = independentField === OUTPUT ? independentValueParsed : dependentValue
  const outputValueFormatted = independentField === OUTPUT ? independentValue : dependentValueFormatted

  // validate + parse independent value
  const [independentError, setIndependentError] = useState()
  useEffect(() => {
    if (independentValue && (independentDecimals || independentDecimals === 0)) {
      try {
        const parsedValue = ethers.utils.parseUnits(independentValue, independentDecimals)

        if (parsedValue.lte(ethers.constants.Zero) || parsedValue.gte(ethers.constants.MaxUint256)) {
          throw Error()
        } else {
          setIndependentValueParsed(parsedValue)
          setIndependentError(null)
        }
      } catch {
        setIndependentError(t('inputNotValid'))
      }

      return () => {
        setIndependentValueParsed()
        setIndependentError()
      }
    }
  }, [independentValue, independentDecimals, t])

  // calculate slippage from target rate
  const { minimum: dependentValueMinumum, maximum: dependentValueMaximum } = calculateSlippageBounds(
    dependentValue,
    swapType === TOKEN_TO_TOKEN,
    tokenAllowedSlippageBig,
    allowedSlippageBig
  )

  // validate input allowance + balance
  const [inputError, setInputError] = useState()
  const [showUnlock, setShowUnlock] = useState(false)
  useEffect(() => {
    const inputValueCalculation = independentField === INPUT ? independentValueParsed : dependentValueMaximum
    if (inputBalance && (inputAllowance || inputCurrency === 'ETH') && inputValueCalculation) {
      if (inputBalance.lt(inputValueCalculation)) {
        setInputError(t('insufficientBalance'))
      } else if (inputCurrency !== 'ETH' && inputAllowance.lt(inputValueCalculation)) {
        setInputError(t('unlockTokenCont'))
        setShowUnlock(true)
      } else {
        setInputError(null)
        setShowUnlock(false)
      }

      return () => {
        setInputError()
        setShowUnlock(false)
      }
    }
  }, [independentField, independentValueParsed, dependentValueMaximum, inputBalance, inputCurrency, inputAllowance, t])

  // calculate dependent value
  useEffect(() => {
    const amount = independentValueParsed

    if (amount) {
      // using USDXSwap exchange
      const swapTypeOnUsdx = getSwapType(inputCurrency, outputCurrency, chainId, USDXSWAP_ADDRESSES[chainId])
      const dependentValueOnUsdx = (
        inputCoinReserveAtUsdxSwap &&
        inputTokenReserveAtUsdxSwap &&
        outputCoinReserveAtUsdxSwap &&
        outputTokenReserveAtUsdxSwap
      )
        ? calculateDependentValue(
            amount,
            inputCoinReserveAtUsdxSwap,
            inputTokenReserveAtUsdxSwap,
            outputCoinReserveAtUsdxSwap,
            outputTokenReserveAtUsdxSwap,
            swapTypeOnUsdx,
            independentField,
          )
        : ethers.constants.Zero
        
      // using USDTSwap exchange
      const swapTypeOnUsdt = getSwapType(inputCurrency, outputCurrency, chainId, USDTSWAP_ADDRESSES[chainId])
      let dependentValueOnUsdt = (
        inputCoinReserveAtUsdtSwap &&
        inputTokenReserveAtUsdtSwap &&
        outputCoinReserveAtUsdtSwap &&
        outputTokenReserveAtUsdtSwap
      ) 
        ? calculateDependentValue(
            amount,
            inputCoinReserveAtUsdtSwap,
            inputTokenReserveAtUsdtSwap,
            outputCoinReserveAtUsdtSwap,
            outputTokenReserveAtUsdtSwap,
            swapTypeOnUsdt,
            independentField,
          )
        : ethers.constants.Zero
  
      let dependentValue
      if (independentField === INPUT) {
        if (dependentValueOnUsdx.gt(dependentValueOnUsdt)) {
          dependentValue = dependentValueOnUsdx
          setExchangeAddress(USDXSWAP_ADDRESSES[chainId])
        } else {
          dependentValue = dependentValueOnUsdt
          setExchangeAddress(USDTSWAP_ADDRESSES[chainId])
        }
      } else {
        if (dependentValueOnUsdx.lte(ethers.constants.Zero) && dependentValueOnUsdt.lte(ethers.constants.Zero)) {
          dependentValue = ethers.constants.Zero
        } else if (!dependentValueOnUsdx.lte(ethers.constants.Zero) && dependentValueOnUsdt.lte(ethers.constants.Zero)) {
          dependentValue = dependentValueOnUsdx
          setExchangeAddress(USDXSWAP_ADDRESSES[chainId])
        } else if (dependentValueOnUsdx.lte(ethers.constants.Zero) && !dependentValueOnUsdt.lte(ethers.constants.Zero)) {
          dependentValue = dependentValueOnUsdt
          setExchangeAddress(USDTSWAP_ADDRESSES[chainId])
        } else {
          if (dependentValueOnUsdx.lt(dependentValueOnUsdt)) {
            dependentValue = dependentValueOnUsdx
            setExchangeAddress(USDXSWAP_ADDRESSES[chainId])
          } else {
            dependentValue = dependentValueOnUsdt
            setExchangeAddress(USDTSWAP_ADDRESSES[chainId])
          }
        }
      }
  
      if (dependentValue.lte(ethers.constants.Zero)) {
        setIndependentError(t('insufficientLiquidity'))
      } else {
        setIndependentError(null)
        dispatchSwapState({ type: 'UPDATE_DEPENDENT', payload: dependentValue })
      }
      
      return () => {
        dispatchSwapState({ type: 'UPDATE_DEPENDENT', payload: '' })
      }
    }
  }, [chainId, independentField, independentValueParsed, inputCoinReserveAtUsdtSwap, inputCoinReserveAtUsdxSwap, inputCurrency, inputTokenReserveAtUsdtSwap, inputTokenReserveAtUsdxSwap, outputCoinReserveAtUsdtSwap, outputCoinReserveAtUsdxSwap, outputCurrency, outputTokenReserveAtUsdtSwap, outputTokenReserveAtUsdxSwap, t])

  const [inverted, setInverted] = useState(false)
  const exchangeRate = getExchangeRate(inputValueParsed, inputDecimals, outputValueParsed, outputDecimals)
  const exchangeRateInverted = getExchangeRate(inputValueParsed, inputDecimals, outputValueParsed, outputDecimals, true)

  const marketRate = exchangeAddress === USDXSWAP_ADDRESSES[chainId]
    ? getMarketRate(
        swapType,
        USDX_DECIMALS,
        inputCoinReserveAtUsdxSwap,
        inputTokenReserveAtUsdxSwap,
        inputDecimals,
        outputCoinReserveAtUsdxSwap,
        outputTokenReserveAtUsdxSwap,
        outputDecimals,
      )
    : getMarketRate(
        swapType,
        USDT_DECIMALS,
        inputCoinReserveAtUsdtSwap,
        inputTokenReserveAtUsdtSwap,
        inputDecimals,
        outputCoinReserveAtUsdtSwap,
        outputTokenReserveAtUsdtSwap,
        outputDecimals,
      )

  const percentSlippage =
    exchangeRate && marketRate
      ? exchangeRate
          .sub(marketRate)
          .abs()
          .mul(ethers.utils.bigNumberify(10).pow(ethers.utils.bigNumberify(18)))
          .div(marketRate)
          .sub(ethers.utils.bigNumberify(3).mul(ethers.utils.bigNumberify(10).pow(ethers.utils.bigNumberify(15))))
      : undefined
  const percentSlippageFormatted = percentSlippage && amountFormatter(percentSlippage, 16, 2)
  const slippageWarning =
    percentSlippage &&
    percentSlippage.gte(ethers.utils.parseEther('.05')) &&
    percentSlippage.lt(ethers.utils.parseEther('.2')) // [5% - 20%)
  const highSlippageWarning = percentSlippage && percentSlippage.gte(ethers.utils.parseEther('.2')) // [20+%

  const isValid = sending
    ? exchangeRate && inputError === null && independentError === null && recipientError === null
    : exchangeRate && inputError === null && independentError === null

  const estimatedText = `(${t('estimated')})`
  function formatBalance(value) {
    return value
  }

  async function onSwap() {
    const deadline = Math.ceil(Date.now() / 1000) + DEADLINE_FROM_NOW

    let estimate, method, args, value, comment
    if (independentField === INPUT) {
      ReactGA.event({
        category: `${swapType}`,
        action: sending ? 'TransferInput' : 'SwapInput'
      })

      if (swapType === COIN_TO_TOKEN) {
        estimate = sending ? contract.estimate.CoinToTokenTransferInput : contract.estimate.CoinToTokenSwapInput
        method = sending ? contract.CoinToTokenTransferInput : contract.CoinToTokenSwapInput
        args = sending ? [
          outputCurrency,
          independentValueParsed,
          dependentValueMinumum,
          deadline,
          recipient.address
        ] : [
          outputCurrency,
          independentValueParsed,
          dependentValueMinumum,
          deadline
        ]
        value = ethers.constants.Zero
        comment = `Swap ${inputValueFormatted} ${inputSymbol} to ${outputValueFormatted} ${outputSymbol}`
      } else if (swapType === TOKEN_TO_COIN) {
        estimate = sending ? contract.estimate.tokenToCoinTransferInput : contract.estimate.tokenToCoinSwapInput
        method = sending ? contract.tokenToCoinTransferInput : contract.tokenToCoinSwapInput
        args = sending
          ? [
              inputCurrency,
              independentValueParsed,
              dependentValueMinumum,
              deadline,
              recipient.address
            ]
          : [inputCurrency, independentValueParsed, dependentValueMinumum, deadline]
        value = ethers.constants.Zero
        comment = `Swap ${inputValueFormatted} ${inputSymbol} to ${outputValueFormatted} ${outputSymbol}`
      } else if (swapType === TOKEN_TO_TOKEN) {
        estimate = sending ? contract.estimate.tokenToTokenTransferInput : contract.estimate.tokenToTokenSwapInput
        method = sending ? contract.tokenToTokenTransferInput : contract.tokenToTokenSwapInput
        args = sending
          ? [
              inputCurrency,
              outputCurrency,
              independentValueParsed,
              dependentValueMinumum,
              deadline,
              recipient.address,
            ]
          : [
              inputCurrency,
              outputCurrency,
              independentValueParsed,
              dependentValueMinumum,
              deadline
            ]
        value = ethers.constants.Zero
        comment = `Swap ${inputValueFormatted} ${inputSymbol} to ${outputValueFormatted} ${outputSymbol}`
      }
    } else if (independentField === OUTPUT) {
      ReactGA.event({
        category: `${swapType}`,
        action: sending ? 'TransferOutput' : 'SwapOutput'
      })

      if (swapType === COIN_TO_TOKEN) {
        estimate = sending ? contract.estimate.CoinToTokenTransferOutput : contract.estimate.CoinToTokenSwapOutput
        method = sending ? contract.CoinToTokenTransferOutput : contract.CoinToTokenSwapOutput
        args = sending 
          ? [
              outputCurrency,
              independentValueParsed,
              dependentValueMaximum,
              deadline,
              recipient.address
            ] 
          : [
            outputCurrency,
            independentValueParsed,
            dependentValueMaximum,
            deadline
          ]
        value = ethers.constants.Zero
        comment = `Swap ${inputValueFormatted} ${inputSymbol} to ${outputValueFormatted} ${outputSymbol}`
      } else if (swapType === TOKEN_TO_COIN) {
        estimate = sending ? contract.estimate.tokenToCoinTransferOutput : contract.estimate.tokenToCoinSwapOutput
        method = sending ? contract.tokenToCoinTransferOutput : contract.tokenToCoinSwapOutput
        args = sending
          ? [
              inputCurrency,
              independentValueParsed,
              dependentValueMaximum,
              deadline,
              recipient.address
            ]
          : [
              inputCurrency,
              independentValueParsed,
              dependentValueMaximum,
              deadline
            ]
        value = ethers.constants.Zero
        comment = `Swap ${inputValueFormatted} ${inputSymbol} to ${outputValueFormatted} ${outputSymbol}`
      } else if (swapType === TOKEN_TO_TOKEN) {
        estimate = sending ? contract.estimate.tokenToTokenTransferOutput : contract.estimate.tokenToTokenSwapOutput
        method = sending ? contract.tokenToTokenTransferOutput : contract.tokenToTokenSwapOutput
        args = sending
          ? [
              inputCurrency,
              outputCurrency,
              independentValueParsed,
              dependentValueMaximum,
              deadline,
              recipient.address
            ]
          : [
              inputCurrency,
              outputCurrency,
              independentValueParsed,
              dependentValueMaximum,
              deadline
            ]
        value = ethers.constants.Zero
        comment = `Swap ${inputValueFormatted} ${inputSymbol} to ${outputValueFormatted} ${outputSymbol}`
      }
    }

    const estimatedGasLimit = await estimate(...args, { value })
    method(...args, { value, gasLimit: calculateGasMargin(estimatedGasLimit, GAS_MARGIN) })
      .then(response => {
        addTransaction(response, { comment })
      })
      .catch(() => {
        return false
      })
  }

  const [customSlippageError, setcustomSlippageError] = useState('')

  const allBalances = useFetchAllBalances()

  return (
    <>
      <CurrencyInputPanel
        title={t('send')}
        allBalances={allBalances}
        description={inputValueFormatted && independentField === OUTPUT ? estimatedText : ''}
        extraText={inputBalanceFormatted && formatBalance(inputBalanceFormatted)}
        extraTextClickHander={() => {
          if (inputBalance && inputDecimals) {
            const valueToSet = inputCurrency === 'ETH' ? inputBalance.sub(ethers.utils.parseEther('.1')) : inputBalance
            if (valueToSet.gt(ethers.constants.Zero)) {
              dispatchSwapState({
                type: 'UPDATE_INDEPENDENT',
                payload: { value: amountFormatter(valueToSet, inputDecimals, inputDecimals, false), field: INPUT }
              })
            }
          }
        }}
        onCurrencySelected={inputCurrency => {
          dispatchSwapState({ type: 'SELECT_CURRENCY', payload: { currency: inputCurrency, field: INPUT } })
        }}
        onValueChange={inputValue => {
          dispatchSwapState({ type: 'UPDATE_INDEPENDENT', payload: { value: inputValue, field: INPUT } })
        }}
        showUnlock={showUnlock}
        selectedTokenAddress={inputCurrency}
        selectedTokenExchangeAddress={exchangeAddress}
        value={inputValueFormatted}
        errorMessage={inputError ? inputError : independentField === INPUT ? independentError : ''}
        backgroundColor='linear-gradient(90deg,rgba(58,129,255,1),rgba(36,115,255,1))'
        inputBackgroundColor='#1460E8'
      />
      <OversizedPanel>
        <DownArrowBackground>
          <SwapArrow
            onClick={() => {
              dispatchSwapState({ type: 'FLIP_INDEPENDENT' })
            }}
            clickable
            alt="swap"
            active={isValid}
          />
        </DownArrowBackground>
      </OversizedPanel>
      <CurrencyInputPanel
        title={t('receive')}
        allBalances={allBalances}
        description={outputValueFormatted && independentField === INPUT ? estimatedText : ''}
        extraText={outputBalanceFormatted && formatBalance(outputBalanceFormatted)}
        onCurrencySelected={outputCurrency => {
          dispatchSwapState({ type: 'SELECT_CURRENCY', payload: { currency: outputCurrency, field: OUTPUT } })
        }}
        onValueChange={outputValue => {
          dispatchSwapState({ type: 'UPDATE_INDEPENDENT', payload: { value: outputValue, field: OUTPUT } })
        }}
        selectedTokenAddress={outputCurrency}
        selectedTokenExchangeAddress={exchangeAddress}
        value={outputValueFormatted}
        errorMessage={independentField === OUTPUT ? independentError : ''}
        disableUnlock
        backgroundColor='linear-gradient(90deg,rgba(251,152,54,1),rgba(254,148,44,1))'
        inputBackgroundColor='#ED7C0E'
        renderExchangeRate={() => (
          <ExchangeRateWrapper
            onClick={() => {
              setInverted(inverted => !inverted)
            }}
          >
            {inverted ? (
              <span>
                {exchangeRate && `1 ${inputSymbol} = ${amountFormatter(exchangeRate, 18, 4, false)} ${outputSymbol}`}
              </span>
            ) : (
              <span>
                {exchangeRate && `1 ${outputSymbol} = ${amountFormatter(exchangeRateInverted, 18, 4, false)} ${inputSymbol}`}
              </span>
            )}
          </ExchangeRateWrapper>
        )}
      />
      <AddressInputPanel sending={sending} onCheckSending={() => { setSending(!sending) }} onChange={setRecipient} onError={setRecipientError} />
      <TransactionDetails
        account={account}
        setRawSlippage={setRawSlippage}
        setRawTokenSlippage={setRawTokenSlippage}
        rawSlippage={rawSlippage}
        slippageWarning={slippageWarning}
        highSlippageWarning={highSlippageWarning}
        inputError={inputError}
        independentError={independentError}
        inputCurrency={inputCurrency}
        outputCurrency={outputCurrency}
        independentValue={independentValue}
        independentValueParsed={independentValueParsed}
        independentField={independentField}
        INPUT={INPUT}
        inputValueParsed={inputValueParsed}
        outputValueParsed={outputValueParsed}
        inputSymbol={inputSymbol}
        outputSymbol={outputSymbol}
        inputDecimals={inputDecimals}
        outputDecimals={outputDecimals}
        dependentValueMinumum={dependentValueMinumum}
        dependentValueMaximum={dependentValueMaximum}
        dependentDecimals={dependentDecimals}
        independentDecimals={independentDecimals}
        percentSlippageFormatted={percentSlippageFormatted}
        setcustomSlippageError={setcustomSlippageError}
        recipientAddress={recipient.address}
        sending={sending}
      />
      <Flex>
        <Button
          disabled={!isValid || customSlippageError === 'invalid' || hasPendingTransaction}
          onClick={onSwap}
          warning={highSlippageWarning || customSlippageError === 'warning'}
        >
          {
            hasPendingTransaction
              ? t('pending')
              : sending
                ? highSlippageWarning || customSlippageError === 'warning'
                  ? t('sendAnyway')
                  : t('send')
                : highSlippageWarning || customSlippageError === 'warning'
                  ? t('swapAnyway')
                  : t('swap')
          }
        </Button>
      </Flex>
      <TransactionHistory />
    </>
  )
}
