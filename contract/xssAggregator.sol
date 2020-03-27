pragma solidity ^0.5.16;

interface ERC20NonStandard {
    function balanceOf(address owner) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint);
    function transfer(address to, uint256 amount) external;
    function transferFrom(address from, address to, uint256 amount) external;
    function approve(address spender, uint256 amount) external;
}

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
    
    uint256 constant MAX_UINT = 2**256 - 1;

    function tradeInput(address exchange, address fromToken, uint256 fromAmount, address toToken, uint256 minReceived, uint256 deadline, address recipient) public returns(uint256) {
        uint256 amount;
        address coin = xssInterface(exchange).coin();
        ERC20NonStandard _fromToken = ERC20NonStandard(fromToken);
        
        _fromToken.transferFrom(msg.sender, address(this), fromAmount);
        
        if (_fromToken.allowance(address(this), exchange) < fromAmount) {
            _fromToken.approve(exchange, MAX_UINT);
        }
        
        if(coin == fromToken) {
            amount = xssInterface(exchange).CoinToTokenTransferInput(toToken, fromAmount, minReceived, deadline, recipient);
        }
        else if(coin == toToken) {
            amount = xssInterface(exchange).tokenToCoinTransferInput(fromToken, fromAmount, minReceived, deadline, recipient);
        }
        else {
            amount = xssInterface(exchange).tokenToTokenTransferInput(fromToken, toToken, fromAmount, minReceived, deadline, recipient);
        }
        
        return amount;
    }

    function tradeOutput(address exchange, address fromToken, uint256 maxSpent, address toToken, uint256 toAmount, uint256 deadline, address recipient) public returns(uint256) {
        uint256 amount;
        address coin = xssInterface(exchange).coin();
        ERC20NonStandard _fromToken = ERC20NonStandard(fromToken);
        
        _fromToken.transferFrom(msg.sender, address(this), maxSpent);
        
        if (_fromToken.allowance(address(this), exchange) < maxSpent) {
            _fromToken.approve(exchange, MAX_UINT);
        }
        
        if(coin == fromToken) {
            amount = xssInterface(exchange).CoinToTokenTransferOutput(toToken, toAmount, maxSpent, deadline, recipient);
        }
        else if(coin == toToken) {
            amount = xssInterface(exchange).tokenToCoinTransferOutput(fromToken, toAmount, maxSpent, deadline, recipient);
        }
        else {
            amount = xssInterface(exchange).tokenToTokenTransferOutput(fromToken, toToken, toAmount, maxSpent, deadline, recipient);
        }
        
        _fromToken.transfer(msg.sender, _fromToken.balanceOf(address(this)));
        return amount;
    }
    
    function doApproval(address tokenAddr, address spender, uint amount) internal returns(bool result) {
        ERC20NonStandard token = ERC20NonStandard(tokenAddr);
        token.approve(spender, amount);

        assembly {
            switch returndatasize()
                case 0 {                      // This is a non-standard ERC-20
                    result := not(0)          // set result to true
                }
                case 32 {                     // This is a complaint ERC-20
                    returndatacopy(0, 0, 32)
                    result := mload(0)        // Set `result = returndata` of external call
                }
                default {                     // This is an excessively non-compliant ERC-20, revert.
                    revert(0, 0)
                }
        }
        
        return true;
    }
}
