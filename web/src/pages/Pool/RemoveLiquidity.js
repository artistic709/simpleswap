import React, { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import ReactGA from 'react-ga'
import { useWeb3Context } from 'web3-react'
import { ethers } from 'ethers'
import styled from 'styled-components'
import { transparentize } from 'polished'

import { Button } from '../../theme'
import CurrencyInputPanel from '../../components/CurrencyInputPanel'
import ContextualInfo from '../../components/ContextualInfo'
import OversizedPanel from '../../components/OversizedPanel'
import ArrowDown from '../../assets/svg/SVGArrowDown'

import { useSimpleSwapContract } from '../../hooks'
import { useTransactionAdder } from '../../contexts/Transactions'
import { useTokenDetails } from '../../contexts/Tokens'
import { useFetchAllBalances } from '../../contexts/AllBalances'
import { useSimpleSwapReserveOf, useSimpleSwapBalanceOf } from '../../contexts/SimpleSwap'
import { calculateGasMargin, amountFormatter } from '../../utils'
import { USDX_ADDRESSES } from '../../constants'

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

const DownArrowBackground = styled.div`
  ${({ theme }) => theme.flexRowNoWrap}
  justify-content: center;
  align-items: center;
`

const DownArrow = styled(ArrowDown)`
  ${({ theme }) => theme.flexRowNoWrap}
  color: ${({ theme, active }) => (active ? theme.royalBlue : theme.doveGray)};
  width: 0.625rem;
  height: 0.625rem;
  position: relative;
  padding: 0.875rem;
  box-sizing: content-box;
`

const RemoveLiquidityOutput = styled.div`
  ${({ theme }) => theme.flexRowNoWrap}
  min-height: 3.5rem;
  padding: 0 1.25rem;
`

const RemoveLiquidityOutputText = styled.div`
  font-size: 1.25rem;
  line-height: 1.5rem;
  padding: 1rem 0.75rem;
`

const RemoveLiquidityOutputPlus = styled.div`
  font-size: 1.25rem;
  line-height: 1.5rem;
  padding: 1rem 0;
`

const SummaryPanel = styled.div`
  ${({ theme }) => theme.flexColumnNoWrap}
  padding: 1rem 0;
`

const LastSummaryText = styled.div`
  margin-top: 1rem;
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

export default function RemoveLiquidity() {
  const { library, account, active, networkId } = useWeb3Context()
  const { t } = useTranslation()

  const addTransaction = useTransactionAdder()

  const [outputCurrency, setOutputCurrency] = useState('')
  const [value, setValue] = useState('')
  const [inputError, setInputError] = useState()
  const [valueParsed, setValueParsed] = useState()

  // parse value
  useEffect(() => {
    try {
      const parsedValue = ethers.utils.parseUnits(value, 18)
      setValueParsed(parsedValue)
    } catch {
      if (value !== '') {
        setInputError(t('inputNotValid'))
      }
    }

    return () => {
      setInputError()
      setValueParsed()
    }
  }, [t, value])

  const { symbol, decimals } = useTokenDetails(outputCurrency)

  const [totalPoolTokens, setTotalPoolTokens] = useState()

  const poolTokenBalance = useSimpleSwapBalanceOf(account, outputCurrency)
  const { reserveUSDX: exchangeUSDXBalance, reserveToken: exchangeTokenBalance } = useSimpleSwapReserveOf(outputCurrency)

  // input validation
  useEffect(() => {
    if (valueParsed && poolTokenBalance) {
      if (valueParsed.gt(poolTokenBalance)) {
        setInputError(t('insufficientBalance'))
      } else {
        setInputError()
      }
    }
  }, [poolTokenBalance, t, valueParsed])

  const exchange = useSimpleSwapContract()

  const ownershipPercentage =
    poolTokenBalance && totalPoolTokens && !totalPoolTokens.isZero()
      ? poolTokenBalance.mul(ethers.utils.bigNumberify(10).pow(ethers.utils.bigNumberify(18))).div(totalPoolTokens)
      : undefined
  const ownershipPercentageFormatted = ownershipPercentage && amountFormatter(ownershipPercentage, 16, 2)

  const USDXOwnShare =
    exchangeUSDXBalance &&
    ownershipPercentage &&
    exchangeUSDXBalance.mul(ownershipPercentage).div(ethers.utils.bigNumberify(10).pow(ethers.utils.bigNumberify(18)))
  const TokenOwnShare =
    exchangeTokenBalance &&
    ownershipPercentage &&
    exchangeTokenBalance.mul(ownershipPercentage).div(ethers.utils.bigNumberify(10).pow(ethers.utils.bigNumberify(18)))

  const USDXPer =
    exchangeUSDXBalance && totalPoolTokens && !totalPoolTokens.isZero()
      ? exchangeUSDXBalance.mul(ethers.utils.bigNumberify(10).pow(ethers.utils.bigNumberify(18))).div(totalPoolTokens)
      : undefined
  const tokenPer =
    exchangeTokenBalance && totalPoolTokens && !totalPoolTokens.isZero()
      ? exchangeTokenBalance.mul(ethers.utils.bigNumberify(10).pow(ethers.utils.bigNumberify(18))).div(totalPoolTokens)
      : undefined

  const USDXWithdrawn =
    USDXPer && valueParsed
      ? USDXPer.mul(valueParsed).div(ethers.utils.bigNumberify(10).pow(ethers.utils.bigNumberify(18)))
      : undefined
  const tokenWithdrawn =
    tokenPer && valueParsed
      ? tokenPer.mul(valueParsed).div(ethers.utils.bigNumberify(10).pow(ethers.utils.bigNumberify(18)))
      : undefined

  const USDXWithdrawnMin = USDXWithdrawn ? calculateSlippageBounds(USDXWithdrawn).minimum : undefined
  const tokenWithdrawnMin = tokenWithdrawn ? calculateSlippageBounds(tokenWithdrawn).minimum : undefined

  const fetchPoolTokens = useCallback(() => {
    if (exchange) {
      exchange.totalSupply(ethers.utils.bigNumberify(outputCurrency)).then(totalSupply => {
        setTotalPoolTokens(totalSupply)
      })
    }
  }, [exchange, outputCurrency])
  useEffect(() => {
    fetchPoolTokens()
    library.on('block', fetchPoolTokens)

    return () => {
      library.removeListener('block', fetchPoolTokens)
    }
  }, [fetchPoolTokens, library])

  async function onRemoveLiquidity() {
    ReactGA.event({
      category: 'Pool',
      action: 'RemoveLiquidity'
    })

    const deadline = Math.ceil(Date.now() / 1000) + DEADLINE_FROM_NOW

    const estimatedGasLimit = await exchange.estimate.removeLiquidity(
      outputCurrency,
      valueParsed,
      USDXWithdrawnMin,
      tokenWithdrawnMin,
      deadline
    )

    exchange
      .removeLiquidity(outputCurrency, valueParsed, USDXWithdrawnMin, tokenWithdrawnMin, deadline, {
        gasLimit: calculateGasMargin(estimatedGasLimit, GAS_MARGIN)
      })
      .then(response => {
        addTransaction(response)
      })
  }

  const b = text => <BlueSpan>{text}</BlueSpan>

  function renderTransactionDetails() {
    ReactGA.event({
      category: 'TransactionDetail',
      action: 'Open'
    })

    return (
      <div>
        <div>
          {t('youAreRemoving')} {b(`${amountFormatter(USDXWithdrawn, 18, 4)} USDX`)} {t('and')}{' '}
          {b(`${amountFormatter(tokenWithdrawn, decimals, Math.min(decimals, 4))} ${symbol}`)} {t('outPool')}
        </div>
        <LastSummaryText>
          {t('youWillRemove')} {b(amountFormatter(valueParsed, 18, 4))} {t('liquidityTokens')}
        </LastSummaryText>
        <LastSummaryText>
          {t('totalSupplyIs')} {b(amountFormatter(totalPoolTokens, 18, 4))}
        </LastSummaryText>
        <LastSummaryText>
          {t('tokenWorth')} {b(amountFormatter(USDXPer, 18, 4))} USDX {t('and')}{' '}
          {b(amountFormatter(tokenPer, decimals, Math.min(4, decimals)))} {symbol}
        </LastSummaryText>
      </div>
    )
  }

  function renderSummary() {
    let contextualInfo = ''
    let isError = false

    if (inputError) {
      contextualInfo = inputError
      isError = true
    } else if (!outputCurrency || outputCurrency === USDX_ADDRESSES[networkId]) {
      contextualInfo = t('selectTokenCont')
    } else if (!valueParsed) {
      contextualInfo = t('enterValueCont')
    } else if (!account) {
      contextualInfo = t('noWallet')
      isError = true
    }

    return (
      <ContextualInfo
        key="context-info"
        openDetailsText={t('transactionDetails')}
        closeDetailsText={t('hideDetails')}
        contextualInfo={contextualInfo}
        isError={isError}
        renderTransactionDetails={renderTransactionDetails}
      />
    )
  }

  function formatBalance(value) {
    return `Balance: ${value}`
  }

  const isActive = active && account
  const isValid = !inputError

  const marketRate = getMarketRate(exchangeUSDXBalance, exchangeTokenBalance, decimals)

  const allBalances = useFetchAllBalances()

  return (
    <>
      <CurrencyInputPanel
        title={t('poolTokens')}
        allBalances={allBalances}
        extraText={poolTokenBalance && formatBalance(amountFormatter(poolTokenBalance, 18, 4))}
        extraTextClickHander={() => {
          if (poolTokenBalance) {
            const valueToSet = poolTokenBalance
            if (valueToSet.gt(ethers.constants.Zero)) {
              setValue(amountFormatter(valueToSet, 18, 18, false))
            }
          }
        }}
        onCurrencySelected={setOutputCurrency}
        onValueChange={setValue}
        value={value}
        errorMessage={inputError}
        selectedTokenAddress={outputCurrency}
      />
      <OversizedPanel>
        <DownArrowBackground>
          <DownArrow active={isActive} alt="arrow" />
        </DownArrowBackground>
      </OversizedPanel>
      <CurrencyInputPanel
        title={t('output')}
        allBalances={allBalances}
        description={!!(USDXWithdrawn && tokenWithdrawn) ? `(${t('estimated')})` : ''}
        key="remove-liquidity-input"
        renderInput={() =>
          !!(USDXWithdrawn && tokenWithdrawn) ? (
            <RemoveLiquidityOutput>
              <RemoveLiquidityOutputText>
                {`${amountFormatter(USDXWithdrawn, 18, 4, false)} USDX`}
              </RemoveLiquidityOutputText>
              <RemoveLiquidityOutputPlus> + </RemoveLiquidityOutputPlus>
              <RemoveLiquidityOutputText>
                {`${amountFormatter(tokenWithdrawn, decimals, Math.min(4, decimals))} ${symbol}`}
              </RemoveLiquidityOutputText>
            </RemoveLiquidityOutput>
          ) : (
            <RemoveLiquidityOutput />
          )
        }
        disableTokenSelect
        disableUnlock
        renderExchangeRate={() => (
          <ExchangeRateWrapper>
            {marketRate ? <span>{`1 USDX = ${amountFormatter(marketRate, 18, 4)} ${symbol}`}</span> : ' - '}
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
          <div className="title">{t('yourPoolShare')} ({ownershipPercentageFormatted && ownershipPercentageFormatted}%)</div>
          <div className="value">
            {USDXOwnShare && TokenOwnShare ? (
              <span>
                {`${amountFormatter(USDXOwnShare, 18, 4)} USDX + ${amountFormatter(
                  TokenOwnShare,
                  decimals,
                  Math.min(decimals, 4)
                )} ${symbol}`}
              </span>
            ) : (
              ' - '
            )}
          </div>
        </DataPanel>
      </Row>
      {renderSummary()}
      <Flex>
        <Button disabled={!isValid} onClick={onRemoveLiquidity}>
          {t('removeLiquidity')}
        </Button>
      </Flex>
    </>
  )
}
