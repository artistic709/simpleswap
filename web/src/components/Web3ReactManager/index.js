import React, { useState, useEffect } from 'react'
import styled from 'styled-components'
import { useWeb3React } from '@web3-react/core'

import { network } from '../../connectors'
import { useEagerConnect, useInactiveListener } from '../../hooks'
import { Spinner } from '../../theme'
import Circle from '../../assets/images/circle.svg'
import { ReactComponent as ErrorOutline } from '../../assets/images/error_outline.svg'
import { NetworkContextName } from '../../constants'

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

const SpinnerWrapper = styled(Spinner)`
  font-size: 4rem;

  svg {
    path {
      color: ${({ theme }) => theme.uniswapPink};
    }
  }
`

export default function Web3ReactManager({ children }) {
  const { active, chainId, error } = useWeb3React()
  const { active: networkActive, error: networkError, activate: activateNetwork } = useWeb3React(NetworkContextName)

  // try to eagerly connect to an injected provider, if it exists and has granted access already
  const triedEager = useEagerConnect()

  // after eagerly trying injected, if the network connect ever isn't active or in an error state, activate itd
  // TODO think about not doing this at all
  useEffect(() => {
    if (triedEager && !networkActive && !networkError && !active) {
      activateNetwork(network)
    }
  }, [triedEager, networkActive, networkError, activateNetwork, active])

  // 'pause' the network connector if we're ever connected to an account and it's active
  useEffect(() => {
    if (active && networkActive) {
      network.pause()
    }
  }, [active, networkActive])

  // 'resume' the network connector if we're ever not connected to an account and it's active
  useEffect(() => {
    if (!active && networkActive) {
      network.resume()
    }
  }, [active, networkActive])

  // when there's no account connected, react to logins (broadly speaking) on the injected provider, if it exists
  useInactiveListener(!triedEager)
  const [showLoader, setShowLoader] = useState(true)
  useEffect(() => {
    const timeout = setTimeout(() => {
      setShowLoader(false)
    }, 600)
    return () => {
      clearTimeout(timeout)
    }
  }, [])

  if (error) {
    return (
      <>
        <WrongNetworkWarning>
          <StyledErrorOutline />
          Note: StableSwap is currently only available on Mainnet or the Rinkeby Testnet.
        </WrongNetworkWarning>
        {children}
      </>
    )
  } else if (chainId === 4) {
    return (
      <>
        <WrongNetworkWarning>
          <StyledErrorOutline />
          Note: You are currently connected to the Rinkeby Testnet
        </WrongNetworkWarning>
        {children}
      </>
    )
  } else {
    return showLoader ? (
      <MessageWrapper>
        <SpinnerWrapper src={Circle} />
      </MessageWrapper>
    ) : children
  }
}
