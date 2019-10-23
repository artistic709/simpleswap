import React, { useState, useEffect } from 'react'
import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { useWeb3Context } from 'web3-react'
import { transparentize } from 'polished'

import { isAddress } from '../../utils'
import { useDebounce } from '../../hooks'

const InputPanel = styled.div`
  ${({ theme }) => theme.flexColumnNoWrap}
  position: relative;
  z-index: 1;
`
  
const InputContainer = styled.div`
  padding: 0.5rem;
  flex: 1;
`

const LabelRow = styled.div`
  ${({ theme }) => theme.flexRowNoWrap}
  align-items: center;
  color: ${({ theme }) => theme.textBlack};
  font-size: 1rem;
  font-weight: 500;
  padding: 0.5rem 0;
`

const LabelContainer = styled.div`
  flex: 1 1 auto;
  width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
`

const InputRow = styled.div`
  ${({ theme }) => theme.flexRowNoWrap}
  align-items: center;
  padding: 0.5rem;
  border-radius: 0.25rem;
  background-color: ${({ theme }) => theme.white};
  box-shadow: 0 0px 36px 0 ${({ theme }) => transparentize(0.9, theme.shadowColor)};
  `
  
  const Input = styled.input`
  width: 100%;
  height: 2.5rem;
  padding: 0 1rem;
  font-size: 1rem;
  border: none;
  color: ${({ error, theme }) => error && theme.salmonRed};
  background-color: ${({ theme }) => theme.white};
  -moz-appearance: textfield;
  user-select: none;

  &:focus {
    outline: none;
  }

  &::placeholder {
    color: ${({ theme }) => theme.zirconGray};
  }
`

export default function AddressInputPanel({ title, initialInput = '', onChange = () => {}, onError = () => {} }) {
  const { t } = useTranslation()

  const { library } = useWeb3Context()

  const [input, setInput] = useState(initialInput)
  const debouncedInput = useDebounce(input, 150)

  const [data, setData] = useState({ address: undefined, name: undefined })
  const [error, setError] = useState(false)

  // keep data and errors in sync
  useEffect(() => {
    onChange({ address: data.address, name: data.name })
  }, [onChange, data.address, data.name])
  useEffect(() => {
    onError(error)
  }, [onError, error])

  // run parser on debounced input
  useEffect(() => {
    let stale = false

    if (isAddress(debouncedInput)) {
      try {
        library
          .lookupAddress(debouncedInput)
          .then(name => {
            if (!stale) {
              // if an ENS name exists, set it as the destination
              if (name) {
                setInput(name)
              } else {
                setData({ address: debouncedInput, name: '' })
                setError(null)
              }
            }
          })
          .catch(() => {
            if (!stale) {
              setData({ address: debouncedInput, name: '' })
              setError(null)
            }
          })
      } catch {
        setData({ address: debouncedInput, name: '' })
        setError(null)
      }
    } else {
      if (debouncedInput !== '') {
        try {
          library
            .resolveName(debouncedInput)
            .then(address => {
              if (!stale) {
                // if the debounced input name resolves to an address
                if (address) {
                  setData({ address: address, name: debouncedInput })
                  setError(null)
                } else {
                  setError(true)
                }
              }
            })
            .catch(() => {
              if (!stale) {
                setError(true)
              }
            })
        } catch {
          setError(true)
        }
      }
    }

    return () => {
      stale = true
    }
  }, [debouncedInput, library, onChange, onError])

  function onInput(event) {
    if (data.address !== undefined || data.name !== undefined) {
      setData({ address: undefined, name: undefined })
    }
    if (error !== undefined) {
      setError()
    }
    const input = event.target.value
    const checksummedInput = isAddress(input)
    setInput(checksummedInput || input)
  }

  return (
    <InputPanel>
      <InputContainer>
        <LabelRow>
          <LabelContainer>
            <span>{title || t('recipientAddress')}</span>
          </LabelContainer>
        </LabelRow>
        <InputRow>
          <Input
            type="text"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
            placeholder="0x1234..."
            error={input !== '' && error}
            onChange={onInput}
            value={input}
          />
        </InputRow>
      </InputContainer>
    </InputPanel>
  )
}
