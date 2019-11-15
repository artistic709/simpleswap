import React, { useState, useEffect } from 'react'
import { useWeb3Context, Connectors } from 'web3-react'
import styled from 'styled-components'
import { ethers } from 'ethers'
import { useTranslation } from 'react-i18next'
import { isMobile } from 'react-device-detect'

import { Spinner } from '../../theme'
import Circle from '../../assets/images/circle.svg'
import { ReactComponent as ErrorOutline } from '../../assets/images/error_outline.svg'

const { Connector } = Connectors

const WrongNetworkWarning = styled.div`
  width: 100%;
  height: 4.5rem;
  border-bottom: 2px solid ${({ theme }) => theme.black};
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: ${({ theme }) => theme.midnightBlue};
  color: ${({ theme }) => theme.white};
`

const StyledErrorOutline = styled(ErrorOutline)`
  fill: ${({ theme }) => theme.white};
  width: 1.25rem;
  height: 1.25rem;
  margin-right: 0.5rem;
`


const MessageWrapper = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
`

const Message = styled.h2`
  color: ${({ theme }) => theme.uniswapPink};
`

const SpinnerWrapper = styled(Spinner)`
  font-size: 4rem;

  svg {
    path {
      color: ${({ theme }) => theme.uniswapPink};
    }
  }
`

function tryToSetConnector(setConnector, setError) {
  setConnector('Injected', { suppressAndThrowErrors: true }).catch((error) => {
    setError(error)
    setConnector('Network', { suppressAndThrowErrors: true }).catch(error => {
      setError(error)
    })
  })
}

export default function Web3ReactManager({ children }) {
  const { t } = useTranslation()
  const { active, error, networkId, connectorName, setConnector, setError } = useWeb3Context()

  const [unsupportedNetworkError, setUnsupportedNetworkError] = useState(false)

  // control whether or not we render the error, after parsing
  const blockRender = error && error.code && error.code === Connector.errorCodes.UNSUPPORTED_NETWORK

  useEffect(() => {
    if (!active && !error) {
      if (window.ethereum || window.web3) {
        if (isMobile) {
          tryToSetConnector(setConnector, setError)
        } else {
          const library = new ethers.providers.Web3Provider(window.ethereum || window.web3)
          library.listAccounts().then(accounts => {
            if (accounts.length >= 1) {
              tryToSetConnector(setConnector, setError)
            } else {
              setConnector('Network', { suppressAndThrowErrors: true }).catch(error => {
                setError(error)
              })
            }
          })
        }
      } else {
        setConnector('Network', { suppressAndThrowErrors: true }).catch(error => {
          setError(error)
        })
      }
    }
  }, [active, error, setConnector, setError])

  // parse the error
  useEffect(() => {
    if (error) {
      // if the user changes to the wrong network, unset the connector
      if (error.code === Connector.errorCodes.UNSUPPORTED_NETWORK) {
        setUnsupportedNetworkError(true)
      }
    }
  }, [error, setUnsupportedNetworkError])

  useEffect(() => {
    if (connectorName === 'Injected' && (networkId === 1 || networkId === 4)) {
      setUnsupportedNetworkError(false)
    }
  }, [connectorName, networkId])

  const [showLoader, setShowLoader] = useState(true)
  useEffect(() => {
    const timeout = setTimeout(() => {
      setShowLoader(false)
    }, 600)
    return () => {
      clearTimeout(timeout)
    }
  }, [])

  if (blockRender || unsupportedNetworkError) {
    return (
      <>
        <WrongNetworkWarning>
          <StyledErrorOutline />
          Note: SimoleSwap is currently only available on Mainnet or the Rinkeby Testnet.
        </WrongNetworkWarning>
        {children}
      </>
    )
  } else if (networkId === 4) {
    return (
      <>
        <WrongNetworkWarning>
          <StyledErrorOutline />
          Note: You are currently connected to the Rinkeby Testnet
        </WrongNetworkWarning>
        {children}
      </>
    )
  } else if (error) {
    return (
      <MessageWrapper>
        <Message>{t('unknownError')}</Message>
      </MessageWrapper>
    )
  } else if (!active) {
    return showLoader ? (
      <MessageWrapper>
        <SpinnerWrapper src={Circle} />
      </MessageWrapper>
    ) : null
  } else {
    return children
  }
}
