import React, { useState, useRef, useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ethers } from 'ethers'
import { BigNumber } from '@uniswap/sdk'
import styled from 'styled-components'
import escapeStringRegex from 'escape-string-regexp'
import { darken } from 'polished'
import Tooltip from '@reach/tooltip'
import '@reach/tooltip/styles.css'
import { isMobile } from 'react-device-detect'

import { Spinner } from '../../theme'
import { useTokenContract } from '../../hooks'
import { isAddress, calculateGasMargin, formatTokenBalance, formatEthBalance } from '../../utils'
import { ReactComponent as ArrowDropDown } from '../../assets/images/arrow_drop_down.svg'
import { ReactComponent as Done } from '../../assets/images/done.svg'
import { ReactComponent as Search } from '../../assets/images/search.svg'
import { ReactComponent as Lock } from '../../assets/images/httpslock.svg'
import Circle from '../../assets/images/circle-white.svg'
import TokenLogo from '../TokenLogo'
import { useTransactionAdder, usePendingApproval } from '../../contexts/Transactions'
import { useTokenDetails, useAllTokenDetails } from '../../contexts/Tokens'
import { useUSDPrice } from '../../contexts/Application'

const GAS_MARGIN = ethers.utils.bigNumberify(1000)

// Menu
const Menu = styled.div`
  position: absolute;
  top: 7.5rem;
  left: 0;
  z-index: 10;
  width: 100%;
  padding: 0.5rem;
  display: ${({ isOpen }) => (isOpen ? 'block' : 'none')};

  &:focus {
    outline: none;
  }
`
  
const TokenMenu = styled.div`
  max-height: 22rem;
  overflow-y: auto;
  border-radius: 0.25rem;
  background-color: ${({ theme }) => theme.white};
  box-shadow: 0px 6px 23px 0px rgba(3,15,91,0.1);
`

const TokenMenuInfo = styled.div`
  ${({ theme }) => theme.flexRowNoWrap}
  align-items: center;
  padding: 1rem 1.5rem;
  margin: 0.25rem 0.5rem;
  justify-content: center;
  user-select: none;
`

const TokenMenuRow = styled.div`
  ${({ theme }) => theme.flexRowNoWrap}
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem;
  cursor: pointer;
  user-select: none;
  border-top: 1px solid ${({ theme }) => theme.borderColor};

  #symbol {
    color: ${({ theme }) => theme.doveGrey};
  }

  :hover {
    background-color: ${({ theme }) => theme.tokenRowHover};
  }

  ${({ theme }) => theme.mediaWidth.upToMedium`padding: 0.8rem 1rem;`}
`

const FlexRow = styled.div`
  ${({ theme }) => theme.flexRowNoWrap}
  align-items: center;
  flex: 1 0;
  position: relative;

  > *:not(:first-child) {
    margin-left: 12px;
  }
`

const Mask = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
`

const InputRow = styled.div`
  ${({ theme }) => theme.flexRowNoWrap}
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem;
  border-radius: 0.25rem;
  background: ${({ backgroundColor }) => backgroundColor};
`

const InputWrapper = styled.div`
  ${({ theme }) => theme.flexRowNoWrap}
  justify-content: space-between;
  align-items: center;
  flex: 2 1;
  min-width: 50%;
  height: 3rem;
  padding: 0 1rem;
  border-radius: 0.25rem;
  background-color: ${({ backgroundColor }) => backgroundColor};
