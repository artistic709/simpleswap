import React, { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import ReactGA from 'react-ga'
import { ethers } from 'ethers'
import styled from 'styled-components'
import { transparentize } from 'polished'

import { Button } from '../../theme'
import CurrencyInputPanel from '../../components/CurrencyInputPanel'
import ContextualInfo from '../../components/ContextualInfo'
import OversizedPanel from '../../components/OversizedPanel'
import TransactionHistory from '../../components/TransactionHistory'
import ArrowDown from '../../assets/svg/SVGArrowDown'
import { ReactComponent as Trade } from '../../assets/images/trade.svg'

import { useWeb3React, useSimpleSwapContract } from '../../hooks'
import { useTransactionAdder } from '../../contexts/Transactions'
import { useTokenDetails } from '../../contexts/Tokens'
import { useFetchAllBalances } from '../../contexts/AllBalances'
import { useAddressBalance } from '../../contexts/Balances'
import { useSimpleSwapReserveOf, useSimpleSwapBalanceOf } from '../../contexts/SimpleSwap'
import { calculateGasMargin, amountFormatter } from '../../utils'
import { SIMPLESWAP_ADDRESSES, USDX_ADDRESSES } from '../../constants'

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
  box-sizing: content-box;
`

const RemoveLiquidityOutput = styled.div`
  ${({ theme }) => theme.flexRowNoWrap}
  align-items: center;
  min-height: 4.5rem;
  background-color: ${({ theme }) => theme.white};
  box-shadow: 0 0px 36px 0 ${({ theme }) => transparentize(0.9, theme.shadowColor)};
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
  const { library, account, active, chainId } = useWeb3React()
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

  // validate real token reserve
  const [outputError, setOutputError] = useState()
  const USDXRealReserve = useAddressBalance(SIMPLESWAP_ADDRESSES[chainId], USDX_ADDRESSES[chainId])
  const tokenRealReserve = useAddressBalance(SIMPLESWAP_ADDRESSES[chainId], outputCurrency)
  useEffect(() => {
    if (
      USDXRealReserve && tokenRealReserve && USDXWithdrawn && tokenWithdrawn &&
      (USDXRealReserve.lt(USDXWithdrawn) || tokenRealReserve.lt(tokenWithdrawn))
    ) {
      setOutputError(t('insufficientReserve'))
    } else {
      setOutputError(null)
    }

    return () => {
      setOutputError()
    }
  }, [USDXRealReserve, USDXWithdrawn, t, tokenRealReserve, tokenWithdrawn])

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
        const comment = `Withdraw ${amountFormatter(USDXWithdrawn, 18, 4)} USDx and ${amountFormatter(tokenWithdrawn, decimals, Math.min(decimals, 4))} ${symbol} from pool`
        addTransaction(response, { comment })
      })
  }

  function renderTransactionDetails() {
    ReactGA.event({
      category: 'TransactionDetail',
      action: 'Open'
    })

    const blue = text => <BlueSpan>{text}</BlueSpan>
    const orange = text => <OrangeSpan>{text}</OrangeSpan>
    const strong = text => <StrongSpan>{text}</StrongSpan>

    return (
      <TransactionInfo>
        <TransactionInfoTop>
          <SummaryWrapper>
            <SummaryText>
              {t('youAreRemoving')} {blue(`${amountFormatter(USDXWithdrawn, 18, 4)} USDX`)} {t('and')}{' '}
              {blue(`${amountFormatter(tokenWithdrawn, decimals, Math.min(decimals, 4))} ${symbol}`)}
            </SummaryText>
          </SummaryWrapper>
          <Trade />
          <SummaryWrapper>
            <SummaryText>
              {t('youWillRemove')} {orange(amountFormatter(valueParsed, 18, 4))} {t('liquidityTokens')}
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
              {t('tokenWorth')} {strong(amountFormatter(USDXPer, 18, 4))} USDX {t('and')}{' '}
              {strong(amountFormatter(tokenPer, decimals, Math.min(4, decimals)))} {symbol}
            </SummaryText>
          </SummaryWrapper>
        </TransactionInfoBottom>
      </TransactionInfo>
    )
  }

  function renderSummary() {
    let contextualInfo = ''
    let isError = false

    if (inputError || outputError) {
      contextualInfo = inputError || outputError
      isError = true
    } else if (!outputCurrency || outputCurrency === USDX_ADDRESSES[chainId]) {
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
  const isValid = !inputError && !outputError

  const marketRate = getMarketRate(exchangeUSDXBalance, exchangeTokenBalance, decimals)

  const allBalances = useFetchAllBalances()

  return (
    <>
      <CurrencyInputPanel
        title={t('poolTokens')}
        allBalances={allBalances}
        extraText={poolTokenBalance && formatBalance(amountFormatter(poolTokenBalance, 18, 3))}
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
        backgroundColor='linear-gradient(90deg,rgba(58,129,255,1),rgba(36,115,255,1))'
        inputBackgroundColor='#1460E8'
        excludeTokens={['0xdBCFff49D5F48DDf6e6df1f2C9B96E1FC0F31371']}
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
            {marketRate && <span>{`1 USDX = ${amountFormatter(marketRate, 18, 4)} ${symbol}`}</span>}
          </ExchangeRateWrapper>
        )}
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
              <span className="strong-title">({ownershipPercentageFormatted && ownershipPercentageFormatted}%)</span>
            </div>
            {USDXOwnShare && TokenOwnShare ? (
              <>
                <div className="data-row">
                  <div className="data-key">USDx</div>
                  <div className="data-value">{amountFormatter(USDXOwnShare, 18, 4)}</div>
                </div>
                <div className="data-row">
                  <div className="data-key">{symbol}</div>
                  <div className="data-value">{amountFormatter(TokenOwnShare, decimals, Math.min(4, decimals))}</div>
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
        <Button disabled={!isValid} onClick={onRemoveLiquidity}>
          {t('removeLiquidity')}
        </Button>
      </Flex>
      <TransactionHistory />
    </>
  )
}
