import React, { useState, useReducer, useEffect } from 'react'
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
import { useWeb3React, useSimpleSwapContract } from '../../hooks'
import { useTokenDetails, useAllTokenDetails } from '../../contexts/Tokens'
import { useTransactionAdder, useHasPendingTransaction } from '../../contexts/Transactions'
import { useAddressBalance } from '../../contexts/Balances'
import { useSimpleSwapReserveOf } from '../../contexts/SimpleSwap'
import { useFetchAllBalances } from '../../contexts/AllBalances'
import { useAddressAllowance } from '../../contexts/Allowances'
import { SIMPLESWAP_ADDRESSES, USDX_ADDRESSES } from '../../constants'

const INPUT = 0
const OUTPUT = 1

const USDX_TO_TOKEN = 0
const TOKEN_TO_USDX = 1
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

function getSwapType(inputCurrency, outputCurrency, chainId) {
  if (!inputCurrency || !outputCurrency) {
    return null
  } else if (inputCurrency === USDX_ADDRESSES[chainId]) {
    return USDX_TO_TOKEN
  } else if (outputCurrency === USDX_ADDRESSES[chainId]) {
    return TOKEN_TO_USDX
  } else {
    return TOKEN_TO_TOKEN
  }
}

// this mocks the getInputPrice function, and calculates the required output
function calculateUSDXTokenOutputFromInput(inputAmount, inputReserve, outputReserve) {
  const inputAmountWithFee = inputAmount.mul(ethers.utils.bigNumberify(997))
  const numerator = inputAmountWithFee.mul(outputReserve)
  const denominator = inputReserve.mul(ethers.utils.bigNumberify(1000)).add(inputAmountWithFee)
  return numerator.div(denominator)
}

