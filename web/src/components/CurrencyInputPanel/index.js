import React, { useState, useRef, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ethers } from 'ethers'
import { BigNumber } from '@uniswap/sdk'
import { useWeb3Context } from 'web3-react'
import styled from 'styled-components'
import escapeStringRegex from 'escape-string-regexp'
import { darken } from 'polished'
import Tooltip from '@reach/tooltip'
import '@reach/tooltip/styles.css'
import { isMobile } from 'react-device-detect'

import { BorderlessInput } from '../../theme'
import { useTokenContract } from '../../hooks'
import { isAddress, calculateGasMargin, formatTokenBalance, formatEthBalance } from '../../utils'
import { ReactComponent as ArrowDropDown } from '../../assets/images/arrow_drop_down.svg'
import { ReactComponent as Done } from '../../assets/images/done.svg'
import TokenLogo from '../TokenLogo'
import SearchIcon from '../../assets/images/magnifying-glass.svg'
import { useTransactionAdder, usePendingApproval } from '../../contexts/Transactions'
import { useTokenDetails, useAllTokenDetails } from '../../contexts/Tokens'
import { useUSDPrice } from '../../contexts/Application'
import { SIMPLESWAP_ADDRESSES } from '../../constants'

const GAS_MARGIN = ethers.utils.bigNumberify(1000)

// Menu
const Menu = styled.div`
  position: absolute;
  top: 6.5rem;
  left: 0;
  z-index: 10;
  width: 100%;
  padding: 0.5rem;
  display: ${({ isOpen }) => (isOpen ? 'block' : 'none')};
`
  
const TokenMenu = styled.div`
  max-height: 22rem;
  overflow-y: auto;
  border-radius: 0.5rem;
  background-color: ${({ theme }) => theme.white};
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
  padding: 1.25rem 2rem;
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

  > *:not(:first-child) {
    margin-left: 12px;
  }
`

const SubCurrencySelect = styled.button`
  ${({ theme }) => theme.flexRowNoWrap}
  min-width: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 2.5rem;
  padding: 0 0.75rem;
  outline: none;
  font-size: 1rem;
  line-height: 0;
  cursor: pointer;
  user-select: none;
  background: transparent;
  border: 1px solid ${({ theme }) => theme.white};
  border-radius: 1.25rem;
  color: ${({ theme }) => theme.white};
`

const InputRow = styled.div`
  ${({ theme }) => theme.flexRowNoWrap}
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem;
  border-radius: 0.25rem;
  background-color: ${({ backgroundColor }) => backgroundColor};
`

const Input = styled.input`
  flex: 2 1;
  min-width: 50%;
  height: 2.5rem;
  padding: 0 1rem;
  font-size: 1rem;
  text-align: right;
  border: none;
  border-radius: 0.25rem;
  color: ${({ error, theme }) => error ? theme.salmonRed : theme.white};
  background-color: rgba(0, 0, 0, 0.1);
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

const StyledBorderlessInput = styled(BorderlessInput)`
  min-height: 2.5rem;
  flex-shrink: 0;
  text-align: left;
  padding-left: 1.6rem;
  background-color: transparent;
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
  padding: 0.5rem 0;
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
  flex: 1;
  width: 100%;
  padding: 0.5rem 1rem;
  border-radius: 1rem;
  background-color: ${({ theme }) => theme.solitude};
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
  font-size: 1rem;
  font-weigth: 400;
  color: ${({ theme }) => theme.chaliceGray};
  line-height: 20px;
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
  selectedTokenAddress = '',
  showUnlock,
  value,
  renderExchangeRate,
  inputBackgroundColor = '#3B83F7'
}) {
  const { t } = useTranslation()

  const [menuIsOpen, setMenuIsOpen] = useState(false)

  const { networkId } = useWeb3Context()

  const tokenContract = useTokenContract(selectedTokenAddress)

  const selectedTokenExchangeAddress = SIMPLESWAP_ADDRESSES[networkId]
  
  const pendingApproval = usePendingApproval(selectedTokenAddress)

  const addTransaction = useTransactionAdder()

  const allTokens = useAllTokenDetails()

  function renderUnlockButton() {
    if (disableUnlock || !showUnlock || selectedTokenAddress === 'ETH' || !selectedTokenAddress) {
      return null
    } else {
      if (!pendingApproval) {
        return (
          <SubCurrencySelect
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
            {t('unlock')}
          </SubCurrencySelect>
        )
      } else {
        return <SubCurrencySelect>{t('pending')}</SubCurrencySelect>
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
        <InputRow backgroundColor={inputBackgroundColor}>
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
            {renderUnlockButton()}
          </FlexRow>
          <Input
            type="number"
            min="0"
            error={!!errorMessage}
            placeholder={selectedTokenAddress && `Amount in ${allTokens[selectedTokenAddress].symbol}`}
            step="0.000000000000000001"
            onChange={e => onValueChange(e.target.value)}
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
        />
      )}
    </InputPanel>
  )
}

function CurrencySelectMenu({ isOpen, onDismiss, onTokenSelect, allBalances, selectedTokenAddress }) {
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
    return tokenList.filter(tokenEntry => {
      // check the regex for each field
      const regexMatches = Object.keys(tokenEntry).map(tokenEntryKey => {
        return (
          typeof tokenEntry[tokenEntryKey] === 'string' &&
          !!tokenEntry[tokenEntryKey].match(new RegExp(escapeStringRegex(searchQuery), 'i'))
        )
      })

      return regexMatches.some(m => m)
    })
  }, [tokenList, searchQuery])

  function _onTokenSelect(address) {
    setSearchQuery('')
    onTokenSelect(address)
    onDismiss()
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


  // manage focus on modal show
  const inputRef = useRef()

  function onInput(event) {
    const input = event.target.value
    const checksummedInput = isAddress(input)
    setSearchQuery(checksummedInput || input)
  }

  return (
    <Menu
      isOpen={isOpen}
    >
      <TokenMenu>
        <SearchRow>
          <SearchContainer>
            <img src={SearchIcon} alt="search" />
            <StyledBorderlessInput
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
