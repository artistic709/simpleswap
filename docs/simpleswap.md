# SimpleSwap contracts
SimpleSwap protocol provides an interface for seamless exchange of ERC20 tokens on Ethereum. By eliminating unnecessary forms of rent extraction and middlemen it allows faster, more efficient exchange. Token listing is open and free. All smart contract functions are public and all upgrades are opt-in.


## Features
* Use USDx as reserve token in the exchange for token pairs
* Add support for any ERC20 token using ERC1155
* Join liquidity pools to collect fees on USDx-ERC20 pairs
* Liquidity-sensitive automated pricing using constant product formula
* Trade USDx for any ERC20 without wrapping
* Trade any ERC20 for any ERC20 in a single transaction
* Trade and transfer to a different address in a single transaction
* Lowest gas cost of any decentralized exchange


## How does it work
Unlike Uniswap is made up of a series of ETH-ERC20 exchange contracts, SimpleSwap is just one contract followed by ERC1155 to track balances of token pairs. This can bring some benefits below.
  1. Reduce gas in the situation of trading ERC20 for ERC20. SimpleSwap only need to update contract state without any internal transactions, however uniswap need some internal transactions.
  2. No need to create new contract when creating a liquidity pool of new ERC20. Again, SimpleSwap only need to update contract state to add new liquidity pool. Therefore, SimpleSwap has no behaviors like creating exchange.

SimpleSwap holds reserves of both USDx and its associated ERC20 token. Anyone can become a liquidity provider on the exchange and contribute to its reserves. This is different than buying or selling; it requires depositing an equivalent value of both USDx and the relevant ERC20 token.
Liquidity is pooled across all providers and ERC1155 `balanceOf(address _owner, uint256 _id)` is used to track each providers relative contribution. "_id" is `uint256(tokenAddress)` which is  represented by ERC20. Balance for token id increases when liquidity is deposited into the system and can decrease at any time to withdraw a proportional share of the reserves.

SimpleSwap is automated market makers between an USDx-ERC20 pair. Traders can swap between the two in either direction by adding to the liquidity reserve of one and withdrawing from the reserve of the other.


## API References

### getInputPrice

Pricing function for selling tokens for another.

```solidity
function getInputPrice(uint256 input_amount, uint256 input_reserve, uint256 output_reserve) public view returns (uint256)
```

| Parameter | Type | Description |
| :--- | :--- | ---: |
| input\_amount | uint256 | Amount of Tokens being sold |
| input\_reserve | uint256 | Amount of Tokens in exchange reserves |
| output\_reserve | uint256 | Amount of Tokens in exchange reserves |

| Returns |  |
| :--- | ---: |
| uint256 | Amount of Tokens bought |


### getOutputPrice

Pricing function for buying tokens for another.

```solidity
function getOutputPrice(uint256 output_amount, uint256 input_reserve, uint256 output_reserve) public view returns (uint256)
```

| Parameter | Type | Description |
| :--- | :--- | ---: |
| output\_amount | uint256 | Amount of Tokens being bought |
| input\_reserve | uint256 | Amount of Tokens in exchange reserves |
| output\_reserve | uint256 | Amount of Tokens in exchange reserves |

| Returns |  |
| :--- | ---: |
| uint256 | Amount of Tokens sold |


### USDXToTokenSwapInput

Convert USDX to tokens.

```solidity
function USDXToTokenSwapInput(address token, uint256 USDX_sold,  uint256 min_tokens, uint256 deadline) public returns (uint256)
```

| Parameter | Type | Description |
| :--- | :--- | ---: |
| token | address | Address of Tokens bought |
| USDX\_sold | uint256 | Amount of USDX user wants to pay |
| min_tokens | uint256 | Minium Tokens bought |
| deadline | uint256 | Time after which this transaction can no longer be executed |

| Returns |  |
| :--- | ---: |
| uint256 | Amount of Tokens bought |


### USDCToTokenTransferInput

Convert USDX to Tokens and transfers Tokens to recipient.

