import React, { Suspense, lazy } from 'react'
import styled from 'styled-components'
import { BrowserRouter, Redirect, Route, Switch } from 'react-router-dom'

import Web3ReactManager from '../components/Web3ReactManager'
import Header from '../components/Header'
import Footer from '../components/Footer'
import { isAddress } from '../utils'

const Swap = lazy(() => import('./Swap'))
const Send = lazy(() => import('./Send'))
const Pool = lazy(() => import('./Pool'))

const AppWrapper = styled.div`
  display: flex;
  flex-flow: column;
  align-items: flex-start;
  height: 100vh;
  overflow: hidden;
`

const HeaderWrapper = styled.div`
  ${({ theme }) => theme.flexRowNoWrap}
  width: 100%;
  justify-content: space-between;
`

const BodyWrapper = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  justify-content: flex-start;
  align-items: center;
  flex: 1;
  overflow: auto;
  background-color: #EAEEF4;
`

const Body = styled.div`
  max-width: 35rem;
  width: 90%;
  padding: 1rem 0;
  /* margin: 0 1.25rem 1.25rem 1.25rem; */
`

const FooterWrapper = styled.div`
  ${({ theme }) => theme.flexRowNoWrap}
  width: 100%;
  justify-content: space-between;
`

export default function App() {
  return (
    <>
      <Suspense fallback={null}>
        <AppWrapper>
          <BrowserRouter>
            <Web3ReactManager>
              <HeaderWrapper>
                <Header />
              </HeaderWrapper>
              <BodyWrapper>
                <Body>
                      {/* this Suspense is for route code-splitting */}
                      <Suspense fallback={null}>
                        <Switch>
                          <Route exact strict path="/swap" component={Swap} />
                          <Route
                            exact
                            strict
                            path="/swap/:tokenAddress?"
                            render={({ match }) => {
                              if (isAddress(match.params.tokenAddress)) {
                                return <Swap initialCurrency={isAddress(match.params.tokenAddress)} />
                              } else {
                                return <Redirect to={{ pathname: '/swap' }} />
                              }
                            }}
                          />
                          <Route exact strict path="/send" component={Send} />
                          <Route
                            exact
                            strict
                            path="/send/:tokenAddress?"
                            render={({ match }) => {
                              if (isAddress(match.params.tokenAddress)) {
                                return <Send initialCurrency={isAddress(match.params.tokenAddress)} />
                              } else {
                                return <Redirect to={{ pathname: '/send' }} />
                              }
                            }}
                          />
                          <Route
                            path={[
                              '/add-liquidity',
                              '/remove-liquidity',
                              '/create-exchange',
                              '/create-exchange/:tokenAddress?'
                            ]}
                            component={Pool}
                          />
                          <Redirect to="/swap" />
                        </Switch>
                      </Suspense>
                </Body>
              </BodyWrapper>
              <FooterWrapper>
                <Footer />
              </FooterWrapper>
            </Web3ReactManager>
          </BrowserRouter>
        </AppWrapper>
      </Suspense>
    </>
  )
}