// this mocks the getOutputPrice function, and calculates the required input
function calculateUSDXTokenInputFromOutput(outputAmount, inputReserve, outputReserve) {
  const numerator = inputReserve.mul(outputAmount).mul(ethers.utils.bigNumberify(1000))
  const denominator = outputReserve.sub(outputAmount).mul(ethers.utils.bigNumberify(997))
  return numerator.div(denominator).add(ethers.constants.One)
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
  inputReserveUSDX,
  inputReserveToken,
  inputDecimals,
  outputReserveUSDX,
  outputReserveToken,
  outputDecimals,
  invert = false
) {
  if (swapType === USDX_TO_TOKEN) {
    return getExchangeRate(outputReserveUSDX, 18, outputReserveToken, outputDecimals, invert)
  } else if (swapType === TOKEN_TO_USDX) {
    return getExchangeRate(inputReserveToken, inputDecimals, inputReserveUSDX, 18, invert)
  } else if (swapType === TOKEN_TO_TOKEN) {
    const factor = ethers.utils.bigNumberify(10).pow(ethers.utils.bigNumberify(18))
    const firstRate = getExchangeRate(inputReserveToken, inputDecimals, inputReserveUSDX, 18)
    const secondRate = getExchangeRate(outputReserveUSDX, 18, outputReserveToken, outputDecimals)
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

  // get swap type from the currency types
  const swapType = getSwapType(inputCurrency, outputCurrency, chainId)

  // get decimals and exchange address for each of the currency types
  const { symbol: inputSymbol, decimals: inputDecimals } = useTokenDetails(
    inputCurrency
  )
  const { symbol: outputSymbol, decimals: outputDecimals } = useTokenDetails(
    outputCurrency
  )

  const contract = useSimpleSwapContract()

  // get input allowance
  const inputAllowance = useAddressAllowance(account, inputCurrency, SIMPLESWAP_ADDRESSES[chainId])

  // fetch reserves for each of the currency types
  const { reserveUSDX: inputReserveUSDX, reserveToken: inputReserveToken } = useSimpleSwapReserveOf(inputCurrency)
  const { reserveUSDX: outputReserveUSDX, reserveToken: outputReserveToken } = useSimpleSwapReserveOf(outputCurrency)
  const realTokenReserve = useAddressBalance(SIMPLESWAP_ADDRESSES[chainId], outputCurrency)

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

  // validate output reserve
  const [outputError, setOutputError] = useState()
  useEffect(() => {
    const outputValueCalculation = independentField === INPUT ? dependentValueMaximum : independentValueParsed
    if (realTokenReserve && outputValueCalculation && realTokenReserve.lt(outputValueCalculation)) {
      setOutputError(t('insufficientReserve'))
    } else {
      setOutputError(null)
    }

    return () => {
      setOutputError()
    }
  }, [dependentValueMaximum, independentField, independentValueParsed, realTokenReserve, t])

  // calculate dependent value
  useEffect(() => {
    const amount = independentValueParsed

    if (swapType === USDX_TO_TOKEN) {
      const reserveUSDX = outputReserveUSDX
      const reserveToken = outputReserveToken

      if (amount && reserveUSDX && reserveToken) {
        try {
          const calculatedDependentValue =
            independentField === INPUT
              ? calculateUSDXTokenOutputFromInput(amount, reserveUSDX, reserveToken)
              : calculateUSDXTokenInputFromOutput(amount, reserveUSDX, reserveToken)

          if (calculatedDependentValue.lte(ethers.constants.Zero)) {
            throw Error()
          }

          dispatchSwapState({ type: 'UPDATE_DEPENDENT', payload: calculatedDependentValue })
        } catch {
          setIndependentError(t('insufficientLiquidity'))
        }
        return () => {
          dispatchSwapState({ type: 'UPDATE_DEPENDENT', payload: '' })
        }
      }
    } else if (swapType === TOKEN_TO_USDX) {
      const reserveUSDX = inputReserveUSDX
      const reserveToken = inputReserveToken

      if (amount && reserveUSDX && reserveToken) {
        try {
          const calculatedDependentValue =
            independentField === INPUT
              ? calculateUSDXTokenOutputFromInput(amount, reserveToken, reserveUSDX)
              : calculateUSDXTokenInputFromOutput(amount, reserveToken, reserveUSDX)

          if (calculatedDependentValue.lte(ethers.constants.Zero)) {
            throw Error()
          }

          dispatchSwapState({ type: 'UPDATE_DEPENDENT', payload: calculatedDependentValue })
        } catch {
          setIndependentError(t('insufficientLiquidity'))
        }
        return () => {
          dispatchSwapState({ type: 'UPDATE_DEPENDENT', payload: '' })
        }
      }
    } else if (swapType === TOKEN_TO_TOKEN) {
      const reserveUSDXFirst = inputReserveUSDX
      const reserveTokenFirst = inputReserveToken

      const reserveUSDXSecond = outputReserveUSDX
      const reserveTokenSecond = outputReserveToken

      if (amount && reserveUSDXFirst && reserveTokenFirst && reserveUSDXSecond && reserveTokenSecond) {
        try {
          if (independentField === INPUT) {
            const intermediateValue = calculateUSDXTokenOutputFromInput(amount, reserveTokenFirst, reserveUSDXFirst)
            if (intermediateValue.lte(ethers.constants.Zero)) {
              throw Error()
            }
            const calculatedDependentValue = calculateUSDXTokenOutputFromInput(
              intermediateValue,
              reserveUSDXSecond,
              reserveTokenSecond
            )
            if (calculatedDependentValue.lte(ethers.constants.Zero)) {
              throw Error()
            }
            dispatchSwapState({ type: 'UPDATE_DEPENDENT', payload: calculatedDependentValue })
          } else {
            const intermediateValue = calculateUSDXTokenInputFromOutput(amount, reserveUSDXSecond, reserveTokenSecond)
            if (intermediateValue.lte(ethers.constants.Zero)) {
              throw Error()
            }
            const calculatedDependentValue = calculateUSDXTokenInputFromOutput(
              intermediateValue,
              reserveTokenFirst,
              reserveUSDXFirst
            )
            if (calculatedDependentValue.lte(ethers.constants.Zero)) {
              throw Error()
            }
            dispatchSwapState({ type: 'UPDATE_DEPENDENT', payload: calculatedDependentValue })
          }
        } catch {
          setIndependentError(t('insufficientLiquidity'))
        }
        return () => {
          dispatchSwapState({ type: 'UPDATE_DEPENDENT', payload: '' })
        }
      }
    }
  }, [
    independentValueParsed,
    swapType,
    outputReserveUSDX,
    outputReserveToken,
    inputReserveUSDX,
    inputReserveToken,
    independentField,
    t
  ])

  const [inverted, setInverted] = useState(false)
  const exchangeRate = getExchangeRate(inputValueParsed, inputDecimals, outputValueParsed, outputDecimals)
  const exchangeRateInverted = getExchangeRate(inputValueParsed, inputDecimals, outputValueParsed, outputDecimals, true)

  const marketRate = getMarketRate(
    swapType,
    inputReserveUSDX,
    inputReserveToken,
    inputDecimals,
    outputReserveUSDX,
    outputReserveToken,
    outputDecimals
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
    ? exchangeRate && inputError === null && outputError === null && independentError === null && recipientError === null
    : exchangeRate && inputError === null && outputError === null && independentError === null

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

      if (swapType === USDX_TO_TOKEN) {
        estimate = sending ? contract.estimate.USDXToTokenTransferInput : contract.estimate.USDXToTokenSwapInput
        method = sending ? contract.USDXToTokenTransferInput : contract.USDXToTokenSwapInput
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
        comment = `Swap ${inputValueFormatted} USDx to ${outputValueFormatted} ${outputSymbol}`
      } else if (swapType === TOKEN_TO_USDX) {
        estimate = sending ? contract.estimate.tokenToUSDXTransferInput : contract.estimate.tokenToUSDXSwapInput
        method = sending ? contract.tokenToUSDXTransferInput : contract.tokenToUSDXSwapInput
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
        comment = `Swap ${inputValueFormatted} ${inputSymbol} to ${outputValueFormatted} USDx`
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

      if (swapType === USDX_TO_TOKEN) {
        estimate = sending ? contract.estimate.USDXToTokenTransferOutput : contract.estimate.USDXToTokenSwapOutput
        method = sending ? contract.USDXToTokenTransferOutput : contract.USDXToTokenSwapOutput
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
        comment = `Swap ${inputValueFormatted} USDx to ${outputValueFormatted} ${outputSymbol}`
      } else if (swapType === TOKEN_TO_USDX) {
        estimate = sending ? contract.estimate.tokenToUSDXTransferOutput : contract.estimate.tokenToUSDXSwapOutput
        method = sending ? contract.tokenToUSDXTransferOutput : contract.tokenToUSDXSwapOutput
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
        comment = `Swap ${inputValueFormatted} ${inputSymbol} to ${outputValueFormatted} USDx`
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
        outputError={outputError}
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
