import React, { Suspense, lazy, useEffect } from 'react'
import ReactGA from 'react-ga'
import { Switch, Route, Redirect } from 'react-router-dom'

import ModeSelector from './ModeSelector'

const AddLiquidity = lazy(() => import('./AddLiquidity'))
const RemoveLiquidity = lazy(() => import('./RemoveLiquidity'))

export default function Pool() {
  useEffect(() => {
    ReactGA.pageview(window.location.pathname + window.location.search)
  }, [])

  return (
    <>
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
