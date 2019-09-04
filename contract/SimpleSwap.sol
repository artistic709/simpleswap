pragma solidity ^0.5.0;

import "ERC1155Adapter-flat.sol";

contract Ownable {
    address public owner;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    /**
     * @dev The Ownable constructor sets the original `owner` of the contract to the sender
     * account.
     */
    constructor() public {
        owner = msg.sender;
    }
    /**
     * @dev Throws if called by any account other than the owner.
     */
    modifier onlyOwner() {
        require(msg.sender == owner);
        _;
    }
    /**
    * @dev Allows the current owner to transfer control of the contract to a newOwner.
    * @param newOwner The address to transfer ownership to.
    */
    function transferOwnership(address newOwner) public onlyOwner {
        require(newOwner != address(0));
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}

contract ERC20{
    function balanceOf(address) external view returns(uint256);
    function transfer(address to, uint256 amount) external returns(bool);
    function transferFrom(address from, address to, uint256 amount) external returns(bool);
}

interface ERC20NonStandard {
    function balanceOf(address owner) external view returns (uint256);
    function transfer(address to, uint256 amount) external;
    function transferFrom(address from, address to, uint256 amount) external;
}


contract SimpleSwap is ERC1155withAdapter, Ownable {
    event TokenPurchase(address indexed buyer, address indexed token, uint256 usdx_sold, uint256 tokens_bought);
    event USDXPurchase(address indexed buyer, address indexed token, uint256 tokens_sold, uint256 usdx_bought);
    event AddLiquidity(address indexed provider, address indexed token, uint256 usdx_amount, uint256 token_amount);
    event RemoveLiquidity(address indexed provider, address indexed token, uint256 usdx_amount, uint256 token_amount);

    //mapping(address => address) public getExchange;
    //mapping(address => address) public getToken;

    mapping(address => uint256) public USDXReserveOf;
    uint256 public feeRate = 3000000000000000;
    address public USDX = address(0xdBCFff49D5F48DDf6e6df1f2C9B96E1FC0F31371);

    /***********************************|
    |        Manager Functions          |
    |__________________________________*/

    function setFee(uint256 newFee) external onlyOwner{
    	require(newFee <= 30000000000000000); //fee must be smaller than 3%
    	feeRate = newFee;
    }

    function createAdapter(uint256 _id, string memory _name, string memory _symbol, uint8 _decimals) public onlyOwner {
        require(adapter[_id] == address(0));
        address a = createClone(template);
        ERC20Adapter(a).setup(_id, _name, _symbol, _decimals);
        adapter[_id] = a;
        emit NewAdapter(_id, a);
    }

    /***********************************|
    |        Exchange Functions         |
    |__________________________________*/

	/**
     * @dev Pricing function for converting between tokens.
     * @param input_amount Amount of Tokens being sold.
     * @param input_reserve Amount of Tokens in exchange reserves.
     * @param output_reserve Amount of Tokens in exchange reserves.
     * @return Amount of Tokens bought.
     */
    function getInputPrice(uint256 input_amount, uint256 input_reserve, uint256 output_reserve) public view returns (uint256) {
        require(input_reserve > 0 && output_reserve > 0);
        uint256 input_amount_with_fee = input_amount.mul(1e18 - feeRate);
        uint256 numerator = input_amount_with_fee.mul(output_reserve);
        uint256 denominator = input_reserve.mul(1e18).add(input_amount_with_fee);
        return numerator / denominator;
    }

    /**
     * @dev Pricing function for converting between Tokens.
     * @param output_amount Amount of Tokens being bought.
     * @param input_reserve Amount of Tokens in exchange reserves.
     * @param output_reserve Amount of Tokens in exchange reserves.
     * @return Amount of Tokens sold.
     */
    function getOutputPrice(uint256 output_amount, uint256 input_reserve, uint256 output_reserve) public view returns (uint256) {
        require(input_reserve > 0 && output_reserve > 0);
        uint256 numerator = input_reserve.mul(output_amount).mul(1e18);
        uint256 denominator = (output_reserve.sub(output_amount)).mul(1e18 - feeRate);
        return (numerator / denominator).add(1);
    }


    function USDXToTokenInput(address token, uint256 USDX_sold, uint256 min_tokens, uint256 deadline, address buyer, address recipient) private returns (uint256) {
        //check if such trading pair exists
        require(totalSupply[uint256(token)] > 0);
        require(deadline >= block.timestamp && USDX_sold > 0 && min_tokens > 0);
        uint256 token_reserve = ERC20(token).balanceOf(address(this));
        uint256 tokens_bought = getInputPrice(USDX_sold, USDXReserveOf[token], token_reserve);
        USDXReserveOf[token] = USDXReserveOf[token].add(USDX_sold);

        require(tokens_bought >= min_tokens);
        require(doTransferIn(USDX, buyer, USDX_sold));
        require(doTransferOut(token, recipient, tokens_bought));
        
        emit TokenPurchase(buyer, token, USDX_sold, tokens_bought);
        return tokens_bought;
    }

    function USDXToTokenSwapInput(address token, uint256 USDX_sold,  uint256 min_tokens, uint256 deadline) public returns (uint256) {
        return USDXToTokenInput(token, USDX_sold, min_tokens, deadline, msg.sender, msg.sender);
    }


    function USDXToTokenTransferInput(address token, uint256 USDX_sold, uint256 min_tokens, uint256 deadline, address recipient) public returns(uint256) {
        require(recipient != address(this) && recipient != address(0));
        return USDXToTokenInput(token, USDX_sold, min_tokens, deadline, msg.sender, recipient);
    }

    function USDXToTokenOutput(address token, uint256 tokens_bought, uint256 max_USDX, uint256 deadline, address  buyer, address recipient) private returns (uint256) {
        //check if such trading pair exists
        require(totalSupply[uint256(token)] > 0);
        require(deadline >= block.timestamp && tokens_bought > 0 && max_USDX > 0);
        uint256 token_reserve = ERC20(token).balanceOf(address(this));
        uint256 USDX_sold = getOutputPrice(tokens_bought, USDXReserveOf[token], token_reserve);
        USDXReserveOf[token] = USDXReserveOf[token].add(USDX_sold);

        require(USDX_sold <= max_USDX);
        require(doTransferIn(USDX, buyer, USDX_sold));
        require(doTransferOut(token, recipient, tokens_bought));

        emit TokenPurchase(buyer, token, USDX_sold, tokens_bought);
        return USDX_sold;
    }


    function USDXToTokenSwapOutput(address token, uint256 tokens_bought, uint256 max_USDX, uint256 deadline) public returns(uint256) {
        return USDXToTokenOutput(token, tokens_bought, max_USDX, deadline, msg.sender, msg.sender);
    }


    function USDXToTokenTransferOutput(address token, uint256 tokens_bought, uint256 max_USDX, uint256 deadline, address recipient) public returns (uint256) {
        require(recipient != address(this) && recipient != address(0));
        return USDXToTokenOutput(token, tokens_bought, max_USDX, deadline, msg.sender, recipient);
    }

    function tokenToUSDXInput(address token, uint256 tokens_sold, uint256 min_USDX, uint256 deadline, address buyer, address recipient) private returns (uint256) {
        //check if such trading pair exists
        require(totalSupply[uint256(token)] > 0);
        require(deadline >= block.timestamp && tokens_sold > 0 && min_USDX > 0);
        uint256 token_reserve = ERC20(token).balanceOf(address(this));
        uint256 USDX_bought = getInputPrice(tokens_sold, token_reserve, USDXReserveOf[token]);
        USDXReserveOf[token] = USDXReserveOf[token].sub(USDX_bought);

        require(USDX_bought >= min_USDX);
        require(doTransferIn(token, buyer, tokens_sold));
        require(doTransferOut(USDX, recipient, USDX_bought));

        emit USDXPurchase(buyer, token, tokens_sold, USDX_bought);
        return USDX_bought;
    }

    function tokenToUSDXSwapInput(address token, uint256 tokens_sold, uint256 min_USDX, uint256 deadline) public returns (uint256) {
        return tokenToUSDXInput(token, tokens_sold, min_USDX, deadline, msg.sender, msg.sender);
    }

    function tokenToUSDXTransferInput(address token, uint256 tokens_sold, uint256 min_USDX, uint256 deadline, address recipient) public returns (uint256) {
        require(recipient != address(this) && recipient != address(0));
        return tokenToUSDXInput(token, tokens_sold, min_USDX, deadline, msg.sender, recipient);
    }

    
    function tokenToUSDXOutput(address token, uint256 USDX_bought, uint256 max_tokens, uint256 deadline, address buyer, address recipient) private returns (uint256) {
        //check if such trading pair exists
        require(totalSupply[uint256(token)] > 0);
        require(deadline >= block.timestamp && USDX_bought > 0);
        uint256 token_reserve = ERC20(token).balanceOf(address(this));
        uint256 tokens_sold = getOutputPrice(USDX_bought, token_reserve, USDXReserveOf[token]);
        USDXReserveOf[token] = USDXReserveOf[token].sub(USDX_bought);

        require(max_tokens >= tokens_sold);
        require(doTransferIn(token, buyer, tokens_sold));
        require(doTransferOut(USDX, recipient, USDX_bought));

        emit USDXPurchase(buyer, token, tokens_sold, USDX_bought);
        return tokens_sold;
    }

    function tokenToUSDXSwapOutput(address token, uint256 USDX_bought, uint256 max_tokens, uint256 deadline) public returns (uint256) {
        return tokenToUSDXOutput(token, USDX_bought, max_tokens, deadline, msg.sender, msg.sender);
    }

    function tokenToUSDXTransferOutput(address token, uint256 USDX_bought, uint256 max_tokens, uint256 deadline, address  recipient) public returns (uint256) {
        require(recipient != address(this) && recipient != address(0));
        return tokenToUSDXOutput(token, USDX_bought, max_tokens, deadline, msg.sender, recipient);
    }

    function tokenToTokenInput(
        address inputToken,
        address outputToken,
        uint256 tokens_sold, 
        uint256 min_tokens_bought,
        uint256 deadline,
        address buyer, 
        address recipient) 
        private returns (uint256) 
    {
        //check if such trading pair exists
        require(totalSupply[uint256(inputToken)] > 0 && totalSupply[uint256(outputToken)] > 0);
        require(deadline >= block.timestamp && tokens_sold > 0 && min_tokens_bought > 0);
        uint256 input_token_reserve = ERC20(inputToken).balanceOf(address(this));
        uint256 USDX_bought = getInputPrice(tokens_sold, input_token_reserve, USDXReserveOf[inputToken]);

        uint256 output_token_reserve = ERC20(outputToken).balanceOf(address(this));
        uint256 token_bought = getInputPrice(USDX_bought, USDXReserveOf[outputToken], output_token_reserve);
        
        // move USDX reserve
        USDXReserveOf[inputToken] = USDXReserveOf[inputToken].sub(USDX_bought);
        USDXReserveOf[outputToken] = USDXReserveOf[outputToken].add(USDX_bought);
        
        // do input/output token transfer
        require(min_tokens_bought <= token_bought);
        require(doTransferIn(inputToken, buyer, tokens_sold));
        require(doTransferOut(outputToken, recipient, token_bought));

        emit USDXPurchase(buyer, inputToken, tokens_sold, USDX_bought);
        emit TokenPurchase(buyer, outputToken, USDX_bought, token_bought);
        return token_bought;
    }

    function tokenToTokenSwapInput(
        address inputToken,
        address outputToken,
        uint256 tokens_sold, 
        uint256 min_tokens_bought,
        uint256 deadline) 
        public returns (uint256) 
    {
        return tokenToTokenInput(inputToken, outputToken, tokens_sold,  min_tokens_bought, deadline, msg.sender, msg.sender); 
    }

    function tokenToTokenTransferInput(
        address inputToken,
        address outputToken,
        uint256 tokens_sold, 
        uint256 min_tokens_bought, 
        uint256 deadline, 
        address recipient) 
        public returns (uint256) 
    {
        return tokenToTokenInput(inputToken, outputToken, tokens_sold,  min_tokens_bought, deadline, msg.sender, recipient); 
    }
    
    function tokenToTokenOutput(
        address inputToken,
        address outputToken,
        uint256 tokens_bought, 
        uint256 max_tokens_sold,
        uint256 deadline, 
        address buyer, 
        address recipient) 
        private returns (uint256) 
    {
        //check if such trading pair exists
        require(totalSupply[uint256(inputToken)] > 0 && totalSupply[uint256(outputToken)] > 0);
        require(deadline >= block.timestamp && tokens_bought > 0);
        uint256 output_token_reserve = ERC20(outputToken).balanceOf(address(this));
        uint256 USDX_bought = getOutputPrice(tokens_bought, USDXReserveOf[outputToken], output_token_reserve);
        
        uint256 input_token_reserve;
        uint256 tokens_sold; 
        (input_token_reserve, tokens_sold) = tokenToTokenOutputHelper(inputToken,USDX_bought);

        // move USDX reserve
        USDXReserveOf[inputToken] = USDXReserveOf[inputToken].sub(USDX_bought);
        USDXReserveOf[outputToken] = USDXReserveOf[outputToken].add(USDX_bought);

        require(max_tokens_sold >= tokens_sold);
        require(doTransferIn(inputToken, buyer, tokens_sold));
        require(doTransferOut(outputToken, recipient, tokens_bought));

        emit USDXPurchase(buyer, inputToken, tokens_sold, USDX_bought);
        emit TokenPurchase(buyer, outputToken, USDX_bought, tokens_bought);
        return tokens_sold;
    }
    
    function tokenToTokenOutputHelper(address inputToken, uint256 USDX_bought) private view returns(uint256, uint256) {
        uint256 input_token_reserve = ERC20(inputToken).balanceOf(address(this));
        uint256 tokens_sold = getOutputPrice(USDX_bought, input_token_reserve, USDXReserveOf[inputToken]);
        return (input_token_reserve, tokens_sold);
    }

    function tokenToTokenSwapOutput(
        address inputToken,
        address outputToken,
        uint256 tokens_bought, 
        uint256 max_tokens_sold,
        uint256 deadline) 
        public returns (uint256) 
    {
        return tokenToTokenOutput(inputToken, outputToken, tokens_bought, max_tokens_sold, deadline, msg.sender, msg.sender);
    }


    function tokenToTokenTransferOutput(
        address inputToken,
        address outputToken,
        uint256 tokens_bought, 
        uint256 max_tokens_sold,
        uint256 deadline, 
        address recipient) 
        public returns (uint256) 
    {

        return tokenToTokenOutput(inputToken, outputToken, tokens_bought, max_tokens_sold, deadline, msg.sender, recipient);
    }

    
    /***********************************|
    |         Getter Functions          |
    |__________________________________*/

    /**
     * @notice Public price function for USDX to Token trades with an exact input.
     * @param token address of token to buy.
     * @param usdx_sold Amount of ETH sold.
     * @return Amount of Tokens that can be bought with input USDX.
     */
    function getUSDXToTokenInputPrice(address token, uint256 usdx_sold) public view returns (uint256) {
        require(usdx_sold > 0);
        uint256 token_reserve = ERC20(token).balanceOf(address(this));
        return getInputPrice(usdx_sold, USDXReserveOf[token], token_reserve);
    }

    /**
     * @notice Public price function for USDX to Token trades with an exact output.
     * @param token address of token to buy.
     * @param tokens_bought Amount of Tokens bought.
     * @return Amount of USDX needed to buy output Tokens.
     */
    function getUSDXToTokenOutputPrice(address token, uint256 tokens_bought) public view returns (uint256) {
        require(tokens_bought > 0);
        uint256 token_reserve = ERC20(token).balanceOf(address(this));
        return getOutputPrice(tokens_bought, USDXReserveOf[token], token_reserve);
    }

    /**
     * @notice Public price function for Token to USDX trades with an exact input.
     * @param token address of token to sell.
     * @param tokens_sold Amount of Tokens sold.
     * @return Amount of USDX that can be bought with input Tokens.
     */
    function getTokenToUSDXInputPrice(address token, uint256 tokens_sold) public view returns (uint256) {
        require(tokens_sold > 0);
        uint256 token_reserve = ERC20(token).balanceOf(address(this));
        return getInputPrice(tokens_sold, token_reserve, USDXReserveOf[token]);
    }

    /**
     * @notice Public price function for Token to ETH trades with an exact output.
     * @param token address of token to sell.
     * @param usdx_bought Amount of output ETH.
     * @return Amount of Tokens needed to buy output ETH.
     */
    function getTokenToUSDXOutputPrice(address token, uint256 usdx_bought) public view returns (uint256) {
        require(usdx_bought > 0);
        uint256 token_reserve = ERC20(token).balanceOf(address(this));
        return getOutputPrice(usdx_bought, token_reserve, USDXReserveOf[token]);
    }



    /***********************************|
    |        Liquidity Functions        |
    |__________________________________*/

    function addLiquidity(address token, uint256 reserveAdded, uint256 min_liquidity, uint256 max_tokens, uint256 deadline) public payable returns (uint256) {
        require(deadline >= block.timestamp && max_tokens > 0 && reserveAdded > 0);
        uint256 total_liquidity = totalSupply[uint256(token)];

        if (total_liquidity > 0) {
            require(min_liquidity > 0);
            uint256 token_reserve = ERC20(token).balanceOf(address(this));
            uint256 token_amount = (reserveAdded.mul(token_reserve) / USDXReserveOf[token]).add(1);
            uint256 liquidity_minted = reserveAdded.mul(total_liquidity) / USDXReserveOf[token];
            require(max_tokens >= token_amount && liquidity_minted >= min_liquidity);
            balances[uint256(token)][msg.sender] = balances[uint256(token)][msg.sender].add(liquidity_minted);
            totalSupply[uint256(token)] = total_liquidity.add(liquidity_minted);
            USDXReserveOf[token] = USDXReserveOf[token].add(reserveAdded);

            require(doTransferIn(token, msg.sender, token_amount));
            require(doTransferIn(USDX, msg.sender, reserveAdded));

            emit AddLiquidity(msg.sender, token, reserveAdded, token_amount);
            emit TransferSingle(msg.sender, address(0), msg.sender, uint256(token), liquidity_minted);
            return liquidity_minted;

        } else {
            require(reserveAdded >= 1000000000);
            uint256 token_amount = max_tokens;
            uint256 initial_liquidity = reserveAdded;

            totalSupply[uint256(token)] = initial_liquidity;
            balances[uint256(token)][msg.sender] = initial_liquidity;
            USDXReserveOf[token] = USDXReserveOf[token].add(reserveAdded);

            require(doTransferIn(token, msg.sender, token_amount));
            require(doTransferIn(USDX, msg.sender, reserveAdded));

            emit AddLiquidity(msg.sender, token, reserveAdded, token_amount);
            emit TransferSingle(msg.sender, address(0), msg.sender, uint256(token), initial_liquidity);
            return initial_liquidity;
        }
    }

    function removeLiquidity(address token, uint256 amount, uint256 min_USDX, uint256 min_tokens, uint256 deadline) public returns (uint256, uint256) {
        require(amount > 0 && deadline >= block.timestamp && min_USDX > 0 && min_tokens > 0);
        uint256 total_liquidity = totalSupply[uint256(token)];
        require(total_liquidity > 0);
        uint256 token_reserve = ERC20(token).balanceOf(address(this));
        uint256 USDX_amount = amount.mul(USDXReserveOf[token]) / total_liquidity;
        uint256 token_amount = amount.mul(token_reserve) / total_liquidity;
        require(USDX_amount >= min_USDX && token_amount >= min_tokens);

        balances[uint256(token)][msg.sender] = balances[uint256(token)][msg.sender].sub(amount);
        totalSupply[uint256(token)] = total_liquidity.sub(amount);

        require(doTransferOut(token, msg.sender, token_amount));
        require(doTransferOut(USDX, msg.sender, USDX_amount));

        emit RemoveLiquidity(msg.sender, token, USDX_amount, token_amount);
        emit TransferSingle(msg.sender, msg.sender, address(0), uint256(token), amount);
        return (USDX_amount, token_amount);
    }

    /***********************************|
    |         SAFT Token Transfer       |
    |__________________________________*/

    function doTransferIn(address tokenAddr, address from, uint amount) internal returns (bool result) {
        ERC20NonStandard token = ERC20NonStandard(tokenAddr);
        token.transferFrom(from, address(this), amount);

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

    }

    function doTransferOut(address tokenAddr, address to, uint amount) internal returns (bool result) {
        ERC20NonStandard token = ERC20NonStandard(tokenAddr);
        token.transfer(to, amount);

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

    }

}