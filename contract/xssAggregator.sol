pragma solidity ^0.5.16;

contract xssInterface {

    function coin() public returns(address);

    function CoinToTokenTransferInput(address token, uint256 coin_sold, uint256 min_tokens, uint256 deadline, address recipient) public returns(uint256);

    function CoinToTokenTransferOutput(address token, uint256 tokens_bought, uint256 max_coin, uint256 deadline, address recipient) public returns (uint256);

    function tokenToCoinTransferInput(address token, uint256 tokens_sold, uint256 min_coin, uint256 deadline, address recipient) public returns (uint256);

    function tokenToCoinTransferOutput(address token, uint256 coin_bought, uint256 max_tokens, uint256 deadline, address  recipient) public returns (uint256);

    function tokenToTokenTransferInput(
        address input_token,
        address output_token,
        uint256 tokens_sold,
        uint256 min_tokens_bought,
        uint256 deadline,
        address recipient)
        public returns (uint256);
    function tokenToTokenTransferOutput(
        address input_token,
        address output_token,
        uint256 tokens_bought,
        uint256 max_tokens_sold,
        uint256 deadline,
        address recipient)
        public returns (uint256);
}

contract xssAggregator {

    function tradeInput(address exchange, address fromToken, uint256 fromAmount, address toToken, uint256 minReceived, uint256 deadline, address recipient) public returns(uint256) {
        address coin = xssInterface(exchange).coin();
        if(coin == fromToken) {
            return xssInterface(exchange).CoinToTokenTransferInput(toToken, fromAmount, minReceived, deadline, recipient);
        }
        else if(coin == toToken) {
            return xssInterface(exchange).tokenToCoinTransferInput(fromToken, fromAmount, minReceived, deadline, recipient);
        }
        else {
            return xssInterface(exchange).tokenToTokenTransferInput(fromToken, toToken, fromAmount, minReceived, deadline, recipient);
        }
    }

    function tradeOutput(address exchange, address fromToken, uint256 maxSpent, address toToken, uint256 toAmount, uint256 deadline, address recipient) public returns(uint256) {
        address coin = xssInterface(exchange).coin();
        if(coin == fromToken) {
            return xssInterface(exchange).CoinToTokenTransferOutput(toToken, toAmount, maxSpent, deadline, recipient);
        }
        else if(coin == toToken) {
            return xssInterface(exchange).tokenToCoinTransferOutput(fromToken, toAmount, maxSpent, deadline, recipient);
        }
        else {
            return xssInterface(exchange).tokenToTokenTransferOutput(fromToken, toToken, toAmount, maxSpent, deadline, recipient);
        }
    }
}