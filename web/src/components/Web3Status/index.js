import React from 'react'
import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { useWeb3React, UnsupportedChainIdError } from '@web3-react/core'
import { injected } from '../../connectors'
import { shortenAddress, getNetworkName } from '../../utils'
import { useENSName } from '../../hooks'
import { ReactComponent as ArrowDropDown } from '../../assets/images/arrow_drop_down.svg'

const Web3StatusWrapper = styled.div`
  ${({ theme }) => theme.flexColumnNoWrap}
  position: relative;
  width: 11rem;
  margin: 0 0.75rem;
  padding: 1.25rem 0;
  border: none;
  background-color: transparent;

  @media screen and (min-width: 600px) {
    margin: 0 1.25rem;
  }

  > *:not(:first-child) {
    margin-top: 0.5rem;
  }

  > .web3-button-wrapper {
    display: none;
    position: absolute;
    top: 4rem;
    left: 0;
    z-index: 10;
    width: 11rem;
    border: 1px solid #d9dee3;
    border-radius: 4px;
    background-color: #ffffff;
    box-shadow: 0 5px 12px 0 rgba(42,49,56,.15);

    > span {
      display: block;
      width: 0;
      height: 0;
      border-width: 0 6px 6px;
      border-style: solid;
      border-color: transparent transparent #d9dee3;
      position: absolute;
      top: -6px;
      right: 8px;

      > em {
        display: block;
        width: 0;
        height: 0;
        border-width: 0 5px 5px;
        border-style: solid;
        border-color: transparent transparent #fff;
        position: absolute;
        top: 2px;
        left: -5px;
      }
    }
  }
  
  &:hover .web3-button-wrapper {
    display: block
  }
`

const Web3NetworkStatus = styled.div`
  ${({ theme }) => theme.flexRowNoWrap}
  width: 100%;
  align-items: center;
`

const Web3NetworkIndicator = styled.div`
  width: 0.5rem;
  height: 0.5rem;
  margin-right: 0.5rem;
  border-radius: 0.25rem;
  background-color: ${({ theme, chainId }) => {
    if (chainId === 1) {
      return theme.emerald
    } else {
      return theme.seaBuckthorn
    }
  }};
`

const Web3AccountStatus = styled.div`
  ${({ theme }) => theme.flexRowNoWrap}
  width: 100%;
  justify-content: space-between;
`

const Web3ErrorMessage = styled.div`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin: 0;
  font-size: 0.875rem;
  font-weight: 500;
  color: ${({ theme }) => theme.white};
`

const Text = styled.p`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin: 0;
  font-size: 1rem;
  font-weight: 500;
  color: ${({ theme }) => theme.white};
  `
  
const SubText = styled.p`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin: 0;
  font-size: 0.75rem;
  font-weight: 500;
  color: ${({ theme }) => theme.white};
`

const Button = styled.button`
  width: 100%;
  height: 40px;
  outline: none;
  display: flex;
  justify-content: center;
  align-items: center;
  border-color: ${({ theme }) => theme.mistGrey};
  border-radius: 4px;
  font-size: 1rem;
  font-weight: 500;
  background-color: #ffffff;
  cursor: pointer;
  
  &:focus {
    outline: none;
  }
  
  border: none;
  border-top-left-radius: 0;
  border-top-right-radius: 0;
  border-top: 1px solid #E0E0E0;
  &:first-child {
    border: none;
  }
`

const StyledArrowDropDown = styled(ArrowDropDown)`
  width: 1rem;
  margin-left: 0.5rem;

  path {
    fill: ${({ theme }) => theme.white};
    stroke: ${({ theme }) => theme.white};
  }
`

const ConnectButton = styled.button`
  width: 4.5rem;
  height: 2rem;
  margin: 0.75rem;
  border: none;
  border-radius: 0.25rem;
  outline: none;
  background-color: ${({ theme }) => theme.white};
  color: ${({ theme }) => theme.textColor};
  font-size: 0.875rem;
  font-weight: 400;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;

  @media screen and (min-width: 600px) {
    margin: 1.25rem;
  }
`

export default function Web3Status() {
  const { t } = useTranslation()
  const { chainId, account, activate, deactivate, connector, error } = useWeb3React()

  const ENSName = useENSName(account)

  function onConnect() {
    activate(injected, undefined, true).catch(err => {
      if (err instanceof UnsupportedChainIdError) {
        activate(injected)
      }
    })
  }

  function onLogout() {
    deactivate()
  }

  function getInjectedNetworkName() {
    if (connector !== injected) return getNetworkName()
    return getNetworkName(chainId)
  }

  function getWeb3Account() {
    return account 
      ? ENSName || shortenAddress(account)
      : t('Connect to MetaMask')
  }

  if (error) {
    return (
      <Web3StatusWrapper>
        <Web3NetworkStatus>
          <Web3NetworkIndicator chainId={chainId}/>
          <SubText>Wrong Network</SubText>
        </Web3NetworkStatus>
        <Web3ErrorMessage>
          <span>Please connect to Rinkeby</span>
        </Web3ErrorMessage>
      </Web3StatusWrapper>
    )
  } else if (!account) {
    return <ConnectButton onClick={onConnect}>Connect</ConnectButton>
  } else {
    return (
      <Web3StatusWrapper>
        <Web3NetworkStatus>
          <Web3NetworkIndicator chainId={chainId}/>
          <SubText>{error ? 'Wrong Network' : getInjectedNetworkName(chainId)}</SubText>
        </Web3NetworkStatus>
        <Web3AccountStatus>
          <Text>{getWeb3Account()}</Text>
          <StyledArrowDropDown />
        </Web3AccountStatus>
        <div className="web3-button-wrapper">
          <span><em /></span>
          <Button onClick={onLogout}>Logout</Button>
        </div>
      </Web3StatusWrapper>
    )
  }
}
