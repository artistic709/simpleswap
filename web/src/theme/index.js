import React from 'react'
import { ThemeProvider as StyledComponentsThemeProvider, createGlobalStyle, css } from 'styled-components'
import { useDarkModeManager } from '../contexts/LocalStorage'

export * from './components'

const MEDIA_WIDTHS = {
  upToSmall: 600,
  upToMedium: 960,
  upToLarge: 1280
}

const mediaWidthTemplates = Object.keys(MEDIA_WIDTHS).reduce((accumulator, size) => {
  accumulator[size] = (...args) => css`
    @media (max-width: ${MEDIA_WIDTHS[size]}px) {
      ${css(...args)}
    }
  `
  return accumulator
}, {})

const flexColumnNoWrap = css`
  display: flex;
  flex-flow: column nowrap;
`

const flexRowNoWrap = css`
  display: flex;
  flex-flow: row nowrap;
`

const white = '#FFFFFF'
const black = '#000000'

const theme = darkMode => ({
  white,
  black,
  textColor: darkMode ? white : '#010101',

  // for setting css on <html>
  backgroundColor: darkMode ? '#333639' : '#EAEEF4',

  modalBackground: darkMode ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.3)',
  inputBackground: darkMode ? '#202124' : white,
  placeholderGray: darkMode ? '#5F5F5F' : '#E1E1E1',
  shadowColor: darkMode ? '#000' : '#2F80ED',
  borderColor: 'rgba(0,0,0,0.2)',

  // grays
  concreteGray: darkMode ? '#292C2F' : '#FAFAFA',
  mercuryGray: darkMode ? '#333333' : '#E1E1E1',
  silverGray: darkMode ? '#737373' : '#C4C4C4',
  chaliceGray: darkMode ? '#7B7B7B' : '#AEAEAE',
  doveGray: darkMode ? '#C4C4C4' : '#737373',
  mineshaftGray: darkMode ? '#E1E1E1' : '#2B2B2B',
  buttonOutlineGrey: darkMode ? '#FAFAFA' : '#F2F2F2',
  tokenRowHover: darkMode ? '#404040' : '#F2F2F2',
  zirconGray: '#E0E0E0',
  mistGray: '#959595',
  osloGray: '#8B8F95',
  solitude: '#EAEEF4',

  //blacks
  charcoalBlack: darkMode ? '#F2F2F2' : '#404040',
  textBlack: 'rgba(0, 0, 0, 0.78)',

  // blues
  zumthorBlue: darkMode ? '#212529' : '#EBF4FF',
  malibuBlue: darkMode ? '#E67AEF' : '#5CA2FF',
  royalBlue: darkMode ? '#DC6BE5' : '#2F80ED',
  loadingBlue: darkMode ? '#e4f0ff' : '#e4f0ff',
  midnightBlue: '#1F2734',
  nationBlue: '#5190F5',
  chetwodeBlue: '#5969B3',
  franceBlue: '#3B83F7',

  // purples
  wisteriaPurple: '#DC6BE5',
  // reds
  salmonRed: '#FF6871',
  cgRed: '#E33427',
  // orange
  pizazzOrange: '#FF8F05',
  seaBuckthorn: '#EF9B4B',

  // yellows
  warningYellow: '#FFE270',
  sandYellow: '#ECC564',
  // pink
  uniswapPink: '#DC6BE5',
  connectedGreen: '#27AE60',

  // green
  meadowGreen: '#21B393',
  etonGreen: '#93D198',
  emerald: '#5CC77B',

  //specific
  textHover: darkMode ? theme.uniswapPink : theme.doveGray,

  // media queries
  mediaWidth: mediaWidthTemplates,
  // css snippets
  flexColumnNoWrap,
  flexRowNoWrap
})

export default function ThemeProvider({ children }) {
  const [darkMode] = useDarkModeManager()

  return <StyledComponentsThemeProvider theme={theme(darkMode)}>{children}</StyledComponentsThemeProvider>
}

export const GlobalStyle = createGlobalStyle`
  @import url('https://rsms.me/inter/inter.css');
  html { font-family: 'Roboto', 'Inter', sans-serif; }
  @supports (font-variation-settings: normal) {
    html { font-family: 'Roboto', 'Inter var', sans-serif; }
  }
  
  html,
  body {
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;    
  }

  body > div {
    height: 100%;
    overflow: scroll;
    -webkit-overflow-scrolling: touch;
  }

  html {
    font-size: 16px;
    font-variant: none;
    color: ${({ theme }) => theme.textColor};
    background-color: ${({ theme }) => theme.backgroundColor};
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    -webkit-tap-highlight-color: rgba(0, 0, 0, 0);
  }

  * {
    box-sizing: border-box;
  }
`