```solidity
function USDXToTokenTransferInput(address token, uint256 USDX_sold, uint256 min_tokens, uint256 deadline, address recipient) public returns(uint256)
```

| Parameter | Type | Description |
| :--- | :--- | ---: |
| token | address | Address of Tokens bought |
| USDX\_sold | uint256 | Amount of USDX user wants to pay |
| min\_tokens | uint256 | Minium Tokens bought |
| deadline | uint256 | Time after which this transaction can no longer be executed |
| recipient | address | The addresss that recieves output Tokens |

| Returns |  |
| :--- | ---: |
| uint256 | Amount of Tokens bought |


### USDXToTokenSwapOutput

Convert USDX to Tokens.

```solidity
function USDXToTokenSwapOutput(address token, uint256 tokens_bought, uint256 max_USDX, uint256 deadline) public returns(uint256)
```

| Parameter | Type | Description |
| :--- | :--- | ---: |
| token | address | Address of Tokens bought |
| toknes\_bought | uint256 | Amount of token bought |
| max\_USDX | uint256 | Maxium amount of USDX sold |
| deadline | uint256 | Time after which this transaction can no longer be executed |

| Returns |  |
| :--- | ---: |
| uint256 | Amount of USDX sold |


### USDXToTokenTransferOutput

Convert USDX to Tokens and transfer Tokens to recipient.

```solidity
function USDXToTokenTransferOutput(address token, uint256 tokens_bought, uint256 max_USDX, uint256 deadline, address recipient) public returns (uint256)
```

| Parameter | Type | Description |
| :--- | :--- | ---: |
| token | address | Address of Tokens bought |
| tokens\_bought | uint256 | Amount of token bought |
| max\_USDX | uint256 | Maxium amount of USDX sold |
| deadline | uint256 | Time after which this transaction can no longer be executed |
| recipient | address | The addresss that recieves output Tokens |

| Returns |  |
| :--- | ---: |
| uint256 | Amount of USDX sold |


### tokenToUSDXSwapInput

Convert Tokens to USDX.

```solidity
function tokenToUSDXSwapInput(address token, uint256 tokens_sold, uint256 min_USDX, uint256 deadline) public returns (uint256)
```

| Parameter | Type | Description |
| :--- | :--- | ---: |
| token | address | Address of Tokens sold |
| tokens\_sold | uint256 | Amount of Tokens sold |
| min_USDX | uint256 | Minium USDX bought |
| deadline | uint256 | Time after which this transaction can no longer be executed |

| Returns |  |
| :--- | ---: |
| uint256 | Amount of USDX bought |


### tokenToUSDXTransferInput

Convert Tokens to USDX and transfer USDX to recipient

```solidity
function tokenToUSDXTransferInput(address token, uint256 tokens_sold, uint256 min_USDX, uint256 deadline, address recipient) public returns (uint256)
```

| Parameter | Type | Description |
| :--- | :--- | ---: |
| token | address | Address of Tokens sold |
| tokens\_sold | uint256 | Amount of Tokens sold |
| min\_USDX | uint256 | Minium USDX bought |
| deadline | uint256 | Time after which this transaction can no longer be executed |
| recipient | address | The addresss that recieves output Tokens |

| Returns |  |
| :--- | ---: |
| uint256 | Amount of USDX bought |


### tokenToUSDXSwapOutput

Convert Tokens to USDX.

```solidity
function tokenToUSDXSwapOutput(address token, uint256 USDX_bought, uint256 max_tokens, uint256 deadline) public returns (uint256)
```

| Parameter | Type | Description |
| :--- | :--- | ---: |
| token | address | Address of Tokens sold |
| USDX\_bought | uint256 | Amount of USDX bought |
| max\_tokens | uint256 | Maxium Tokens sold |
| deadline | uint256 | Time after which this transaction can no longer be executed |

| Returns |  |
| :--- | ---: |
| uint256 | Amount of Tokens sold |


### tokenToUSDXTransferOutput

Convert Tokens to USDX and transfers USDX to recipient.

