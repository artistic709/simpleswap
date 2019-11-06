import React from 'react'
import { Link as RouteLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'
import { darken } from 'polished'
import { isMobile } from 'react-device-detect'

import { Link } from '../../theme'
import Web3Status from '../Web3Status'
import { ReactComponent as Logo } from '../../assets/logo.svg'
import { ReactComponent as Pool } from '../../assets/images/pool.svg'
import { ReactComponent as Swap } from '../../assets/images/swap.svg'

const HeaderFrame = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  background-color: ${({ theme }) => theme.midnightBlue};
`

const HeaderElement = styled.div`
  margin: 0.75rem;
  display: flex;
  min-width: 0;
  display: flex;
  align-items: center;

  @media screen and (min-width: 600px) {
    margin: 1.25rem;
  }
`

const Title = styled.div`
  display: flex;
  align-items: center;

  :hover {
    cursor: pointer;
  }

  a {
    display: inline-flex;
    align-items: center;
  }

  #title {
    display: none;
    margin-left: 0.75rem;
    font-size: 1rem;
    font-weight: 500;
    color: ${({ theme }) => theme.white};
    :hover {
      color: ${({ theme }) => darken(0.1, theme.white)};
    }
    
    @media screen and (min-width: 600px) {
      display: inline;
    }
  }
`

const HeaderActions = styled.div`
  display: flex;
  align-items: center;

  > *:not(:last-child) {
    margin-right: 0.75rem;
    
    @media screen and (min-width: 600px) {
      margin-right: 1.5rem;
    }
  }
`

const HeaderLink = styled(RouteLink)`
  display: flex;
  align-itmes: center;
  margin: ${isMobile ? '0.75rem' : '0'};

  > *:not(:first-child) {
    margin-left: 0.25rem;
  }
`

const StyledPool = styled(Pool)`
  width: 1rem;
  height: 1rem;

  @media screen and (min-width: 600px) {
    width: 1.5rem;
    height: 1.5rem;
  }
`

const StyledSwap = styled(Swap)`
  width: 1rem;
  height: 1rem;

  @media screen and (min-width: 600px) {
    width: 1.5rem;
    height: 1.5rem;
  }
`

const Text = styled.div`
  font-size: 0.75rem;
  font-weight: 400;
  color: ${({ theme }) => theme.white};

  @media screen and (min-width: 600px) {
    font-size: 1.25rem
  }
`

export default function Header() {
  const { t } = useTranslation()
  const { pathname } = useLocation()

  const renderHeaderLinks = () => {
    if (pathname === '/swap') {
      return (
        <HeaderLink to="/add-liquidity">
          <StyledPool />
          <Text>{t('pool')}</Text>
        </HeaderLink>
      )
    } else {
      return (
        <HeaderLink to='/swap'>
          <StyledSwap />
          <Text>{t('swap')}</Text>
        </HeaderLink>
      )
    }
  }

  return (
    <HeaderFrame>
      <HeaderElement>
        <Title>
          <Link id="link" href="/">
            <Logo />
            <h1 id="title">StableSwap</h1>
          </Link>
        </Title>
      </HeaderElement>
      <HeaderActions>
        {renderHeaderLinks()}
        {!isMobile && <Web3Status />}
      </HeaderActions>
    </HeaderFrame>
  )
}
