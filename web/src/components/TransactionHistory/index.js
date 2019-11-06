import React, { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useWeb3Context } from 'web3-react'
import styled from 'styled-components'
import { darken } from 'polished'
import { format } from 'date-fns'
import { useAllTransactions } from '../../contexts/Transactions'
import { Link } from '../../theme'
import { getEtherscanLink, shortenTransactionHash } from '../../utils'

const Panel = styled.div`
  ${({ theme }) => theme.flexColumnNoWrap}
  position: relative;
`

const Container = styled.div`
  padding: 0.5rem;
  border-radius: 0.25rem;
`

const LabelRow = styled.div`
  ${({ theme }) => theme.flexRowNoWrap}
  align-items: center;
  color: ${({ theme }) => theme.textBlack};
  font-size: 1rem;
  font-weight: 500;
  padding-bottom: 0.5rem;
  span:hover {
    color: ${({ theme }) => darken(0.2, theme.doveGray)};
  }
`

const LabelTitle = styled.div`
  flex: 1 1 auto;
  width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
`

const TransactionContainer = styled.div`
  ${({ theme }) => theme.flexRowNoWrap}
  flex-direction: column;
  padding: 0.75rem;
  border-radius: 0.25rem;
  background: ${({ theme }) => theme.white};
`

const TransactionTitle = styled.div`
  min-height: 2.5rem;
  margin-left: 1rem;
  border-left: 1px solid #E6E8E9;
  padding: 0 1rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 1rem;
  color: #1F2734;
`

const TransactionSubTitle = styled.div`
  position: relative;
  margin-left: 1rem;
  padding: 0.5rem 1rem;
  font-size: 0.75rem;
  color: ${({ theme }) => theme.mistGray};

  &::after {
    content: '';
    position: absolute;
    top: 0.75rem;
    left: -0.25rem;
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 0.75rem;
    background-color: #DEE0E1;
  }

  a {
    font-style: italic;
  }
`
const TimeSpan = styled.span`
  padding-right: 0.5rem;
  border-right: 1px solid #DEE0E1;
  margin-right: 0.5rem;
`

const Message = styled.div`
  margin: 0;
  font-weight: 400;
  color: ${({ theme }) => theme.mistGray};
`

export default function TransactionHistory() {
  const { t } = useTranslation()
  const { networkId, account } = useWeb3Context()

  const allTransactions = useAllTransactions()

  const transactions = useMemo(() => {
    return Object.keys(allTransactions)
      .map(hash => allTransactions[hash])
      .filter(transaction => transaction.receipt)
      .filter(transaction => transaction.receipt.from === account)
      .sort((a, b) => b.timestamp - a.timestamp)
  }, [allTransactions, account])

  const renderHistoryList = () => {
    if (transactions.length) {
      return (
        <>
          {transactions.map(transaction => (
            <div key={transaction.response.hash}>
              <TransactionSubTitle>
                <TimeSpan>{format(new Date(transaction.timestamp * 1000), "MMM d, Y 'at' HH:mm:ss")} | {' '}</TimeSpan>
                <Link href={getEtherscanLink(networkId, transaction.response.hash, 'transaction')}>{shortenTransactionHash(transaction.response.hash)}</Link>
              </TransactionSubTitle>
              <TransactionTitle>{transaction.response['CUSTOM_DATA'].comment}</TransactionTitle>
            </div>
          ))}
        </>
      )
    } else {
      return (
        <Message>Your confirmed transactions will appear here...</Message>
      )
    }
  }

  return (
    <Panel>
      <Container>
        <LabelRow>
          <LabelTitle>
            <span>{t('history')}</span>
          </LabelTitle>
        </LabelRow>
        <TransactionContainer>
          {renderHistoryList()}
        </TransactionContainer>
      </Container>
    </Panel>
  )
}
