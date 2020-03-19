import React from 'react'
import styled from 'styled-components'

const FooterContainer = styled.div`
  position: fixed;
  bottom: 0;
  padding: 2.5rem;
  display: none;
  align-items: center;

  > *:not(:first-child) {
    margin-left: 56px;
  }

  @media screen and (min-width: 600px) {
    display: flex;
  }
`

const FooterLink = styled.a`
  font-size: 0.875rem;
  font-weight: 500;
  color: ${({ theme }) => theme.footerGray};
  text-decoration: none;
`

export default function Footer() {
  const githubURL = process.env.REACT_APP_GITHUB_ORGANIZATION_URL || '#'
  const docsURL = process.env.REACT_APP_DOCS_REPO_URL || '#'
  const faqURL = process.env.REACT_APP_FAQ_URL || '#'

  return (
    <FooterContainer>
      <FooterLink href={githubURL} target='_blank'>GitHub</FooterLink>
      <FooterLink href={docsURL} target='_blank'>Docs</FooterLink>
      <FooterLink href={faqURL} target='_blank'>FAQ</FooterLink>
    </FooterContainer>
  )
}