`

const Input = styled.input`
  flex: 1 1;
  font-size: 1rem;
  font-weight: 500;
  text-align: right;
  border: none;
  background-color: transparent;
  color: ${({ error, theme }) => error ? theme.cgRed : theme.white};
  -moz-appearance: textfield;
  user-select: none;

  &:focus {
    outline: none;
  }

  &::placeholder {
    color: rgba(255, 255, 255, 0.6);
  }

  &::-webkit-outer-spin-button, &::-webkit-inner-spin-button {
    -webkit-appearance: none;
  }
}
`

const SearchInput = styled.input`
  font-size: 1rem;
  outline: none;
  border: none;
  flex: 1 1 auto;
  width: 0;
  min-height: 1.75rem;
  flex-shrink: 0;
  text-align: left;
  padding-left: 0.5rem;
  background-color: transparent;
  color: ${({ theme }) => theme.mistGray};

  [type='number'] {
    -moz-appearance: textfield;
  }

  ::-webkit-outer-spin-button,
  ::-webkit-inner-spin-button {
    -webkit-appearance: none;
  }

  ::placeholder {
    color: ${({ theme }) => theme.chaliceGray};
  }
`

const CurrencySelect = styled.button`
  min-width: 114px;
  align-items: center;
  font-size: 1rem;
  color: ${({ theme }) => theme.white};
  height: 2.5rem;
  border: none;
  border-radius: 0.25rem;
  background-color: transparent;
  outline: none;
  cursor: pointer;
  user-select: none;

  :focus {
    outline: none;
  }
`

const Aligner = styled.span`
  display: flex;
  align-items: center;
  justify-content: space-between;
`

const StyledArrowDropDown = styled(ArrowDropDown)`
  width: 1rem;
  margin: 0 0.5rem 0 0.5rem;

  path {
    fill: ${({ theme }) => theme.white};
    stroke: ${({ theme }) => theme.white};
  }
`

const LockButton = styled.button`
  padding: 0;
  border: none;
  outline: none;
  background: transparent;
  cursor: pointer;
  display: flex;
  justify-content: center;
  align-items: center;

  &:focus {
    outline: none;
  }
`

const StyledLock = styled(Lock)`
  width: 1.5rem;
  height: 1.5rem;
  fill: ${({ theme }) => theme.white};
  opacity: 0.8;
`

const InputPanel = styled.div`
  ${({ theme }) => theme.flexColumnNoWrap}
  position: relative;
`

const Container = styled.div`
  padding: 0.5rem;
  border-radius: 0.25rem;
`

const LabelRow = styled.div`
  ${({ theme }) => theme.flexRowNoWrap}
  align-items: center;
  color: ${({ theme }) => theme.textBlack};
  font-size: 1rem;
  font-weight: 500;
  padding-bottom: 0.5rem;
  span:hover {
    color: ${({ theme }) => darken(0.2, theme.doveGray)};
  }
`

const LabelContainer = styled.div`
  flex: 1 1 auto;
  width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  text-transform: uppercase;
`

const ErrorSpan = styled.span`
  color: ${({ error, theme }) => error ? theme.salmonRed : theme.textBlack};
  :hover {
    cursor: pointer;
    color: ${({ error, theme }) => error && darken(0.1, theme.salmonRed)};
  }
`

const SearchRow = styled.div`
  padding: 1rem;
`

const SearchContainer = styled.div`
  ${({ theme }) => theme.flexRowNoWrap}
  justify-content: flex-start;
  align-items: center;
  flex: 1;
  width: 100%;
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  background-color: ${({ theme }) => theme.solitude};
`

const StyledSearch = styled(Search)`
  width: 1.25rem;
  height: 1.25rem;
  fill: ${({ theme }) => theme.mistGray};
`

const TokenList = styled.div`
  flex-grow: 1;
  height: 100%;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
`

const TokenRowLeft = styled.div`
  ${({ theme }) => theme.flexRowNoWrap}
  align-items : center;
`

const TokenSymbolGroup = styled.div`
  ${({ theme }) => theme.flexColumnNoWrap};
  margin-left: 1rem;

  > *:not(:first-child) {
    margin-top: 0.5rem;
  }
`

const TokenTitle = styled.div`
  ${({ theme }) => theme.flexRowNoWrap};
`

const TokenBalance = styled.div`
  font-size: 0.875rem;
  font-weight: 400;
  color: ${({ theme }) => theme.chaliceGray};

