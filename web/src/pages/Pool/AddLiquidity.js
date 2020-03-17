import React, { useReducer, useState, useCallback, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ethers } from 'ethers'
import ReactGA from 'react-ga'
import styled from 'styled-components'
import { transparentize } from 'polished'

import { Button } from '../../theme'
import CurrencyInputPanel from '../../components/CurrencyInputPanel'
import OversizedPanel from '../../components/OversizedPanel'
import ContextualInfo from '../../components/ContextualInfo'
import TransactionHistory from '../../components/TransactionHistory'
import { ReactComponent as Plus } from '../../assets/images/plus-blue.svg'
import { ReactComponent as Trade } from '../../assets/images/trade.svg'

import { useWeb3React, useSimpleSwapContract } from '../../hooks'
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
  padding: 0.5rem;
  
  > *:not(:first-child) {
    margin-left: 24px;
  }
`

const DataPanel = styled.div`
  width: 100%;
  padding: 1.25rem 0;
  flex: 1;
  display: flex;
  background-color: ${({ theme }) => theme.white};
  border: none;
  box-shadow: 0 0px 36px 0 ${({ theme }) => transparentize(0.9, theme.shadowColor)};

  > *:not(:first-child) {
    border-left: 1px solid ${({ theme }) => theme.borderColor};
  }
`
  
const DataPanelItem = styled.div`
  flex: 1;
  padding: 0 1.25rem;
  font-size: 1rem;

  > .title {
    color: rgba(0, 0, 0, 0.6);
    font-weight: 300;
  }

  > .data-row {
    margin-top: 0.75rem;
    display: flex;
    justify-content: space-between;
    color: ${({ theme }) => theme.textBlack};
    font-weight: 500;
  }

  .strong-title {
    font-weight: 500;
    color: ${({ theme }) => theme.black};
  }
`

const BlueSpan = styled.span`
  font-size: 1.25rem;
  font-weight: 500;
  color: ${({ theme }) => theme.franceBlue};
`

const OrangeSpan = styled.span`
  font-size: 1.25rem;
  font-weight: 500;
  color: ${({ theme }) => theme.seaBuckthorn};
`

const StrongSpan = styled.span`
  font-size: 1rem;
  font-weight: 500;
  color: ${({ theme }) => theme.black};
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

const DownArrowBackground = styled.div`
  ${({ theme }) => theme.flexRowNoWrap}
  justify-content: center;
  align-items: center;
  margin-top: 0.5rem;
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
  padding: 1rem;

  button {
    max-width: 20rem;
  }
`

const TransactionInfo = styled.div`
  ${({ theme }) => theme.flexColumnNoWrap}
  align-items: center;
`

const TransactionInfoTop = styled.div`
  ${({ theme }) => theme.flexRowNoWrap}
  justify-content: center;
  align-items: center;
  padding-bottom: 1.5rem;
`

const TransactionInfoBottom = styled.div`
  ${({ theme }) => theme.flexRowNoWrap};
  padding-top: 1.5rem;

  > *:not(:first-child) {
    border-left: 1px solid ${({ theme }) => theme.borderColor};
  }
`

const SummaryWrapper = styled.div`
  flex: 1;
  padding: 0 1rem;
  ${({ theme }) => theme.flexColumnNoWrap}
  align-items: center;
  text-align: center;

  > *:not(:first-child) {
    margin-top: 0.5rem;
  }
`

const SummaryText = styled.div`
  margin-top: 0.5rem;
`

const Divider = styled.div`
  width: 100%;
  height: 1px;
  background-color: ${({ theme }) => theme.borderColor};
`

