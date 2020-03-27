import { InjectedConnector } from '@web3-react/injected-connector'
// import { WalletConnectConnector } from '@web3-react/walletconnect-connector'
// import { WalletLinkConnector } from '@web3-react/walletlink-connector'
// import { PortisConnector } from '@web3-react/portis-connector'

import { NetworkConnector } from './Network'
// import { FortmaticConnector } from './Fortmatic'

const POLLING_INTERVAL = 10000

const INFURA_PREFIXES = {
  1: '',
  3: 'ropsten.',
  4: 'rinkeby.',
  5: 'goerli.',
  42: 'kovan.'
}

function getInfuraUrl(infuraKey, chainId) {
  return `https://${INFURA_PREFIXES[chainId] || INFURA_PREFIXES[1]}infura.io/v3/${infuraKey}`
}

const supportedChainIds = process.env.REACT_APP_SUPPORTED_CHAINIDS
  .split(',')
  .map(id => Number(id))

const urls = supportedChainIds
  .reduce((accumulator, id) => {
    return {
      ...accumulator,
      [id]: getInfuraUrl(process.env.REACT_APP_INFURA_KEY, id)
    }
  }, {
    1: getInfuraUrl(process.env.REACT_APP_INFURA_KEY),
  })

export const network = new NetworkConnector({
  urls,
  pollingInterval: POLLING_INTERVAL * 3,
  defaultChainId: 4,
})

export const injected = new InjectedConnector({
  supportedChainIds
})

// export const walletconnect = new WalletConnectConnector({
//   rpc: { 1: process.env.REACT_APP_NETWORK_URL },
//   bridge: 'https://bridge.walletconnect.org',
//   qrcode: false,
//   pollingInterval: POLLING_INTERVAL
// })

// export const fortmatic = new FortmaticConnector({
//   apiKey: process.env.REACT_APP_FORTMATIC_KEY,
//   chainId: 1
// })

// export const portis = new PortisConnector({
//   dAppId: process.env.REACT_APP_PORTIS_ID,
//   networks: [1]
// })

// export const walletlink = new WalletLinkConnector({
//   url: process.env.REACT_APP_NETWORK_URL,
//   appName: 'Uniswap',
//   appLogoUrl:
//     'https://mpng.pngfly.com/20181202/bex/kisspng-emoji-domain-unicorn-pin-badges-sticker-unicorn-tumblr-emoji-unicorn-iphoneemoji-5c046729264a77.5671679315437924251569.jpg'
// })