```solidity
function tokenToUSDXTransferOutput(address token, uint256 USDX_bought, uint256 max_tokens, uint256 deadline, address  recipient) public returns (uint256)
```

| Parameter | Type | Description |
| :--- | :--- | ---: |
| token | address | Address of Tokens sold |
| USDX\_bought | uint256 | Amount of USDX bought |
| max\_tokens | uint256 | Maxium Tokens sold |
| deadline | uint256 | Time after which this transaction can no longer be executed |
| recipient | address | The addresss that recieves output Tokens |

| Returns |  |
| :--- | ---: |
| uint256 | Amount of Tokens sold |


### tokenToTokenSwapInput

Convert Tokens to Tokens.

```solidity
function tokenToTokenSwapInput(address input_token, address output_token, uint256 tokens_sold, uint256 min_tokens_bought, uint256 deadline) public returns (uint256)
```

| Parameter | Type | Description |
| :--- | :--- | ---: |
| input\_token | address | Address of Tokens sold |
| output\_token | address | Address of Tokens bought |
| tokens\_sold | uint256 | Amount of Tokens sold |
| min_tokens_bought | uint256 | Minium amount of Tokens bought |
| deadline | uint256 | Time after which this transaction can no longer be executed |

| Returns |  |
| :--- | ---: |
| uint256 | Amount of Tokens bought |


### tokenToTokenTransferInput

Convert Tokens to Tokens and transfers Tokens to recipient.

```solidity
function tokenToTokenTransferInput(address input_token, address output_token, uint256 tokens_sold, uint256 min_tokens_bought, uint256 deadline, address recipient) public returns (uint256)
```

| Parameter | Type | Description |
| :--- | :--- | ---: |
| input\_token | address | Address of Tokens sold |
| output\_token | address | Address of Tokens bought |
| tokens\_sold | uint256 | Amount of Tokens sold |
| min_tokens_bought | uint256 | Minium amount of Tokens bought |
| deadline | uint256 | Time after which this transaction can no longer be executed |
| recipient | address | The addresss that recieves output Tokens |

| Returns |  |
| :--- | ---: |
| uint256 | Amount of Tokens bought |

### tokenToTokenSwapOutput

Convert Tokens to Tokens

```solidity
function tokenToTokenSwapOutput(address input_token, address output_token, uint256 tokens_bought, uint256 max_tokens_sold, uint256 deadline) public returns (uint256)
```

| Parameter | Type | Description |
| :--- | :--- | ---: |
| input\_token | address | Address of Tokens sold |
| output\_token | address | Address of Tokens bought |
| tokens\_bought | uint256 | Amount of Tokens bought |
| max_tokens_sold | uint256 | Maxium amount of Tokens sold |
| deadline | uint256 | Time after which this transaction can no longer be executed |

| Returns |  |
| :--- | ---: |
| uint256 | Amount of Tokens sold |


### tokenToTokenTransferOutput

Convert Tokens to Tokens and transfers Tokens to recipient.

```solidity
function tokenToTokenTransferOutput(address input_token, address output_token, uint256 tokens_bought, uint256 max_tokens_sold, uint256 deadline, address recipient) public returns (uint256)
```

| Parameter | Type | Description |
| :--- | :--- | ---: |
| input\_token | address | Address of Tokens sold |
| output\_token | address | Address of Tokens bought |
| tokens\_bought | uint256 | Amount of Tokens bought |
| max_tokens_sold | uint256 | Maxium amount of Tokens sold |
| deadline | uint256 | Time after which this transaction can no longer be executed |
| recipient | address | The addresss that recieves output Tokens |

| Returns |  |
| :--- | ---: |
| uint256 | Amount of Tokens sold |


### getUSDXToTokenInputPrice

Public price function for USDX to Token trades with an exact input.

```solidity
function getUSDXToTokenInputPrice(address token, uint256 usdx_sold) public view returns (uint256)
```

| Parameter | Type | Description |
| :--- | :--- | ---: |
| token | address | Address of token bought |
| usdx\_sold | uint256 | Amount of input USDX |