`

const TokenFullName = styled.div`
  margin-left: 0.25rem;
  font-weight: 600;
  color: ${({ theme }) => theme.chaliceGray};
`

const TokenRowRight = styled.div`
  ${({ theme }) => theme.flexColumnNoWrap};
  align-items: flex-end;
`

const StyledDone = styled(Done)`
  width: 36px;
  height: 36px;
  fill: ${({ theme }) => theme.franceBlue};
`

const StyledTokenName = styled.span`
  margin: 0 0.25rem 0 0.25rem;
  font-size: 0.875rem;

  @media screen and (min-width: 600px) {
    font-size: 1rem;
  }
`

export default function CurrencyInputPanel({
  onValueChange = () => {},
  allBalances,
  renderInput,
  onCurrencySelected = () => {},
  title,
  description,
  extraText,
  extraTextClickHander = () => {},
  errorMessage,
  disableUnlock,
  disableTokenSelect,
  disableValueInput,
  selectedTokenAddress = '',
  selectedTokenExchangeAddress = '',
  showUnlock,
  value,
  renderExchangeRate,
  excludeTokens = [],
  backgroundColor,
  inputBackgroundColor
}) {
  const { t } = useTranslation()
  
  const tokenContract = useTokenContract(selectedTokenAddress)
  
  const pendingApproval = usePendingApproval(selectedTokenAddress)
  
  const addTransaction = useTransactionAdder()
  
  const allTokens = useAllTokenDetails()
  
  const [menuIsOpen, setMenuIsOpen] = useState(false)

  const onChange = (event) => {
    const value = event.target.value

    if (!value || isNaN(value) || Number(value) === 0) {
      onValueChange(value)
    } else {
      const valueParsed = BigNumber(value).toFixed(18).replace(/\.?0+$/,'')
      onValueChange(valueParsed)
    }
  }

  function renderUnlockButton() {
    if (disableUnlock || !showUnlock || selectedTokenAddress === 'ETH' || !selectedTokenAddress) {
      return null
    } else {
      if (!pendingApproval) {
        return (
          <LockButton
            onClick={async () => {
              const estimatedGas = await tokenContract.estimate.approve(
                selectedTokenExchangeAddress,
                ethers.constants.MaxUint256
              )
              tokenContract
                .approve(selectedTokenExchangeAddress, ethers.constants.MaxUint256, {
                  gasLimit: calculateGasMargin(estimatedGas, GAS_MARGIN)
                })
                .then(response => {
                  const comment = `Unlock ${allTokens[selectedTokenAddress].symbol}`
                  addTransaction(response, { approval: selectedTokenAddress, comment })
                })
            }}
          >
            <StyledLock />
          </LockButton>
        )
      } else {
        return <Spinner src={Circle} alt='loader' />
      }
    }
  }

  function _renderExchangeRate() {
    if (typeof renderExchangeRate === 'function') {
      return renderExchangeRate()
    }
    return null
  }

  function _renderInput() {
    if (typeof renderInput === 'function') {
      return renderInput()
    }

    return (
      <>
        <InputRow backgroundColor={backgroundColor}>
          <FlexRow>
            <CurrencySelect
              selected={!!selectedTokenAddress}
              onClick={() => {
                if (!disableTokenSelect) {
                  setMenuIsOpen(!menuIsOpen)
                }
              }}
            >
              <Aligner>
                {selectedTokenAddress ? <TokenLogo address={selectedTokenAddress} /> : null}
                {
                  <StyledTokenName>
                    {(allTokens[selectedTokenAddress] && allTokens[selectedTokenAddress].symbol) || t('selectToken')}
                  </StyledTokenName>
                }
                {!disableTokenSelect && <StyledArrowDropDown selected={!!selectedTokenAddress} />}
              </Aligner>
            </CurrencySelect>
            {menuIsOpen && <Mask />}
          </FlexRow>
          {!disableValueInput && (
            <InputWrapper backgroundColor={inputBackgroundColor}>
              {renderUnlockButton()}
              <Input
                type="number"
                min="0"
                error={!!errorMessage}
                placeholder={selectedTokenAddress && `Amount in ${allTokens[selectedTokenAddress].symbol}`}
                step="0.000000000000000001"
                onChange={onChange}
                onKeyPress={e => {
                  const charCode = e.which ? e.which : e.keyCode

                  // Prevent 'minus' character
                  if (charCode === 45) {
                    e.preventDefault()
                    e.stopPropagation()
                  }
                }}
                value={value}
              />
            </InputWrapper>
          )}
        </InputRow>
      </>
    )
  }

  return (
    <InputPanel>
      <Container error={!!errorMessage}>
        <LabelRow>
          <LabelContainer>
            <span>{title}</span> <span>{description}</span>
          </LabelContainer>
          <ErrorSpan
            data-tip={'Enter max'}
            error={!!errorMessage}
            onClick={() => {
              extraTextClickHander()
            }}
          >
            <Tooltip
              label="Enter Max"
              style={{
                background: 'hsla(0, 0%, 0%, 0.75)',
                color: 'white',
                border: 'none',
                borderRadius: '24px',
                padding: '0.5em 1em',
                marginTop: '-64px'
              }}
            >
              <span>{extraText}</span>
            </Tooltip>
          </ErrorSpan>
        </LabelRow>
        {_renderInput()}
        {_renderExchangeRate()}
      </Container>
      {!disableTokenSelect && (
        <CurrencySelectMenu
          isOpen={menuIsOpen}
          onDismiss={() => {
            setMenuIsOpen(false)
          }}
          onTokenSelect={onCurrencySelected}
          allBalances={allBalances}
          selectedTokenAddress={selectedTokenAddress}
          excludeTokens={excludeTokens}
        />
      )}
    </InputPanel>
  )
}

function CurrencySelectMenu(props) {
  const { isOpen, onDismiss, onTokenSelect, allBalances, selectedTokenAddress, excludeTokens } = props
  const { t } = useTranslation()

  const [searchQuery, setSearchQuery] = useState('')
  useTokenDetails(searchQuery)

  const allTokens = useAllTokenDetails()

  // BigNumber.js instance
  const ethPrice = useUSDPrice()

  const _usdAmounts = Object.keys(allTokens).map(k => {
    if (
      ethPrice &&
      allBalances &&
      allBalances[k] &&
      allBalances[k].ethRate &&
      !allBalances[k].ethRate.isNaN() &&
      allBalances[k].balance
    ) {
      const USDRate = ethPrice.times(allBalances[k].ethRate)
      const balanceBigNumber = new BigNumber(allBalances[k].balance.toString())
      const usdBalance = balanceBigNumber.times(USDRate).div(new BigNumber(10).pow(allTokens[k].decimals))
      return usdBalance
    } else {
      return null
    }
  })
  const usdAmounts =
    _usdAmounts &&
    Object.keys(allTokens).reduce(
      (accumulator, currentValue, i) => Object.assign({ [currentValue]: _usdAmounts[i] }, accumulator),
      {}
    )

  const tokenList = useMemo(() => {
    return Object.keys(allTokens)
      .sort((a, b) => {
        const aSymbol = allTokens[a].symbol.toLowerCase()
        const bSymbol = allTokens[b].symbol.toLowerCase()

        if (aSymbol === 'ETH'.toLowerCase() || bSymbol === 'ETH'.toLowerCase()) {
          return aSymbol === bSymbol ? 0 : aSymbol === 'ETH'.toLowerCase() ? -1 : 1
        }

        if (usdAmounts[a] && !usdAmounts[b]) {
          return -1
        } else if (usdAmounts[b] && !usdAmounts[a]) {
          return 1
        }

        // check for balance - sort by value
        if (usdAmounts[a] && usdAmounts[b]) {
          const aUSD = usdAmounts[a]
          const bUSD = usdAmounts[b]

          return aUSD.gt(bUSD) ? -1 : aUSD.lt(bUSD) ? 1 : 0
        }

        return aSymbol < bSymbol ? -1 : aSymbol > bSymbol ? 1 : 0
      })
      .map(k => {
        let balance
        let usdBalance
        // only update if we have data
        if (k === 'ETH' && allBalances && allBalances[k]) {
          balance = formatEthBalance(allBalances[k].balance)
          usdBalance = usdAmounts[k]
        } else if (allBalances && allBalances[k]) {
          balance = formatTokenBalance(allBalances[k].balance, allTokens[k].decimals)
          usdBalance = usdAmounts[k]
        }
        return {
          name: allTokens[k].name,
          symbol: allTokens[k].symbol,
          address: k,
          balance: balance,
          usdBalance: usdBalance
        }
      })
  }, [allBalances, allTokens, usdAmounts])

  const filteredTokenList = useMemo(() => {
    return tokenList
      .filter(tokenEntry => {
        return !excludeTokens.includes(tokenEntry.address)
      })
      .filter(tokenEntry => {
        // check the regex for each field
        const regexMatches = Object.keys(tokenEntry).map(tokenEntryKey => {
          return (
            typeof tokenEntry[tokenEntryKey] === 'string' &&
            !!tokenEntry[tokenEntryKey].match(new RegExp(escapeStringRegex(searchQuery), 'i'))
          )
        })

        return regexMatches.some(m => m)
      })
  }, [tokenList, searchQuery, excludeTokens])

  const inputRef = useRef()

  const [isFocus, setIsFocus] = useState(false)
  useEffect(() => {
    setIsFocus(isOpen)
    if (isOpen) {
      setTimeout(() => {
        inputRef.current.focus()
      })
    }
  }, [isOpen])

  const onFocus = () => {
    setIsFocus(true)
  }

  const onBlur = (event) => {
    if (isFocus) {
      onDismiss()
    }
  }

  function onInput(event) {
    const input = event.target.value
    const checksummedInput = isAddress(input)
    setSearchQuery(checksummedInput || input)
  }

  function _onTokenSelect(address) {
    setSearchQuery('')
    onTokenSelect(address)
    onDismiss()
    setIsFocus(false)
  }

  function renderTokenList() {
    if (!filteredTokenList.length) {
      return <TokenMenuInfo>{t('noToken')}</TokenMenuInfo>
    }

    return filteredTokenList.map(({ address, symbol, name, balance }) => {
      return (
        <TokenMenuRow key={address} onClick={() => _onTokenSelect(address)}>
          <TokenRowLeft>
            <TokenLogo address={address} size={'2rem'} />
            <TokenSymbolGroup>
              <TokenTitle>
                <span id="symbol">{symbol}</span>
                <TokenFullName>({name})</TokenFullName>
              </TokenTitle>
              {balance && <TokenBalance>Balance: {balance && (balance > 0 || balance === '<0.0001') ? balance : '-'}</TokenBalance>}
            </TokenSymbolGroup>
          </TokenRowLeft>
          <TokenRowRight>
            {address === selectedTokenAddress && <StyledDone />}
          </TokenRowRight>
        </TokenMenuRow>
      )
    })
  }

  return (
    <Menu
      tabIndex={0}
      isOpen={isFocus}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      <TokenMenu>
        <SearchRow>
          <SearchContainer>
            <StyledSearch />
            <SearchInput
              autoFocus
              ref={inputRef}
              type="text"
              placeholder={isMobile ? t('searchOrPasteMobile') : t('searchOrPaste')}
              onChange={onInput}
            />
          </SearchContainer>
        </SearchRow>
        <TokenList>{renderTokenList()}</TokenList>
      </TokenMenu>
    </Menu>
  )
}
