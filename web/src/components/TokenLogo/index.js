import React, { useState } from 'react'
import styled from 'styled-components'
import { useWeb3React } from '../../hooks'
import { getNetworkName } from '../../utils'

import { ReactComponent as DefaultTokenLogo } from '../../assets/images/default-token-logo.svg'
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

const StyledDefaultTokenLogo = styled(DefaultTokenLogo)`
  width: ${({ size }) => size};
  height: ${({ size }) => size};
`

export default function TokenLogo({ address, size = '1.5rem', ...rest }) {
  const [error, setError] = useState(false)
  const { chainId } = useWeb3React()
  const networkName = getNetworkName(chainId)

  let path = ''
  if (address === 'ETH') {
    return <StyledEthereumLogo size={size} />
  } else if (!error && !BAD_IMAGES[address]) {
    path = TOKEN_ICON_API(networkName.toLowerCase(), address.toLowerCase())
  } else {
    return (
      <StyledDefaultTokenLogo size={size} />
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