| Returns |  |
| :--- | ---: |
| uint256 | Amount of Tokens that can be bought with input USDX |


### getUSDXToTokenOutputPrice

Public price function for USDX to Token trades with an exact output.

```solidity
function getUSDXToTokenOutputPrice(address token, uint256 tokens_bought) public view returns (uint256)
```

| Parameter | Type | Description |
| :--- | :--- | ---: |
| token | address | Address of token bought |
| tokens\_bought | uint256 | Amount of  output Tokens |

| Returns |  |
| :--- | ---: |
| uint256 | Amount of USDX needed to buy output Tokens |


### getTokenToUSDXInputPrice

Public price function for Token to USDX trades with an exact input.

```solidity
function getTokenToUSDXInputPrice(address token, uint256 tokens_sold) public view returns (uint256)
```

| Parameter | Type | Description |
| :--- | :--- | ---: |
| token | address | Address of token sold |
| tokens\_sold | uint256 | Amount of input Tokens |

| Returns |  |
| :--- | ---: |
| uint256 | Amount of USDX that can be bought with input Tokens |


### getTokenToUSDXOutputPrice

Public price function for Token to USDX trades with an exact output.

```solidity
function getTokenToUSDXOutputPrice(address token, uint256 usdx_bought) public view returns (uint256)
```

| Parameter | Type | Description |
| :--- | :--- | ---: |
| token | address | Address of token sold |
| usdx\_bought | uint256 | Amount of output USDX |

| Returns |  |
| :--- | ---: |
| uint256 | Amount of Tokens needed to buy output USDX |


### addLiquidity

Deposit USDX && Tokens at current ratio to mint liquidity tokens.

```solidity
function addLiquidity(address token, uint256 reserve_added, uint256 min_liquidity, uint256 max_tokens, uint256 deadline) public payable returns (uint256)
```

| Parameter | Type | Description |
| :--- | :--- | ---: |
| token | address | Address of Tokens reserved |
| reserve\_added | uint256 | Amount of USDX reserved |
| min\_liquidity | uint256 | Minium number of liquidity sender will create if total liquidity supply is greater than 0 |
| max\_tokens | uint256 | Maxium number of tokens deposited. Deposits max amount if total liquidity supply is 0. |
| deadline | uint256 | Time after which this transaction can no longer be executed |

| Returns |  |
| :--- | ---: |
| uint256 | Amount of Liquidity created |


### removeLiquidity

Withdraw USDX && Tokens at current ratio to burn liquidity tokens.

```solidity
function removeLiquidity(address token, uint256 amount, uint256 min_USDX, uint256 min_tokens, uint256 deadline) public returns (uint256, uint256)
```

| Parameter | Type | Description |
| :--- | :--- | ---: |
| token | address | Address of Tokens reserved |
| amount | uint256 | Amount of liquidity removed |
| min\_USDX | uint256 | Minium USDX withdrawn |
| min\_tokens | uint256 | Minium Tokens withdrawn |
| deadline | uint256 | Time after which this transaction can no longer be executed |

| Returns |  |
| :--- | ---: |
| uint256 | The amount of USDX withdrawn. |
| uint256 | The amount of Tokens withdrawn |


### setFee

```solidity
function setFee(uint256 new_fee) external onlyAdmin
```

| Parameter | Type | Description |
| :--- | :--- | ---: |
| new\_fee | uint256 | Amount of new fee |


### transferOut

Transfer tokens out from reserve pool

```solidity
function transferOut(address token, address to, uint256 amount) public onlyAdmin
```

| Parameter | Type | Description |
| :--- | :--- | ---: |
| token | address | Address of token reserved |
| to | address | Address received tokens |
| amount | uint256 | Amount transfered out |

### transferIn

Transfer tokens in reserve pool

```solidity
function transferIn(address token, address from, uint256 amount) public onlyAdmin
```

| Parameter | Type | Description |
| :--- | :--- | ---: |
| token | address | Address of token reserved |
| from | address | Address sent tokens |
| amount | uint256 | Amount transfered in |

