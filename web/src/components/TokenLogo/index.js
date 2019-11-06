import React, { useState } from 'react'
import { useWeb3Context } from 'web3-react'
import styled from 'styled-components'
import { getNetworkName } from '../../utils'

import { ReactComponent as EthereumLogo } from '../../assets/images/ethereum-logo.svg'

const TOKEN_ICON_API = (networkName, address) =>
  `${process.env.PUBLIC_URL}/token-assets/${networkName}/${address}/logo.png`
const BAD_IMAGES = {}

const Image = styled.img`
  width: ${({ size }) => size};
  height: ${({ size }) => size};
  background-color: transparent;
`

const StyledEthereumLogo = styled(EthereumLogo)`
  width: ${({ size }) => size};
  height: ${({ size }) => size};
`

export default function TokenLogo({ address, size = '1.5rem', ...rest }) {
  const [error, setError] = useState(false)
  const { networkId } = useWeb3Context()
  const networkName = getNetworkName(networkId)

  let path = ''
  if (address === 'ETH') {
    return <StyledEthereumLogo size={size} />
  } else if (!error && !BAD_IMAGES[address]) {
    path = TOKEN_ICON_API(networkName.toLowerCase(), address.toLowerCase())
  } else {
    return (
      <span role="img" aria-label="Thinking">
        🤔
      </span>
    )
  }

  return (
    <Image
      {...rest}
      alt={address}
      src={path}
      size={size}
      onError={() => {
        BAD_IMAGES[address] = true
        setError(true)
      }}
    />
  )
}
