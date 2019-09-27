import React, { Suspense, lazy, useEffect } from 'react'
import ReactGA from 'react-ga'
import styled from 'styled-components'
import { Switch, Route, Redirect, Link } from 'react-router-dom'
import { ChevronLeft } from 'react-feather'
import { useTranslation } from 'react-i18next'

import ModeSelector from './ModeSelector'

const AddLiquidity = lazy(() => import('./AddLiquidity'))
const RemoveLiquidity = lazy(() => import('./RemoveLiquidity'))

const BackLink = styled(Link)`
  display: inline-flex;
  margin-bottom: 2.25rem;
  justify-content: center;
  align-items: center;
  font-size: 1rem;
  font-weight: 400;
  color: ${({ theme }) => theme.nationBlue};
  text-decoration: none;
  &:hover {
    text-decoration: underline;
  }
`

export default function Pool() {
  const { t } = useTranslation()

  useEffect(() => {
    ReactGA.pageview(window.location.pathname + window.location.search)
  }, [])

  return (
    <>
      <BackLink to="/swap">
        <ChevronLeft />
        <span>{t('Back to swap your tokens')}</span>
      </BackLink>
      <ModeSelector />
      {/* this Suspense is for route code-splitting */}
      <Suspense fallback={null}>
        <Switch>
          <Route exact strict path="/add-liquidity" component={AddLiquidity} />
          <Route exact strict path="/remove-liquidity" component={RemoveLiquidity} />
          <Redirect to="/add-liquidity" />
        </Switch>
      </Suspense>
    </>
  )
}