const WrappedPlus = ({ isError, highSlippageWarning, ...rest }) => <Plus {...rest} />
const ColoredWrappedPlus = styled(WrappedPlus)`
  width: 1rem;
  height: 1rem;
  position: relative;
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
  const { library, active, account, chainId } = useWeb3React()

  const [addLiquidityState, dispatchAddLiquidityState] = useReducer(addLiquidityStateReducer, initialAddLiquidityState)
  const { inputValue, outputValue, lastEditedField, outputCurrency } = addLiquidityState
  const inputCurrency = USDX_ADDRESSES[chainId]

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
    if (library) {
      fetchPoolTokens()
      library.on('block', fetchPoolTokens)
  
      return () => {
        library.removeListener('block', fetchPoolTokens)
      }
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
    const blue = text => <BlueSpan>{text}</BlueSpan>
    const orange = text => <OrangeSpan>{text}</OrangeSpan>
    const strong = text => <StrongSpan>{text}</StrongSpan>

    if (isNewExchange) {
      return (
        <TransactionInfo>
          <TransactionInfoTop>
            <SummaryWrapper>
              <SummaryText>
                {t('youAreAdding')} {blue(`${inputValue} USDX`)} {t('and')} {blue(`${outputValue} ${symbol}`)}
              </SummaryText>
            </SummaryWrapper>
            <Trade />
            <SummaryWrapper>
              <SummaryText>
                {t('youWillMint')} {orange(`${inputValue}`)} {t('liquidityTokens')}
              </SummaryText>
            </SummaryWrapper>
          </TransactionInfoTop>
          <Divider />
          <TransactionInfoBottom>
            <SummaryWrapper>
              <SummaryText>
                {t('totalSupplyIs0')}
              </SummaryText>
            </SummaryWrapper>
            <SummaryWrapper>
              <SummaryText>
                {t('youAreSettingExRate')}{' '}
                {strong(
                  `1 USDX = ${amountFormatter(
                    getMarketRate(inputValueParsed, outputValueParsed, decimals),
                    18,
                    4,
                    false
                  )} ${symbol}`
                )}
              </SummaryText>
            </SummaryWrapper>
          </TransactionInfoBottom>
        </TransactionInfo>
      )
    } else {
      return (
        <TransactionInfo>
          <TransactionInfoTop>
            <SummaryWrapper>
              <SummaryText>
                {t('youAreAdding')} {blue(`${amountFormatter(inputValueParsed, 18, 4)} USDX`)} {t('and')} {'at most'}{' '}
                {blue(`${amountFormatter(outputValueMax, decimals, Math.min(decimals, 4))} ${symbol}`)}
              </SummaryText>
            </SummaryWrapper>
            <Trade />
            <SummaryWrapper>
              <SummaryText>
                {t('youWillMint')} {orange(amountFormatter(liquidityMinted, 18, 4))} {t('liquidityTokens')}
              </SummaryText>
            </SummaryWrapper>
          </TransactionInfoTop>
          <Divider />
          <TransactionInfoBottom>
            <SummaryWrapper>
              <SummaryText>
                {t('totalSupplyIs')} {strong(amountFormatter(totalPoolTokens, 18, 4))}
              </SummaryText>
            </SummaryWrapper>
            <SummaryWrapper>
              <SummaryText>
                {t('tokenWorth')} {strong(amountFormatter(USDXPerLiquidityToken, 18, 4))} USDX {t('and')}{' '}
                {strong(amountFormatter(tokenPerLiquidityToken, decimals, Math.min(decimals, 4)))} {symbol}
              </SummaryText>
            </SummaryWrapper>
          </TransactionInfoBottom>
        </TransactionInfo>
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
      const comment = `Deposit ${inputValue} USDx and ${outputValue} ${symbol} to pool`
      addTransaction(response, { comment })
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

  const USDXAllowance = useAddressAllowance(account, USDX_ADDRESSES[chainId], SIMPLESWAP_ADDRESSES[chainId])
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

  const allowance = useAddressAllowance(account, outputCurrency, SIMPLESWAP_ADDRESSES[chainId])
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
          <NewExchangeWarningText>{t('initialExchangeRate', { label: symbol })}</NewExchangeWarningText>
        </NewExchangeWarning>
      ) : null}

      <CurrencyInputPanel
        title={t('deposit')}
        allBalances={allBalances}
        extraText={inputBalance && formatBalance(amountFormatter(inputBalance, 18, 3))}
        extraTextClickHander={() => {
          if (inputBalance) {
            if (inputBalance.gt(ethers.constants.Zero)) {
              dispatchAddLiquidityState({
                type: 'UPDATE_VALUE',
                payload: { value: amountFormatter(inputBalance, 18, 18, false), field: INPUT }
              })
            }
          }
        }}
        onValueChange={inputValue => {
          dispatchAddLiquidityState({ type: 'UPDATE_VALUE', payload: { value: inputValue, field: INPUT } })
        }}
        selectedTokenAddress={USDX_ADDRESSES[chainId]}
        value={inputValue}
        showUnlock={showUSDXUnlock}
        errorMessage={inputError}
        disableTokenSelect
        backgroundColor='linear-gradient(90deg,rgba(58,129,255,1),rgba(36,115,255,1))'
        inputBackgroundColor='#1460E8'
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
        extraText={outputBalance && formatBalance(amountFormatter(outputBalance, decimals, Math.min(decimals, 3)))}
        extraTextClickHander={() => {
          if (outputBalance) {
            if (outputBalance.gt(ethers.constants.Zero)) {
              dispatchAddLiquidityState({
                type: 'UPDATE_VALUE',
                payload: { value: amountFormatter(outputBalance, decimals, decimals, false), field: OUTPUT }
              })
            }
          }
        }}
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
        backgroundColor='linear-gradient(90deg,rgba(251,152,54,1),rgba(254,148,44,1))'
        inputBackgroundColor='#ED7C0E'
        renderExchangeRate={() => (
          <ExchangeRateWrapper>
            <span>{marketRate && `1 USDX = ${amountFormatter(marketRate, 18, 4)} ${symbol}`}</span>
          </ExchangeRateWrapper>
        )}
        excludeTokens={['0xdBCFff49D5F48DDf6e6df1f2C9B96E1FC0F31371']}
      />
      <Row>
        <DataPanel>
          <DataPanelItem>
            <div className="title">{t('currentPoolSize')}</div>
            {exchangeUSDXBalance && exchangeTokenBalance ? (
              <>
                <div className="data-row">
                  <div className="data-key">USDx</div>
                  <div className="data-value">{amountFormatter(exchangeUSDXBalance, 18, 4)}</div>
                </div>
                <div className="data-row">
                  <div className="data-key">{symbol}</div>
                  <div className="data-value">{amountFormatter(exchangeTokenBalance, decimals, Math.min(4, decimals))}</div>
                </div>
              </>
            ) : (
              <div className="data-row">{'-'}</div>
            )}
          </DataPanelItem>
          <DataPanelItem>
            <div className="title">
              {t('yourPoolShare')} {' '}
              <span className="strong-title">({exchangeUSDXBalance && amountFormatter(poolTokenPercentage, 16, 2)}%)</span>
            </div>
            {USDXShare && tokenShare ? (
              <>
                <div className="data-row">
                  <div className="data-key">USDx</div>
                  <div className="data-value">{amountFormatter(USDXShare, 18, 4)}</div>
                </div>
                <div className="data-row">
                  <div className="data-key">{symbol}</div>
                  <div className="data-value">{amountFormatter(tokenShare, decimals, Math.min(4, decimals))}</div>
                </div>
              </>
            ) : (
              <div className="data-row">{'-'}</div>
            )}
          </DataPanelItem>
        </DataPanel>
      </Row>
      {renderSummary()}
      <Flex>
        <Button disabled={!isValid} onClick={onAddLiquidity}>
          {t('addLiquidity')}
        </Button>
      </Flex>
      <TransactionHistory />
    </>
  )
}
