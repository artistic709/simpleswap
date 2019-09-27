import React from 'react'
import styled from 'styled-components'
import { darken } from 'polished'

import { Link } from '../../theme'
import Web3Status from '../Web3Status'
import { ReactComponent as Logo } from '../../assets/logo.svg'

const HeaderFrame = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  background-color: ${({ theme }) => theme.midnightBlue};
`

const HeaderElement = styled.div`
  margin: 1.25rem;
  display: flex;
  min-width: 0;
  display: flex;
  align-items: center;
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

export default function Header() {
  return (
    <HeaderFrame>
      <HeaderElement>
        <Title>
          <Link id="link" href="/">
            <Logo />
            <h1 id="title">SimpleSwap</h1>
          </Link>
        </Title>
      </HeaderElement>
      <Web3Status />
    </HeaderFrame>
  )
}
