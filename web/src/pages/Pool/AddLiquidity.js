import React, { useReducer, useState, useCallback, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useWeb3Context } from 'web3-react'
import { ethers } from 'ethers'
import ReactGA from 'react-ga'
import styled from 'styled-components'
import { transparentize } from 'polished'

import { Button } from '../../theme'
import CurrencyInputPanel from '../../components/CurrencyInputPanel'
import OversizedPanel from '../../components/OversizedPanel'
import ContextualInfo from '../../components/ContextualInfo'
import { ReactComponent as Plus } from '../../assets/images/plus-blue.svg'

import { useSimpleSwapContract } from '../../hooks'
import { amountFormatter, calculateGasMargin } from '../../utils'
import { useTransactionAdder } from '../../contexts/Transactions'
import { useTokenDetails } from '../../contexts/Tokens'
import { useFetchAllBalances } from '../../contexts/AllBalances'
import { useAddressBalance } from '../../contexts/Balances'
import { useAddressAllowance } from '../../contexts/Allowances'
import { useSimpleSwapReserveOf, useSimpleSwapBalanceOf } from '../../contexts/SimpleSwap'
import { SIMPLESWAP_ADDRESSES, USDX_ADDRESSES } from '../../constants'

const INPUT = 0
const OUTPUT = 1

// denominated in bips
const ALLOWED_SLIPPAGE = ethers.utils.bigNumberify(200)

// denominated in seconds
const DEADLINE_FROM_NOW = 60 * 15

// denominated in bips
const GAS_MARGIN = ethers.utils.bigNumberify(1000)

const Row = styled.div`
  ${({ theme }) => theme.flexRowNoWrap};
  > *:not(:first-child) {
    margin-left: 24px;
  }
`

const DataPanel = styled.div`
  width: 100%;
  flex: 1;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  font-size: 1rem;
  background-color: ${({ theme }) => theme.white};
  border: 1px solid ${({ theme }) => theme.borderColor};
  box-shadow: 0 0px 36px 0 ${({ theme }) => transparentize(0.9, theme.shadowColor)};

  > *:not(:first-child) {
    margin-top: 1.5rem;
  }

  > .title {
    color: rgba(0, 0, 0, 0.6);
    font-weight: 300;
  }

  > .value {
    color: ${({ theme }) => theme.textBlack};
    font-weight: 500;
  }
`

const BlueSpan = styled.span`
  color: ${({ theme }) => theme.royalBlue};
`

const NewExchangeWarning = styled.div`
  margin-top: 1rem;
  padding: 1rem;
  margin-bottom: 2rem;
  border: 1px solid rgba($pizazz-orange, 0.4);
  background-color: rgba($pizazz-orange, 0.1);
  border-radius: 1rem;
`

const NewExchangeWarningText = styled.div`
  font-size: 0.75rem;
  line-height: 1rem;
  text-align: center;

  :first-child {
    padding-bottom: 0.3rem;
    font-weight: 500;
  }
`

const LastSummaryText = styled.div`
  margin-top: 1rem;
`

const DownArrowBackground = styled.div`
  ${({ theme }) => theme.flexRowNoWrap}
  justify-content: center;
  align-items: center;
`
const SummaryPanel = styled.div`
  ${({ theme }) => theme.flexColumnNoWrap}
  padding: 1rem 0;
`

const ExchangeRateWrapper = styled.div`
  ${({ theme }) => theme.flexRowNoWrap};
  align-items: center;
  color: ${({ theme }) => theme.doveGray};
  font-size: 0.75rem;
`

const Flex = styled.div`
  display: flex;
  justify-content: center;
  padding: 2rem;

  button {
    max-width: 20rem;
  }
`

const WrappedPlus = ({ isError, highSlippageWarning, ...rest }) => <Plus {...rest} />
const ColoredWrappedPlus = styled(WrappedPlus)`
  width: 0.625rem;
  height: 0.625rem;
  position: relative;
  padding: 0.875rem;
  box-sizing: content-box;
  path {
    stroke: ${({ active, theme }) => (active ? theme.royalBlue : theme.chaliceGray)};
  }
`

