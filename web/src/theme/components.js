import styled, { keyframes } from 'styled-components'
import { darken } from 'polished'

export const Button = styled.button.attrs(({ warning, theme }) => ({
  backgroundColor: warning ? theme.cgRed : theme.franceBlue
}))`
  border-radius: 0.25rem;
  cursor: pointer;
  user-select: none;
  font-size: 1.25rem;
  border: none;
  outline: none;
  background-color: ${({ backgroundColor }) => backgroundColor};
  color: ${({ theme }) => theme.white};
  width: 100%;
  height: 3.5rem;
  display: flex;
  justify-content: center;
  align-items: center;

  :hover,
  :focus {
    background-color: ${({ backgroundColor }) => darken(0.05, backgroundColor)};
  }

  :active {
    background-color: ${({ backgroundColor }) => darken(0.1, backgroundColor)};
  }

  :disabled {
    background-color: ${({ theme }) => theme.zirconGray};
    color: ${({ theme }) => theme.mistGray};
    cursor: auto;
  }
`

export const Link = styled.a.attrs({
  target: '_blank',
  rel: 'noopener noreferrer'
})`
  text-decoration: none;
  cursor: pointer;
  color: ${({ theme }) => theme.royalBlue};

  :focus {
    outline: none;
    text-decoration: underline;
  }

  :active {
    text-decoration: none;
  }
`

export const BorderlessInput = styled.input`
  color: ${({ theme }) => theme.textColor};
  font-size: 1rem;
  outline: none;
  border: none;
  flex: 1 1 auto;
  width: 0;
  background-color: ${({ theme }) => theme.inputBackground};

  [type='number'] {
    -moz-appearance: textfield;
  }

  ::-webkit-outer-spin-button,
  ::-webkit-inner-spin-button {
    -webkit-appearance: none;
  }

  ::placeholder {
    color: ${({ theme }) => theme.chaliceGray};
  }
`

const rotate = keyframes`
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
`

export const Spinner = styled.img`
  animation: 2s ${rotate} linear infinite;
  width: 16px;
  height: 16px;
`
