import React, { useCallback } from 'react'
import { withRouter, NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'
import { transparentize, darken, opacify } from 'polished'

import { useBodyKeyDown } from '../../hooks'

const tabOrder = [
  {
    path: '/swap',
    textKey: 'swap',
    regex: /\/swap/
  },
  {
    path: '/send',
    textKey: 'send',
    regex: /\/send/
  },
  {
    path: 'add-liquidity',
    textKey: 'pool',
    regex: /\/add-liquidity|\/remove-liquidity|\/create-exchange.*/
  }
]

const Tabs = styled.div`
  ${({ theme }) => theme.flexRowNoWrap}
  align-items: center;
  height: 3.5rem;
  background-color: ${({ theme }) => theme.white};
  border-radius: 0.25rem;
  border: 1px solid rgba(0, 0, 0, .2);
  box-shadow: 0 0 36px rgba(0, 0, 0, .1);
  margin-bottom: 2.5rem;

  > *:not(:first-child) {
    border-left: 1px solid rgba(0,0,0,.2);
  }
`

const activeClassName = 'ACTIVE'

const StyledNavLink = styled(NavLink).attrs({
  activeClassName
})`
  ${({ theme }) => theme.flexRowNoWrap}
  align-items: center;
  justify-content: center;
  height: 3.5rem;
  border: 1px solid ${({ theme }) => transparentize(1, theme.mercuryGray)};
  flex: 1 0 auto;
  outline: none;
  cursor: pointer;
  text-decoration: none;
  color: ${({ theme }) => opacify(0.87, theme.black)};
  font-size: 1.25rem;
  font-weight: 500;
  box-sizing: border-box;

  &.${activeClassName} {
    background-color: rgba(81, 144, 245, .15);
    color: ${({ theme }) => theme.nationBlue};
  }

  :hover,
  :focus {
    color: ${({ theme }) => darken(0.1, theme.nationBlue)};
  }
`

function NavigationTabs({ location: { pathname }, history }) {
  const { t } = useTranslation()

  const navigate = useCallback(
    direction => {
      const tabIndex = tabOrder.findIndex(({ regex }) => pathname.match(regex))
      history.push(tabOrder[(tabIndex + tabOrder.length + direction) % tabOrder.length].path)
    },
    [pathname, history]
  )
  const navigateRight = useCallback(() => {
    navigate(1)
  }, [navigate])
  const navigateLeft = useCallback(() => {
    navigate(-1)
  }, [navigate])

  useBodyKeyDown('ArrowRight', navigateRight)
  useBodyKeyDown('ArrowLeft', navigateLeft)

  return (
    <>
      <Tabs>
        {tabOrder.map(({ path, textKey, regex }) => (
          <StyledNavLink key={path} to={path} isActive={(_, { pathname }) => pathname.match(regex)}>
            {t(textKey)}
          </StyledNavLink>
        ))}
      </Tabs>
    </>
  )
}

export default withRouter(NavigationTabs)
