import React, { useState, useEffect, useCallback, useMemo } from 'react'
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

import { useWeb3React, useContract } from '../../hooks'
import { useTransactionAdder } from '../../contexts/Transactions'
import { useTokenDetails, useAllTokenDetails } from '../../contexts/Tokens'
import { useFetchAllBalances } from '../../contexts/AllBalances'
import { useExchangeReserves } from '../../contexts/Exchanges'
import { useExchangeBalance } from '../../contexts/ExchangeBalances'
import { calculateGasMargin, amountFormatter } from '../../utils'
import {
  USDXSWAP_ADDRESSES,
  USDX_ADDRESSES,
  USDTSWAP_ADDRESSES,
  USDT_ADDRESSES,
} from '../../constants'
import EXCHANGE_ABI from '../../constants/abis/exchange.json'

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

  const [inputCurrency, setInputCurrency] = useState(USDX_ADDRESSES[chainId])
  const [outputCurrency, setOutputCurrency] = useState('')
  const [value, setValue] = useState('')
  const [inputError, setInputError] = useState()
  const [valueParsed, setValueParsed] = useState()

  const { symbol: inputSymbol, decimals: inputDecimals } = useTokenDetails(inputCurrency)
  const { symbol: outputSymbol, decimals: outputDecimals } = useTokenDetails(outputCurrency)
  
  // parse value
  useEffect(() => {
    try {
      const parsedValue = ethers.utils.parseUnits(value, inputDecimals)
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
  }, [inputDecimals, t, value])

  const exchangeList = useMemo(() => ({
    [USDX_ADDRESSES[chainId]]: USDXSWAP_ADDRESSES[chainId],
    [USDT_ADDRESSES[chainId]]: USDTSWAP_ADDRESSES[chainId],
  }), [chainId])
  const exchangeAddress = useMemo(() => exchangeList[inputCurrency], [exchangeList, inputCurrency])
  const exchange = useContract(exchangeAddress, EXCHANGE_ABI, library)

  const poolTokenBalance = useExchangeBalance(account, exchangeAddress, outputCurrency)
  
  const { coinReserve, tokenReserve } = useExchangeReserves(exchangeAddress, outputCurrency)

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

  const [totalPoolTokens, setTotalPoolTokens] = useState()
  const fetchPoolTokens = useCallback(() => {
    if (exchange) {
      exchange.totalSupply(ethers.utils.bigNumberify(outputCurrency)).then(totalSupply => {
        setTotalPoolTokens(totalSupply)
      })
    }
  }, [exchange, outputCurrency])
  useEffect(() => {
    if (library) {
      fetchPoolTokens()
      library.on('block', fetchPoolTokens)
  
      return () => {
        library.removeListener('block', fetchPoolTokens)
      }
    }
  }, [fetchPoolTokens, library])

  const ownershipPercentage =
    poolTokenBalance && totalPoolTokens && !totalPoolTokens.isZero()
      ? poolTokenBalance.mul(ethers.utils.bigNumberify(10).pow(ethers.utils.bigNumberify(18))).div(totalPoolTokens)
      : undefined
  const ownershipPercentageFormatted = ownershipPercentage && amountFormatter(ownershipPercentage, 16, 2)

  const coinOwnShare =
    coinReserve &&
    ownershipPercentage &&
    coinReserve.mul(ownershipPercentage).div(ethers.utils.bigNumberify(10).pow(ethers.utils.bigNumberify(18)))
  const tokenOwnShare =
    tokenReserve &&
    ownershipPercentage &&
    tokenReserve.mul(ownershipPercentage).div(ethers.utils.bigNumberify(10).pow(ethers.utils.bigNumberify(18)))

  const coinPercentage =
    coinReserve && totalPoolTokens && !totalPoolTokens.isZero()
      ? coinReserve.mul(ethers.utils.bigNumberify(10).pow(ethers.utils.bigNumberify(18))).div(totalPoolTokens)
      : undefined
  const tokenPercentage =
    tokenReserve && totalPoolTokens && !totalPoolTokens.isZero()
      ? tokenReserve.mul(ethers.utils.bigNumberify(10).pow(ethers.utils.bigNumberify(18))).div(totalPoolTokens)
      : undefined

  const coinWithdrawn =
    coinPercentage && valueParsed
      ? coinPercentage.mul(valueParsed).div(ethers.utils.bigNumberify(10).pow(ethers.utils.bigNumberify(18)))
      : undefined
  const tokenWithdrawn =
    tokenPercentage && valueParsed
      ? tokenPercentage.mul(valueParsed).div(ethers.utils.bigNumberify(10).pow(ethers.utils.bigNumberify(18)))
      : undefined

  const coinWithdrawnMin = coinWithdrawn ? calculateSlippageBounds(coinWithdrawn).minimum : undefined
  const tokenWithdrawnMin = tokenWithdrawn ? calculateSlippageBounds(tokenWithdrawn).minimum : undefined

  async function onRemoveLiquidity() {
    ReactGA.event({
      category: 'Pool',
      action: 'RemoveLiquidity'
    })

    const deadline = Math.ceil(Date.now() / 1000) + DEADLINE_FROM_NOW

    const estimatedGasLimit = await exchange.estimate.removeLiquidity(
      outputCurrency,
      valueParsed,
      coinWithdrawnMin,
      tokenWithdrawnMin,
      deadline
    )

    exchange
      .removeLiquidity(outputCurrency, valueParsed, coinWithdrawnMin, tokenWithdrawnMin, deadline, {
        gasLimit: calculateGasMargin(estimatedGasLimit, GAS_MARGIN)
      })
      .then(response => {
        const comment = `Withdraw ${amountFormatter(coinWithdrawn, inputDecimals, 4)} ${inputSymbol} and ${amountFormatter(tokenWithdrawn, outputDecimals, Math.min(outputDecimals, 4))} ${outputSymbol} from pool`
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
              {t('youAreRemoving')} {blue(`${amountFormatter(coinWithdrawn, inputDecimals, Math.min(outputDecimals, 4))} ${inputSymbol}`)} {t('and')}{' '}
              {blue(`${amountFormatter(tokenWithdrawn, outputDecimals, Math.min(outputDecimals, 4))} ${outputSymbol}`)}
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
              {t('tokenWorth')} {strong(amountFormatter(coinPercentage, 18, 4))} ${inputSymbol} {t('and')}{' '}
              {strong(amountFormatter(tokenPercentage, outputDecimals, Math.min(4, outputDecimals)))} {outputSymbol}
            </SummaryText>
          </SummaryWrapper>
        </TransactionInfoBottom>
      </TransactionInfo>
    )
  }

  function renderSummary() {
    let contextualInfo = ''
    let isError = false

    if (inputError) {
      contextualInfo = inputError
      isError = true
    } else if (!outputCurrency || outputCurrency === inputCurrency) {
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

  const marketRate = getExchangeRate(coinReserve, inputDecimals, tokenReserve, outputDecimals)

  const allBalances = useFetchAllBalances()
  const allTokens = useAllTokenDetails()


  return (
    <>
      <CurrencyInputPanel
        title={t('reserveToken')}
        backgroundColor='linear-gradient(90deg,rgba(58,129,255,1),rgba(36,115,255,1))'
        inputBackgroundColor='#1460E8'
        selectedTokenAddress={inputCurrency}
        excludeTokens={Object.keys(allTokens).filter(token => !(token === USDX_ADDRESSES[chainId] || token === USDT_ADDRESSES[chainId]))}
        onCurrencySelected={setInputCurrency}
        disableValueInput
      />
      <CurrencyInputPanel
        title={t('poolTokens')}
        allBalances={allBalances}
        extraText={poolTokenBalance && formatBalance(amountFormatter(poolTokenBalance, inputDecimals, 3))}
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
        backgroundColor='linear-gradient(90deg,rgba(251,152,54,1),rgba(254,148,44,1))'
        inputBackgroundColor='#ED7C0E'
        excludeTokens={[inputCurrency]}
      />
      <OversizedPanel>
        <DownArrowBackground>
          <DownArrow active={isActive} alt="arrow" />
        </DownArrowBackground>
      </OversizedPanel>
      <CurrencyInputPanel
        title={t('output')}
        allBalances={allBalances}
        description={!!(coinWithdrawn && tokenWithdrawn) ? `(${t('estimated')})` : ''}
        key="remove-liquidity-input"
        renderInput={() =>
          !!(coinWithdrawn && tokenWithdrawn) ? (
            <RemoveLiquidityOutput>
              <RemoveLiquidityOutputText>
                {`${amountFormatter(coinWithdrawn, inputDecimals, Math.min(4, outputDecimals), false)} ${inputSymbol}`}
              </RemoveLiquidityOutputText>
              <RemoveLiquidityOutputPlus> + </RemoveLiquidityOutputPlus>
              <RemoveLiquidityOutputText>
                {`${amountFormatter(tokenWithdrawn, outputDecimals, Math.min(4, outputDecimals))} ${outputSymbol}`}
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
            {marketRate && <span>{`1 ${inputSymbol} = ${amountFormatter(marketRate, 18, 4)} ${outputSymbol}`}</span>}
          </ExchangeRateWrapper>
        )}
      />
      <Row>
        <DataPanel>
          <DataPanelItem>
            <div className="title">{t('currentPoolSize')}</div>
            {coinReserve && tokenReserve ? (
              <>
                <div className="data-row">
                  <div className="data-key">{inputSymbol}</div>
                  <div className="data-value">{amountFormatter(coinReserve, inputDecimals, Math.min(4, inputDecimals))}</div>
                </div>
                <div className="data-row">
                  <div className="data-key">{outputSymbol}</div>
                  <div className="data-value">{amountFormatter(tokenReserve, outputDecimals, Math.min(4, outputDecimals))}</div>
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
            {coinOwnShare && tokenOwnShare ? (
              <>
                <div className="data-row">
                  <div className="data-key">{inputSymbol}</div>
                  <div className="data-value">{amountFormatter(coinOwnShare, inputDecimals, Math.min(4, inputDecimals))}</div>
                </div>
                <div className="data-row">
                  <div className="data-key">{outputSymbol}</div>
                  <div className="data-value">{amountFormatter(tokenOwnShare, outputDecimals, Math.min(4, outputDecimals))}</div>
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
