import React from 'react'
import styled, { keyframes } from 'styled-components'
import { useWeb3Context } from 'web3-react'
import Copy from './Copy'

import { getEtherscanLink, shortenTransactionHash } from '../../utils'
import { Link, Spinner } from '../../theme'
import Circle from '../../assets/images/circle.svg'
import { Check } from 'react-feather'

import { transparentize } from 'polished'

const TransactionStatusWrapper = styled.div`
  display: flex;
  align-items: center;
  min-width: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.75rem;
`

const TransactionWrapper = styled.div`
  ${({ theme }) => theme.flexRowNoWrap}
  justify-content: space-between;
  width: 100%;
  margin-top: 0.75rem;
  padding-top: 0.75rem;

  &:not(:first-child) {
    border-top: 1px solid ${({ theme }) => theme.borderColor};
  }

  a {
    /* flex: 1 1 auto; */
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
    max-width: 250px;
  }
`

const TransactionStatusText = styled.span`
  margin-left: 0.5rem;
`

const rotate = keyframes`
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
`

const TransactionState = styled.div`
  display: flex;
  background-color: ${({ pending, theme }) =>
    pending ? transparentize(0.95, theme.royalBlue) : transparentize(0.95, theme.connectedGreen)};
  border-radius: 1.5rem;
  padding: 0.5rem 0.75rem;
  font-weight: 500;
  font-size: 0.75rem;
  border: 1px solid;
  border-color: ${({ pending, theme }) =>
    pending ? transparentize(0.75, theme.royalBlue) : transparentize(0.75, theme.connectedGreen)};

  #pending {
    animation: 2s ${rotate} linear infinite;
  }

  :hover {
    border-color: ${({ pending, theme }) =>
      pending ? transparentize(0, theme.royalBlue) : transparentize(0, theme.connectedGreen)};
  }
`
const ButtonWrapper = styled.div`
  a {
    color: ${({ pending, theme }) => (pending ? theme.royalBlue : theme.connectedGreen)};
  }
`

const TransactionInfoWrapper = styled.div`
  > *:not(:first-child) {
    margin-top: 0.25rem;
  }
`

const TransactionComment = styled.div`
  font-size: 0.75rem;

  @media screen and (min-width: 600px) {
    font-size: 1rem;
  }
`

export default function Transaction({ hash, pending, comment }) {
  const { networkId } = useWeb3Context()

  return (
    <TransactionWrapper key={hash}>
      <TransactionInfoWrapper>
        <TransactionStatusWrapper>
          <Link href={getEtherscanLink(networkId, hash, 'transaction')}>{shortenTransactionHash(hash, 6)} ↗ </Link>
          <Copy toCopy={hash} />
        </TransactionStatusWrapper>
        {comment && <TransactionComment>{comment}</TransactionComment>}
      </TransactionInfoWrapper>
      {pending ? (
        <ButtonWrapper pending={pending}>
          <Link href={getEtherscanLink(networkId, hash, 'transaction')}>
            <TransactionState pending={pending}>
              <Spinner src={Circle} id="pending" />
              <TransactionStatusText>Pending</TransactionStatusText>
            </TransactionState>
          </Link>
        </ButtonWrapper>
      ) : (
        <ButtonWrapper pending={pending}>
          <Link href={getEtherscanLink(networkId, hash, 'transaction')}>
            <TransactionState pending={pending}>
              <Check size="16" />
              <TransactionStatusText>Confirmed</TransactionStatusText>
            </TransactionState>
          </Link>
        </ButtonWrapper>
      )}
    </TransactionWrapper>
  )
}
