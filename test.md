# xSimpleSwap deployment/testing process:

## deploy

1. deploy xSimpleSwap, initiate some token trading pairs
2. deploy dispatcher and target handler of a token
3. call dispatcher `transferOwnership()` function, set xSimpleSwap to new owner address
4. call xSimpleSwap `setDispatcher()` function

## test

1. add/remove liquidity
2. trade within lower/upper bound
3. trade exceed lower/upper bound
4. change dispatcher
5. drain liquidity
