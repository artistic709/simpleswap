import React, { useState, useEffect } from 'react'
import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { useWeb3Context, Connectors } from 'web3-react'
import { ethers } from 'ethers'
import WalletModal from '../WalletModal'
import { shortenAddress, getNetworkName } from '../../utils'
import { useENSName } from '../../hooks'
import { useAllTransactions } from '../../contexts/Transactions'
import { ReactComponent as ArrowDropDown } from '../../assets/images/arrow_drop_down.svg'

const { Connector } = Connectors

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
  background-color: ${({ theme, networkId }) => {
    if (networkId === 1) {
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

export default function Web3Status() {
  const { t } = useTranslation()
  const { active, networkId, account, connectorName, setConnector } = useWeb3Context()

  const ENSName = useENSName(account)

  const [isOpen, setIsOpen] = useState(false)
  const [error, setError] = useState()

  const allTransactions = useAllTransactions()

  const pending = Object.keys(allTransactions)
    .map(hash => allTransactions[hash])
    .filter(transaction => !transaction.receipt)

  const confirmed = Object.keys(allTransactions)
    .map(hash => allTransactions[hash])
    .filter(transaction => transaction.receipt)
  // const hasPendingTransactions = !!pending.length

  // janky logic to detect log{ins,outs}...
  useEffect(() => {
    // if the injected connector is not active...
    const { ethereum } = window
    if (connectorName !== 'Injected') {
      if (connectorName === 'Network' && ethereum && ethereum.on && ethereum.removeListener) {
        function tryToActivateInjected() {
          const library = new ethers.providers.Web3Provider(window.ethereum)
          // if calling enable won't pop an approve modal, then try to activate injected...
          library.listAccounts().then(accounts => {
            if (accounts.length >= 1) {
              setConnector('Injected', { suppressAndThrowErrors: true })
                .then(() => {
                  setError()
                })
                .catch(error => {
                  // ...and if the error is that they're on the wrong network, display it, otherwise eat it
                  if (error.code === Connector.errorCodes.UNSUPPORTED_NETWORK) {
                    setError(error)
                  }
                })
            }
          })
        }

        ethereum.on('networkChanged', tryToActivateInjected)
        ethereum.on('accountsChanged', tryToActivateInjected)

        return () => {
          if (ethereum.removeListener) {
            ethereum.removeListener('networkChanged', tryToActivateInjected)
            ethereum.removeListener('accountsChanged', tryToActivateInjected)
          }
        }
      }
    } else {
      // ...poll to check the accounts array, and if it's ever 0 i.e. the user logged out, update the connector
      if (ethereum) {
        const accountPoll = setInterval(() => {
          const library = new ethers.providers.Web3Provider(ethereum)
          Promise.all([library.listAccounts(), library.getNetwork()])
            .then(([accounts, network]) => {
              if (accounts.length === 0 || network.chainId !== networkId) {
                setConnector('Network')
              }
            })
        }, 750)

        return () => {
          clearInterval(accountPoll)
        }
      }
    }
  }, [connectorName, setConnector, setError, networkId])

  function openWalletModal() {
    setIsOpen(true)
  }

  function closeWalletModal() {
    setIsOpen(false)
  }

  function onClick() {
    if (account) {
      setConnector('Network').catch(err => {
        setError(err)
      })
    } else {
      setConnector('Injected', { suppressAndThrowErrors: true }).catch(err => {
        if (err.code === Connector.errorCodes.UNSUPPORTED_NETWORK) {
          setError(err)
        }
      })
    }
  }

  function getInjectedNetworkName() {
    if (connectorName !== 'Injected') return getNetworkName()
    return getNetworkName(networkId)
  }

  function getWeb3Account() {
    return account 
      ? ENSName || shortenAddress(account)
      : t('Connect to MetaMask')
  }

  return (
    active && (
      <Web3StatusWrapper>
        <Web3NetworkStatus>
          <Web3NetworkIndicator />
          <SubText>{error ? 'Wrong Network' : getInjectedNetworkName(networkId)}</SubText>
        </Web3NetworkStatus>
        {
          error 
            ? (
              <Web3ErrorMessage>
                <span>Please connect to Rinkeby</span>
              </Web3ErrorMessage>
            )
            : (
              <Web3AccountStatus>
                <Text>{getWeb3Account()}</Text>
                <StyledArrowDropDown />
              </Web3AccountStatus>
            )
        }
        <div className="web3-button-wrapper">
          <span><em /></span>
          <Button onClick={onClick}>{account ? 'Logout' : 'Connect'}</Button>
          { account && <Button onClick={openWalletModal}>Wallet</Button>}
        </div>
        <WalletModal
          isOpen={isOpen}
          error={error}
          onDismiss={closeWalletModal}
          ENSName={ENSName}
          pendingTransactions={pending}
          confirmedTransactions={confirmed}
        />
      </Web3StatusWrapper>
    )
  )
}