function calculateSlippageBounds(value) {
  if (value) {
    const offset = value.mul(ALLOWED_SLIPPAGE).div(ethers.utils.bigNumberify(10000))
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

const initialAddLiquidityState = {
  inputValue: '',
  outputValue: '',
  lastEditedField: INPUT,
  outputCurrency: ''
}

function addLiquidityStateReducer(state, action) {
  switch (action.type) {
    case 'SELECT_CURRENCY': {
      return {
        ...state,
        outputCurrency: action.payload
      }
    }
    case 'UPDATE_VALUE': {
      const { inputValue, outputValue } = state
      const { field, value } = action.payload
      return {
        ...state,
        inputValue: field === INPUT ? value : inputValue,
        outputValue: field === OUTPUT ? value : outputValue,
        lastEditedField: field
      }
    }
    case 'UPDATE_DEPENDENT_VALUE': {
      const { inputValue, outputValue } = state
      const { field, value } = action.payload
      return {
        ...state,
        inputValue: field === INPUT ? value : inputValue,
        outputValue: field === OUTPUT ? value : outputValue
      }
    }
    default: {
      return initialAddLiquidityState
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

function getMarketRate(reserveUSDX, reserveToken, decimals, invert = false) {
  return getExchangeRate(reserveUSDX, 18, reserveToken, decimals, invert)
}

export default function AddLiquidity() {
  const { t } = useTranslation()
  const { library, active, account, networkId } = useWeb3Context()

  const [addLiquidityState, dispatchAddLiquidityState] = useReducer(addLiquidityStateReducer, initialAddLiquidityState)
  const { inputValue, outputValue, lastEditedField, outputCurrency } = addLiquidityState
  const inputCurrency = USDX_ADDRESSES[networkId]

  const [inputValueParsed, setInputValueParsed] = useState()
  const [outputValueParsed, setOutputValueParsed] = useState()
  const [inputError, setInputError] = useState()
  const [outputError, setOutputError] = useState()

  const { symbol, decimals } = useTokenDetails(outputCurrency)
  const exchangeContract = useSimpleSwapContract()

  const [totalPoolTokens, setTotalPoolTokens] = useState()
  const fetchPoolTokens = useCallback(() => {
    if (exchangeContract) {
      exchangeContract.totalSupply(ethers.utils.bigNumberify(outputCurrency)).then(totalSupply => {
        setTotalPoolTokens(totalSupply)
      })
    }
  }, [exchangeContract, outputCurrency])
  useEffect(() => {
    fetchPoolTokens()
    library.on('block', fetchPoolTokens)

    return () => {
      library.removeListener('block', fetchPoolTokens)
    }
  }, [fetchPoolTokens, library])

  const poolTokenBalance = useSimpleSwapBalanceOf(account, outputCurrency)

  const { reserveUSDX: exchangeUSDXBalance, reserveToken: exchangeTokenBalance } = useSimpleSwapReserveOf(outputCurrency)
  const isNewExchange = !!(exchangeUSDXBalance && exchangeTokenBalance && exchangeUSDXBalance.isZero() && exchangeTokenBalance.isZero())

  // 18 decimals
  const poolTokenPercentage =
    poolTokenBalance && totalPoolTokens && isNewExchange === false && !totalPoolTokens.isZero()
      ? poolTokenBalance.mul(ethers.utils.bigNumberify(10).pow(ethers.utils.bigNumberify(18))).div(totalPoolTokens)
      : undefined
  const USDXShare =
    exchangeUSDXBalance && poolTokenPercentage
      ? exchangeUSDXBalance
          .mul(poolTokenPercentage)
          .div(ethers.utils.bigNumberify(10).pow(ethers.utils.bigNumberify(18)))
      : undefined
  const tokenShare =
    exchangeTokenBalance && poolTokenPercentage
      ? exchangeTokenBalance
          .mul(poolTokenPercentage)
          .div(ethers.utils.bigNumberify(10).pow(ethers.utils.bigNumberify(18)))
      : undefined

  const liquidityMinted = isNewExchange
    ? inputValueParsed
    : totalPoolTokens && inputValueParsed && exchangeUSDXBalance && !exchangeUSDXBalance.isZero()
    ? totalPoolTokens.mul(inputValueParsed).div(exchangeUSDXBalance)
    : undefined

  // user balances
  const inputBalance = useAddressBalance(account, inputCurrency)
  const outputBalance = useAddressBalance(account, outputCurrency)

  const USDXPerLiquidityToken =
    exchangeUSDXBalance && totalPoolTokens && isNewExchange === false && !totalPoolTokens.isZero()
      ? exchangeUSDXBalance.mul(ethers.utils.bigNumberify(10).pow(ethers.utils.bigNumberify(18))).div(totalPoolTokens)
      : undefined
  const tokenPerLiquidityToken =
    exchangeTokenBalance && totalPoolTokens && isNewExchange === false && !totalPoolTokens.isZero()
      ? exchangeTokenBalance.mul(ethers.utils.bigNumberify(10).pow(ethers.utils.bigNumberify(18))).div(totalPoolTokens)
      : undefined

  const outputValueMax = outputValueParsed && calculateSlippageBounds(outputValueParsed).maximum
  const liquidityTokensMin = liquidityMinted && calculateSlippageBounds(liquidityMinted).minimum

  const marketRate = useMemo(() => {
    return getMarketRate(exchangeUSDXBalance, exchangeTokenBalance, decimals)
  }, [exchangeUSDXBalance, exchangeTokenBalance, decimals])
  const marketRateInverted = useMemo(() => {
    return getMarketRate(exchangeUSDXBalance, exchangeTokenBalance, decimals, true)
  }, [exchangeUSDXBalance, exchangeTokenBalance, decimals])

  function renderTransactionDetails() {
    ReactGA.event({
      category: 'TransactionDetail',
      action: 'Open'
    })

    const b = text => <BlueSpan>{text}</BlueSpan>

    if (isNewExchange) {
      return (
        <div>
          <div>
            {t('youAreAdding')} {b(`${inputValue} USDX`)} {t('and')} {b(`${outputValue} ${symbol}`)} {t('intoPool')}
          </div>
          <LastSummaryText>
            {t('youAreSettingExRate')}{' '}
            {b(
              `1 USDX = ${amountFormatter(
                getMarketRate(inputValueParsed, outputValueParsed, decimals),
                18,
                4,
                false
              )} ${symbol}`
            )}
            .
          </LastSummaryText>
          <LastSummaryText>
            {t('youWillMint')} {b(`${inputValue}`)} {t('liquidityTokens')}
          </LastSummaryText>
          <LastSummaryText>{t('totalSupplyIs0')}</LastSummaryText>
        </div>
      )
    } else {
      return (
        <>
          <div>
            {t('youAreAdding')} {b(`${amountFormatter(inputValueParsed, 18, 4)} USDX`)} {t('and')} {'at most'}{' '}
            {b(`${amountFormatter(outputValueMax, decimals, Math.min(decimals, 4))} ${symbol}`)} {t('intoPool')}
          </div>
          <LastSummaryText>
            {t('youWillMint')} {b(amountFormatter(liquidityMinted, 18, 4))} {t('liquidityTokens')}
          </LastSummaryText>
          <LastSummaryText>
            {t('totalSupplyIs')} {b(amountFormatter(totalPoolTokens, 18, 4))}
          </LastSummaryText>
          <LastSummaryText>
            {t('tokenWorth')} {b(amountFormatter(USDXPerLiquidityToken, 18, 4))} USDX {t('and')}{' '}
            {b(amountFormatter(tokenPerLiquidityToken, decimals, Math.min(decimals, 4)))} {symbol}
          </LastSummaryText>
        </>
      )
    }
  }

  function renderSummary() {
    let contextualInfo = ''
    let isError = false

    if (inputError || outputError) {
      contextualInfo = inputError || outputError
      isError = true
    } else if (!inputCurrency || !outputCurrency) {
      contextualInfo = t('selectTokenCont')
    } else if (!inputValue) {
      contextualInfo = t('enterValueCont')
    } else if (!account) {
      contextualInfo = t('noWallet')
      isError = true
    }

    return (
      <ContextualInfo
        openDetailsText={t('transactionDetails')}
        closeDetailsText={t('hideDetails')}
        contextualInfo={contextualInfo}
        isError={isError}
        renderTransactionDetails={renderTransactionDetails}
      />
    )
  }

  const addTransaction = useTransactionAdder()

  async function onAddLiquidity() {
    ReactGA.event({
      category: 'Pool',
      action: 'AddLiquidity'
    })

    const deadline = Math.ceil(Date.now() / 1000) + DEADLINE_FROM_NOW

    const estimatedGasLimit = await exchangeContract.estimate.addLiquidity(
      outputCurrency,
      inputValueParsed,
      isNewExchange ? ethers.constants.Zero : liquidityTokensMin,
      isNewExchange ? outputValueParsed : outputValueMax,
      deadline
    )

    const gasLimit = calculateGasMargin(estimatedGasLimit, GAS_MARGIN)

    exchangeContract.addLiquidity(
      outputCurrency,
      inputValueParsed,
      isNewExchange ? ethers.constants.Zero : liquidityTokensMin,
      isNewExchange ? outputValueParsed : outputValueMax,
      deadline,
      { gasLimit }
    )
    .then(response => {
      addTransaction(response)
    })
  }

  function formatBalance(value) {
    return `Balance: ${value}`
  }

  useEffect(() => {
    if (isNewExchange) {
      if (inputValue) {
        const parsedInputValue = ethers.utils.parseUnits(inputValue, 18)
        setInputValueParsed(parsedInputValue)
      }

      if (outputValue) {
        const parsedOutputValue = ethers.utils.parseUnits(outputValue, decimals)
        setOutputValueParsed(parsedOutputValue)
      }
    }
  }, [decimals, inputValue, isNewExchange, outputValue])

  // parse input value
  useEffect(() => {
    if (
      isNewExchange === false &&
      inputValue &&
      marketRate &&
      lastEditedField === INPUT &&
      (decimals || decimals === 0)
    ) {
      try {
        const parsedValue = ethers.utils.parseUnits(inputValue, 18)

        if (parsedValue.lte(ethers.constants.Zero) || parsedValue.gte(ethers.constants.MaxUint256)) {
          throw Error()
        }

        setInputValueParsed(parsedValue)
        const currencyAmount = marketRate
          .mul(parsedValue)
          .div(ethers.utils.bigNumberify(10).pow(ethers.utils.bigNumberify(18)))
          .div(ethers.utils.bigNumberify(10).pow(ethers.utils.bigNumberify(18 - decimals)))
        
        setOutputValueParsed(currencyAmount)
        dispatchAddLiquidityState({
          type: 'UPDATE_DEPENDENT_VALUE',
          payload: { field: OUTPUT, value: amountFormatter(currencyAmount, decimals, Math.min(decimals, 4), false) }
        })

        return () => {
          setOutputError()
          setInputValueParsed()
          setOutputValueParsed()
          dispatchAddLiquidityState({
            type: 'UPDATE_DEPENDENT_VALUE',
            payload: { field: OUTPUT, value: '' }
          })
        }
      } catch {
        setOutputError(t('inputNotValid'))
      }
    }
  }, [inputValue, isNewExchange, lastEditedField, marketRate, decimals, t])

  // parse output value
  useEffect(() => {
    if (
      isNewExchange === false &&
      outputValue &&
      marketRateInverted &&
      lastEditedField === OUTPUT &&
      (decimals || decimals === 0)
    ) {
      try {
        const parsedValue = ethers.utils.parseUnits(outputValue, decimals)

        if (parsedValue.lte(ethers.constants.Zero) || parsedValue.gte(ethers.constants.MaxUint256)) {
          throw Error()
        }

        setOutputValueParsed(parsedValue)

        const currencyAmount = marketRateInverted
          .mul(parsedValue)
          .div(ethers.utils.bigNumberify(10).pow(ethers.utils.bigNumberify(decimals)))

        setInputValueParsed(currencyAmount)
        dispatchAddLiquidityState({
          type: 'UPDATE_DEPENDENT_VALUE',
          payload: { field: INPUT, value: amountFormatter(currencyAmount, 18, 4, false) }
        })

        return () => {
          setInputError()
          setOutputValueParsed()
          setInputValueParsed()
          dispatchAddLiquidityState({
            type: 'UPDATE_DEPENDENT_VALUE',
            payload: { field: INPUT, value: '' }
          })
        }
      } catch {
        setInputError(t('inputNotValid'))
      }
    }
  }, [outputValue, isNewExchange, lastEditedField, marketRateInverted, decimals, t])

  // input validation
  useEffect(() => {
    if (inputValueParsed && inputBalance) {
      if (inputValueParsed.gt(inputBalance)) {
        setInputError(t('insufficientBalance'))
      } else {
        setInputError(null)
      }
    }

    if (outputValueMax && outputBalance) {
      if (outputValueMax.gt(outputBalance)) {
        setOutputError(t('insufficientBalance'))
      } else {
        setOutputError(null)
      }
    }
  }, [inputValueParsed, inputBalance, outputValueMax, outputBalance, t])

  const USDXAllowance = useAddressAllowance(account, USDX_ADDRESSES[networkId], SIMPLESWAP_ADDRESSES[networkId])
  const [showUSDXUnlock, setShowUSDXUnlock] = useState(false)
  useEffect(() => {
    if (inputValueParsed && USDXAllowance) {
      if (USDXAllowance.lt(inputValueParsed)) {
        setInputError(t('unlockTokenCont'))
        setShowUSDXUnlock(true)
      }
      return () => {
        setInputError()
        setShowUSDXUnlock(false)
      }
    }
  }, [inputValueParsed, USDXAllowance, t])

  const allowance = useAddressAllowance(account, outputCurrency, SIMPLESWAP_ADDRESSES[networkId])
  const [showUnlock, setShowUnlock] = useState(false)
  useEffect(() => {
    if (outputValueParsed && allowance) {
      if (allowance.lt(outputValueParsed)) {
        setOutputError(t('unlockTokenCont'))
        setShowUnlock(true)
      }
      return () => {
        setOutputError()
        setShowUnlock(false)
      }
    }
  }, [outputValueParsed, allowance, t])

  const isActive = active && account
  const isValid = (inputError === null || outputError === null) && !showUnlock

  const allBalances = useFetchAllBalances()

  return (
    <>
      {isNewExchange ? (
        <NewExchangeWarning>
          <NewExchangeWarningText>
            <span role="img" aria-label="first-liquidity">
              🚰
            </span>{' '}
            {t('firstLiquidity')}
          </NewExchangeWarningText>
          <NewExchangeWarningText>{t('initialExchangeRate', { symbol })}</NewExchangeWarningText>
        </NewExchangeWarning>
      ) : null}

      <CurrencyInputPanel
        title={t('deposit')}
        allBalances={allBalances}
        extraText={inputBalance && formatBalance(amountFormatter(inputBalance, 18, 4))}
        onValueChange={inputValue => {
          dispatchAddLiquidityState({ type: 'UPDATE_VALUE', payload: { value: inputValue, field: INPUT } })
        }}
        selectedTokenAddress={USDX_ADDRESSES[networkId]}
        value={inputValue}
        showUnlock={showUSDXUnlock}
        errorMessage={inputError}
        disableTokenSelect
      />
      <OversizedPanel>
        <DownArrowBackground>
          <ColoredWrappedPlus active={isActive} alt="plus" />
        </DownArrowBackground>
      </OversizedPanel>
      <CurrencyInputPanel
        title={t('deposit')}
        allBalances={allBalances}
        description={isNewExchange ? '' : outputValue ? `(${t('estimated')})` : ''}
        extraText={outputBalance && formatBalance(amountFormatter(outputBalance, decimals, Math.min(decimals, 4)))}
        selectedTokenAddress={outputCurrency}
        onCurrencySelected={outputCurrency => {
          dispatchAddLiquidityState({ type: 'SELECT_CURRENCY', payload: outputCurrency })
        }}
        onValueChange={outputValue => {
          dispatchAddLiquidityState({ type: 'UPDATE_VALUE', payload: { value: outputValue, field: OUTPUT } })
        }}
        value={outputValue}
        showUnlock={showUnlock}
        errorMessage={outputError}
        renderExchangeRate={() => (
          <ExchangeRateWrapper>
            <span>{marketRate ? `1 USDX = ${amountFormatter(marketRate, 18, 4)} ${symbol}` : ' - '}</span>
          </ExchangeRateWrapper>
        )}
      />
      <OversizedPanel hideBottom>
        <SummaryPanel></SummaryPanel>
      </OversizedPanel>
      <Row>
        <DataPanel>
          <div className="title">{t('currentPoolSize')}</div>
          <div className="value">
            {exchangeUSDXBalance && exchangeTokenBalance
              ? `${amountFormatter(exchangeUSDXBalance, 18, 4)} USDX + ${amountFormatter(
                  exchangeTokenBalance,
                  decimals,
                  Math.min(4, decimals)
                )} ${symbol}`
              : ' - '}
          </div>
        </DataPanel>
        <DataPanel>
          <div className="title">{t('yourPoolShare')} ({exchangeUSDXBalance && amountFormatter(poolTokenPercentage, 16, 2)}%)</div>
          <div className="value">
            {USDXShare && tokenShare
              ? `${amountFormatter(USDXShare, 18, 4)} USDX + ${amountFormatter(
                  tokenShare,
                  decimals,
                  Math.min(4, decimals)
                )} ${symbol}`
              : ' - '}
          </div>
        </DataPanel>
      </Row>
      {renderSummary()}
      <Flex>
        <Button disabled={!isValid} onClick={onAddLiquidity}>
          {t('addLiquidity')}
        </Button>
      </Flex>
    </>
  )
}
